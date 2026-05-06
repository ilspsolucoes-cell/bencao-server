// netlify/functions/db.js
// Banco de dados centralizado usando Netlify Blobs
// Todas as operações de usuários passam por aqui

const { getStore } = require('@netlify/blobs');

const ADMIN_PASS = process.env.ADMIN_PASS || 'BencaoDia@2025!';

function getUsuariosStore() {
  return getStore({ name: 'usuarios', consistency: 'strong' });
}

function getCodigosStore() {
  return getStore({ name: 'codigos', consistency: 'strong' });
}

function getSessoesStore() {
  return getStore({ name: 'sessoes', consistency: 'strong' });
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

    const usuarios = getUsuariosStore();
    const codigos = getCodigosStore();
    const sessoes = getSessoesStore();

    // ── LOGIN ──
    if (acao === 'login') {
      const raw = await usuarios.get(email, { type: 'json' }).catch(() => null);
      if (!raw) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      if (raw.plano === 'Bloqueado') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bloqueado', bloqueado: true }) };
      if (raw.pendente) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Pendente', pendente: true }) };
      if (raw.senha !== btoa_node(senha)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Senha incorreta' }) };

      // Verifica sessão ativa
      const sessaoAtual = await sessoes.get(email, { type: 'json' }).catch(() => null);
      if (sessaoAtual && sessaoAtual.sessaoId !== sessaoId) {
        const diff = (Date.now() - (sessaoAtual.ts || 0)) / 1000;
        if (diff < 86400) { // 24h
          return { statusCode: 409, headers, body: JSON.stringify({ error: 'Sessão ativa', sessaoAtiva: true, device: sessaoAtual.device || 'outro dispositivo' }) };
        }
      }

      // Salva nova sessão
      const sid = Math.random().toString(36).substr(2) + Date.now().toString(36);
      await sessoes.set(email, JSON.stringify({ sessaoId: sid, ts: Date.now(), device: body.device || 'desconhecido' }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuario: { ...raw, senha: undefined }, sessaoId: sid }) };
    }

    // ── CADASTRO — envia código ──
    if (acao === 'cadastrar') {
      const existente = await usuarios.get(email, { type: 'json' }).catch(() => null);
      if (existente && !existente.pendente) return { statusCode: 409, headers, body: JSON.stringify({ error: 'E-mail já cadastrado' }) };

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const ts = new Date().toISOString();
      await codigos.set(`cadastro_${email}`, JSON.stringify({ code, expires: Date.now() + 15 * 60 * 1000, senha, ts }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, code_debug: process.env.NODE_ENV !== 'production' ? code : undefined }) };
    }

    // ── CONFIRMAR CÓDIGO ──
    if (acao === 'confirmar') {
      const raw = await codigos.get(`cadastro_${email}`, { type: 'json' }).catch(() => null);
      if (!raw) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código não encontrado. Solicite um novo.' }) };
      if (Date.now() > raw.expires) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado. Solicite um novo.' }) };
      if (raw.code !== codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código incorreto.' }) };

      // Cria conta
      const ts = new Date().toISOString();
      const usuario = { nome: email.split('@')[0], senha: raw.senha, plano: 'Trial', trialStart: ts, pendente: false, criadoEm: ts };
      await usuarios.set(email, JSON.stringify(usuario));
      await codigos.delete(`cadastro_${email}`).catch(() => {});

      // Cria sessão
      const sid = Math.random().toString(36).substr(2) + Date.now().toString(36);
      await sessoes.set(email, JSON.stringify({ sessaoId: sid, ts: Date.now(), device: body.device || 'desconhecido' }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuario, sessaoId: sid }) };
    }

    // ── VERIFICAR SESSÃO ──
    if (acao === 'verificar_sessao') {
      const usuario = await usuarios.get(email, { type: 'json' }).catch(() => null);
      if (!usuario) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Não encontrado' }) };
      if (usuario.plano === 'Bloqueado') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bloqueado', bloqueado: true }) };

      const sessaoAtual = await sessoes.get(email, { type: 'json' }).catch(() => null);
      if (sessaoAtual && sessaoAtual.sessaoId !== sessaoId) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Sessão inválida', sessaoInvalida: true }) };
      }

      // Atualiza timestamp
      if (sessaoAtual) {
        sessaoAtual.ts = Date.now();
        await sessoes.set(email, JSON.stringify(sessaoAtual));
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, plano: usuario.plano }) };
    }

    // ── LOGOUT ──
    if (acao === 'logout') {
      await sessoes.delete(email).catch(() => {});
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── ADMIN: listar usuários ──
    if (acao === 'admin_listar') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      const { blobs } = await usuarios.list();
      const lista = [];
      for (const blob of blobs) {
        const u = await usuarios.get(blob.key, { type: 'json' }).catch(() => null);
        if (u) lista.push({ email: blob.key, ...u, senha: undefined });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, usuarios: lista }) };
    }

    // ── ADMIN: atualizar usuário ──
    if (acao === 'admin_atualizar') {
      if (body.adminPass !== ADMIN_PASS) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      const u = await usuarios.get(email, { type: 'json' }).catch(() => null);
      if (!u) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      u.plano = plano || u.plano;
      if (obs !== undefined) u.obs = obs;
      await usuarios.set(email, JSON.stringify(u));
      // Se bloqueou, encerra sessão
      if (plano === 'Bloqueado') await sessoes.delete(email).catch(() => {});
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── RECUPERAR SENHA — enviar código ──
    if (acao === 'recuperar_enviar') {
      const u = await usuarios.get(email, { type: 'json' }).catch(() => null);
      if (!u) return { statusCode: 404, headers, body: JSON.stringify({ error: 'E-mail não cadastrado.' }) };
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await codigos.set(`recuperar_${email}`, JSON.stringify({ code, expires: Date.now() + 15 * 60 * 1000 }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, code }) };
    }

    // ── RECUPERAR SENHA — redefinir ──
    if (acao === 'recuperar_redefinir') {
      const raw = await codigos.get(`recuperar_${email}`, { type: 'json' }).catch(() => null);
      if (!raw) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código não encontrado.' }) };
      if (Date.now() > raw.expires) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado.' }) };
      if (raw.code !== codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código incorreto.' }) };
      const u = await usuarios.get(email, { type: 'json' }).catch(() => null);
      if (u) { u.senha = btoa_node(body.novaSenha); await usuarios.set(email, JSON.stringify(u)); }
      await codigos.delete(`recuperar_${email}`).catch(() => {});
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ação inválida' }) };

  } catch (e) {
    console.error('DB erro:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

function btoa_node(str) {
  return Buffer.from(str || '').toString('base64');
}
