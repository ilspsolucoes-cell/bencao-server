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
      if (s) { s.ts = Date.now(); await salvarDB(db); }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, plano: u.plano }) };
    }

    // ── LOGOUT ──
    if (acao === 'logout') {
      delete db.sessoes[email];
      await salvarDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── ADMIN: listar ──
    if (acao === 'admin_listar') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      const lista = Object.entries(db.usuarios).map(([em, u]) => ({ email: em, ...u, senha: undefined }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuarios: lista }) };
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
