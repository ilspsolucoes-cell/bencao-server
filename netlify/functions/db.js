// netlify/functions/db.js
// Banco centralizado usando KV Store simples via fetch
// Usa JSONBin.io (gratuito, sem instalação)

const JSONBIN_KEY = process.env.JSONBIN_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const ADMIN_PASS = process.env.ADMIN_PASS || 'BencaoDia@2025!';

const BASE_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

async function lerDB() {
  try {
    const res = await fetch(`${BASE_URL}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await res.json();
    return data.record || { usuarios: {}, codigos: {}, sessoes: {} };
  } catch(e) {
    return { usuarios: {}, codigos: {}, sessoes: {} };
  }
}

async function salvarDB(db) {
  await fetch(BASE_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
    body: JSON.stringify(db)
  });
}

function btoa_node(str) {
  return Buffer.from(str || '').toString('base64');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { acao, email, senha, plano, obs, sessaoId, codigo } = body;

    const db = await lerDB();
    if (!db.usuarios) db.usuarios = {};
    if (!db.codigos) db.codigos = {};
    if (!db.sessoes) db.sessoes = {};

    // ── LOGIN ──
    if (acao === 'login') {
      const u = db.usuarios[email];
      if (!u) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      if (u.plano === 'Bloqueado') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bloqueado', bloqueado: true }) };
      if (u.pendente) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Pendente', pendente: true }) };
      if (u.senha !== btoa_node(senha)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Senha incorreta' }) };

      // Verifica expiração da cortesia
      if (u.plano === 'Cortesia' && u.cortesiaExpires) {
        if (new Date() > new Date(u.cortesiaExpires)) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Seu acesso de cortesia expirou. Assine um plano para continuar.', cortesiaExpirada: true }) };
        }
      }

      // Verifica sessão ativa
      const s = db.sessoes[email];
      if (s && s.sessaoId !== sessaoId) {
        const diff = (Date.now() - (s.ts || 0)) / 1000 / 60 / 60;
        if (diff < 24) {
          return { statusCode: 409, headers, body: JSON.stringify({ error: 'Sessão ativa', sessaoAtiva: true, device: s.device || 'outro dispositivo' }) };
        }
      }

      const sid = Math.random().toString(36).substr(2) + Date.now().toString(36);
      db.sessoes[email] = { sessaoId: sid, ts: Date.now(), device: body.device || 'desconhecido' };
      await salvarDB(db);

      const { senha: _, ...usuarioSemSenha } = u;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuario: usuarioSemSenha, sessaoId: sid }) };
    }

    // ── SALVAR CÓDIGO ──
    if (acao === 'salvar_codigo') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      if (!db.codigos) db.codigos = {};
      db.codigos[body.code] = body.dados;
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── LISTAR CÓDIGOS ──
    if (acao === 'listar_codigos') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, codigos: db.codigos || {} }) };
    }

    // ── BUSCAR CÓDIGO ESPECÍFICO ──
    if (acao === 'buscar_codigo') {
      const c = db.codigos?.[body.code];
      if (!c) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Código não encontrado' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, codigo: c }) };
    }

    // ── USAR CÓDIGO (marcar uso) ──
    if (acao === 'usar_codigo') {
      const c = db.codigos?.[body.code];
      if (!c) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Código não encontrado' }) };
      db.codigos[body.code].usosUsados = (c.usosUsados || 0) + 1;
      if (c.singleUse || (c.usosMax || 1) === 1) db.codigos[body.code].used = true;
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── DEBUG ──
    if (acao === 'debug') {
      const hasKey = !!JSONBIN_KEY;
      const hasBin = !!JSONBIN_BIN_ID;
      let dbStatus = 'erro';
      let dbData = null;
      try {
        const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
          headers: { 'X-Master-Key': JSONBIN_KEY }
        });
        dbData = await res.json();
        dbStatus = res.ok ? 'ok' : `erro_${res.status}`;
      } catch(e) {
        dbStatus = 'excecao: ' + e.message;
      }
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ hasKey, hasBin, dbStatus, record_keys: dbData?.record ? Object.keys(dbData.record) : null })
      };
    }

    // ── CADASTRAR com envio de e-mail ──
    if (acao === 'cadastrar_com_email') {
      if (db.usuarios[email] && !db.usuarios[email].pendente) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'E-mail já cadastrado' }) };
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      db.codigos[`cad_${email}`] = { code, expires: Date.now() + 15 * 60 * 1000, senha };
      await salvarDB(db);

      // Envia e-mail via Resend
      try {
        const RESEND_KEY = process.env.RESEND_API_KEY;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Bênção do Dia <noreply@bencaododia.app.br>',
            to: [email],
            subject: '✅ Confirme seu cadastro — Bênção do Dia',
            html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f9f5ef;border-radius:12px">
              <h1 style="font-family:Georgia,serif;color:#c9a84c;font-size:28px;text-align:center">✝️ Bênção do Dia</h1>
              <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e8d49a;margin-top:20px">
                <h2 style="color:#2a1a10">Confirme seu cadastro</h2>
                <p style="color:#5a4030;font-size:15px">Use o código abaixo para ativar sua conta. Válido por <strong>15 minutos</strong>.</p>
                <div style="text-align:center;margin:24px 0">
                  <div style="background:#0f0d0a;color:#c9a84c;font-size:36px;font-weight:800;letter-spacing:10px;padding:20px;border-radius:10px;display:inline-block">${code}</div>
                </div>
              </div>
              <p style="text-align:center;color:#8a8070;font-size:12px;margin-top:20px">🙏 Paz e Bem! — Bênção do Dia</p>
            </div>`
          }),
        });
      } catch(emailErr) {
        console.error('Erro ao enviar email:', emailErr.message);
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── CADASTRAR — gera código sem e-mail ──
    if (acao === 'cadastrar') {
      if (db.usuarios[email] && !db.usuarios[email].pendente) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'E-mail já cadastrado' }) };
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      db.codigos[`cad_${email}`] = { code, expires: Date.now() + 15 * 60 * 1000, senha };
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── CONFIRMAR CÓDIGO ──
    if (acao === 'confirmar') {
      const c = db.codigos[`cad_${email}`];
      if (!c) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código não encontrado. Solicite um novo.' }) };
      if (Date.now() > c.expires) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado. Solicite um novo.' }) };
      if (c.code !== codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código incorreto.' }) };

      const ts = new Date().toISOString();
      db.usuarios[email] = { nome: email.split('@')[0], senha: c.senha, plano: 'Trial', trialStart: ts, pendente: false, criadoEm: ts };
      delete db.codigos[`cad_${email}`];
      const sid = Math.random().toString(36).substr(2) + Date.now().toString(36);
      db.sessoes[email] = { sessaoId: sid, ts: Date.now(), device: body.device || 'desconhecido' };
      await salvarDB(db);

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuario: db.usuarios[email], sessaoId: sid }) };
    }

    // ── VERIFICAR SESSÃO ──
    if (acao === 'verificar_sessao') {
      const u = db.usuarios[email];
      if (!u) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Não encontrado' }) };
      if (u.plano === 'Bloqueado') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bloqueado', bloqueado: true }) };
      const s = db.sessoes[email];
      if (s && s.sessaoId !== sessaoId) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Sessão inválida', sessaoInvalida: true }) };
      }
      // Atualiza timestamp da sessão
      if (s) { s.ts = Date.now(); await salvarDB(db); }
      // Retorna plano e dados atualizados do servidor
      return { statusCode: 200, headers, body: JSON.stringify({
        success: true,
        plano: u.plano,
        cortesiaExpires: u.cortesiaExpires || null,
        trialStart: u.trialStart || null
      })};
    }

    // ── LOGOUT ──
    if (acao === 'logout') {
      delete db.sessoes[email];
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── ENVIAR MENSAGEM DE SUPORTE ──
    if (acao === 'enviar_mensagem') {
      if (!db.mensagens) db.mensagens = [];
      db.mensagens.push({
        email: body.email,
        nome: body.nome,
        plano: body.plano,
        assunto: body.assunto,
        mensagem: body.mensagem,
        ts: body.ts || new Date().toISOString(),
        lida: false,
        resposta: null,
        respostaTs: null,
        respostaLida: false,
        thread: []
      });
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── LISTAR MENSAGENS (admin) ──
    if (acao === 'listar_mensagens') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, mensagens: db.mensagens || [] }) };
    }

    // ── MINHAS MENSAGENS (usuário) ──
    if (acao === 'minhas_mensagens') {
      const minhas = (db.mensagens || []).filter(m => m.email === email);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, mensagens: minhas }) };
    }

    // ── ADMIN RESPONDER MENSAGEM ──
    if (acao === 'responder_mensagem') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      if (!db.mensagens || db.mensagens[body.idx] === undefined) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Mensagem não encontrada' }) };
      const msg = db.mensagens[body.idx];
      if (!msg.resposta) {
        // Primeira resposta
        msg.resposta = body.resposta;
        msg.respostaTs = body.ts || new Date().toISOString();
        msg.respostaLida = false;
        msg.lida = true;
      } else {
        // Resposta adicional (thread)
        if (!msg.thread) msg.thread = [];
        msg.thread.push({ de: 'admin', texto: body.resposta, ts: body.ts || new Date().toISOString() });
        msg.respostaLida = false;
      }
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── USUÁRIO RESPONDER NA THREAD ──
    if (acao === 'resposta_usuario') {
      const minhas = (db.mensagens || []);
      // Encontra a mensagem pelo email e idx nas mensagens do usuário
      const userMsgs = minhas.filter(m => m.email === email);
      const msg = userMsgs[body.idx];
      const globalIdx = minhas.indexOf(msg);
      if (globalIdx === -1) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Não encontrado' }) };
      if (!minhas[globalIdx].thread) minhas[globalIdx].thread = [];
      minhas[globalIdx].thread.push({ de: 'usuario', texto: body.texto, ts: body.ts || new Date().toISOString() });
      minhas[globalIdx].lida = false; // Admin verá como nova
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── MARCAR RESPOSTA COMO LIDA (usuário) ──
    if (acao === 'marcar_resposta_lida') {
      const userMsgs = (db.mensagens || []).filter(m => m.email === email);
      const msg = userMsgs[body.idx];
      const globalIdx = (db.mensagens || []).indexOf(msg);
      if (globalIdx !== -1) {
        db.mensagens[globalIdx].respostaLida = true;
        await salvarDB(db);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── MARCAR LIDA (admin) ──
    if (acao === 'marcar_lida') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      if (db.mensagens && db.mensagens[body.idx] !== undefined) {
        db.mensagens[body.idx].lida = true;
        await salvarDB(db);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── SALVAR CORTESIA (acesso via código) ──
    if (acao === 'salvar_cortesia') {
      const ts = new Date().toISOString();
      const sid = Math.random().toString(36).substr(2) + Date.now().toString(36);
      db.usuarios[email] = {
        nome: email.split('@')[0],
        senha: body.senha,
        plano: 'Cortesia',
        trialStart: null,
        cortesiaExpires: body.cortesiaExpires,
        diasAcesso: body.diasAcesso,
        pendente: false,
        criadoEm: db.usuarios[email]?.criadoEm || ts
      };
      db.sessoes[email] = { sessaoId: sid, ts: Date.now(), device: body.device || 'desconhecido' };
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, sessaoId: sid }) };
    }

    // ── ADMIN: listar ──
    if (acao === 'admin_listar') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      const lista = Object.entries(db.usuarios).map(([em, u]) => ({ email: em, ...u, senha: undefined }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuarios: lista }) };
    }

    // ── ADMIN: listar códigos ──
    if (acao === 'admin_listar_codigos') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      // Filtra só códigos de cortesia (não cadastro/recuperação)
      const codigos_cortesia = Object.entries(db.codigos)
        .filter(([k]) => k.startsWith('BENCAO-'))
        .map(([k, v]) => ({ code: k, ...v }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, codigos: codigos_cortesia }) };
    }

    // ── ADMIN: gerar código de cortesia ──
    if (acao === 'admin_gerar_codigo') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      const days = body.days || 30;
      const usosMax = body.usosMax || 1;
      const code = 'BENCAO-' + Math.random().toString(36).substr(2,4).toUpperCase() + '-' + Math.random().toString(36).substr(2,4).toUpperCase();
      const expires = new Date(Date.now() + days*24*60*60*1000).toISOString();
      db.codigos[code] = { expires, days, usosMax, usosUsados: 0, singleUse: usosMax===1, createdAt: new Date().toISOString() };
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, code }) };
    }

    // ── VERIFICAR código de cortesia ──
    if (acao === 'verificar_codigo_cortesia') {
      const c = db.codigos?.[body.code];
      if (!c) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Código inválido. Verifique e tente novamente.' }) };
      if (c.used && c.singleUse) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Este código já foi utilizado.' }) };
      if ((c.usosUsados||0) >= (c.usosMax||1) && (c.usosMax||1) !== 999) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código esgotado.' }) };
      if (new Date() > new Date(c.expires)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado.' }) };
      // Marca uso
      db.codigos[body.code].usosUsados = (c.usosUsados||0) + 1;
      if (c.singleUse || (c.usosMax||1) === 1) db.codigos[body.code].used = true;
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, days: c.days||30 }) };
    }

    // ── ADMIN: atualizar ──
    if (acao === 'admin_atualizar') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      if (!db.usuarios[email]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Não encontrado' }) };
      if (plano) db.usuarios[email].plano = plano;
      if (obs !== undefined) db.usuarios[email].obs = obs;
      if (plano === 'Bloqueado') delete db.sessoes[email];
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── RECUPERAR SENHA — enviar ──
    if (acao === 'recuperar_enviar') {
      if (!db.usuarios[email]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'E-mail não cadastrado.' }) };
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      db.codigos[`rec_${email}`] = { code, expires: Date.now() + 15 * 60 * 1000 };
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, code }) };
    }

    // ── RECUPERAR SENHA — redefinir ──
    if (acao === 'recuperar_redefinir') {
      const c = db.codigos[`rec_${email}`];
      if (!c) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código não encontrado.' }) };
      if (Date.now() > c.expires) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado.' }) };
      if (c.code !== codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código incorreto.' }) };
      db.usuarios[email].senha = btoa_node(body.novaSenha);
      delete db.codigos[`rec_${email}`];
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ação inválida' }) };

  } catch (e) {
    console.error('DB erro:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
