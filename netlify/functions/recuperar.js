// netlify/functions/recuperar.js
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const codigos = global._codigos || (global._codigos = {});

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { acao, contato, codigo } = body;

    // ── ENVIAR SENHA PROVISÓRIA (código de cortesia) ──
    if (acao === 'enviar_senha_provisoria') {
      const dias = body.dias || 30;
      const senha = body.senha || '????';

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Bênção do Dia <noreply@bencaododia.app.br>',
          to: [contato],
          subject: '🎁 Seu acesso ao Bênção do Dia foi liberado!',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f9f5ef;border-radius:12px">
              <h1 style="font-family:Georgia,serif;color:#c9a84c;font-size:28px;text-align:center;margin-bottom:4px">✝️ Bênção do Dia</h1>
              <p style="color:#8a8070;font-size:13px;text-align:center;margin-top:0">Cards Católicos para WhatsApp</p>
              <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e8d49a;margin-top:20px">
                <h2 style="color:#2a1a10;font-size:18px;margin-top:0">🎁 Seu acesso foi liberado!</h2>
                <p style="color:#5a4030;font-size:15px;line-height:1.6">
                  Seu código de cortesia foi aplicado com sucesso!<br>
                  Você tem <strong>${dias} dias</strong> de acesso gratuito ao Bênção do Dia.
                </p>
                <div style="background:#f5f0e8;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e8d49a">
                  <p style="margin:0 0 8px 0;font-size:14px;color:#5a4030;font-weight:bold">Seus dados de acesso:</p>
                  <p style="margin:4px 0;font-size:14px;color:#333">📧 <strong>E-mail:</strong> ${contato}</p>
                  <p style="margin:4px 0;font-size:14px;color:#333">🔑 <strong>Senha provisória:</strong>
                    <span style="font-size:20px;font-weight:800;letter-spacing:3px;color:#c9a84c"> ${senha}</span>
                  </p>
                </div>
                <p style="color:#5a4030;font-size:14px;line-height:1.6">
                  Para acessar o app novamente, use seu e-mail e esta senha em:<br>
                  <a href="https://bencaododia.app.br" style="color:#c9a84c;font-weight:bold">bencaododia.app.br</a>
                </p>
                <p style="color:#8a8070;font-size:12px;margin-top:16px">
                  💡 Dica: você pode alterar sua senha a qualquer momento clicando em "Esqueci minha senha".
                </p>
              </div>
              <p style="text-align:center;color:#8a8070;font-size:12px;margin-top:20px">🙏 Paz e Bem! — Bênção do Dia</p>
            </div>`
        }),
      });

      const data = await res.json();
      if (res.ok) return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      throw new Error(data?.message || 'Erro ao enviar e-mail');
    }

    // ── ENVIAR CÓDIGO EXTERNO (gerado pelo db.js) ──
    if (acao === 'enviar_codigo_externo') {
      if (!contato || !body.codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Dados inválidos' }) };
      const code = body.codigo;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Bênção do Dia <noreply@bencaododia.app.br>',
          to: [contato],
          subject: '🔑 Recuperação de Senha — Bênção do Dia',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f9f5ef;border-radius:12px">
              <h1 style="font-family:Georgia,serif;color:#c9a84c;font-size:28px;text-align:center">✝️ Bênção do Dia</h1>
              <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e8d49a;margin-top:20px">
                <h2 style="color:#2a1a10;font-size:18px;margin-top:0">🔑 Recuperação de Senha</h2>
                <p style="color:#5a4030;font-size:15px;line-height:1.6">Use o código abaixo para redefinir sua senha. Válido por <strong>15 minutos</strong>.</p>
                <div style="text-align:center;margin:24px 0">
                  <div style="background:#0f0d0a;color:#c9a84c;font-size:36px;font-weight:800;letter-spacing:10px;padding:20px;border-radius:10px;display:inline-block">${code}</div>
                </div>
                <p style="color:#8a8070;font-size:13px">Se você não solicitou a recuperação de senha, ignore este e-mail.</p>
              </div>
              <p style="text-align:center;color:#8a8070;font-size:12px;margin-top:20px">🙏 Paz e Bem! — Bênção do Dia</p>
            </div>`
        }),
      });
      const data = await res.json();
      if (res.ok) return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      throw new Error(data?.message || 'Erro ao enviar e-mail');
    }

    // ── ENVIAR CÓDIGO (cadastro ou recuperação) ──
    if (acao === 'enviar' || acao === 'enviar_cadastro') {
      if (!contato) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Informe seu e-mail' }) };

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      codigos[contato] = { code, expires: Date.now() + 15 * 60 * 1000 };

      const isCadastro = acao === 'enviar_cadastro';
      const titulo = isCadastro ? '✅ Confirme seu cadastro' : '🔑 Recuperação de Senha';
      const subtitulo = isCadastro
        ? 'Use o código abaixo para ativar sua conta. Válido por <strong>15 minutos</strong>.'
        : 'Use o código abaixo para redefinir sua senha. Válido por <strong>15 minutos</strong>.';
      const rodape = isCadastro
        ? 'Se você não tentou criar uma conta, ignore este e-mail.'
        : 'Se você não solicitou a recuperação de senha, ignore este e-mail.';

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Bênção do Dia <noreply@bencaododia.app.br>',
          to: [contato],
          subject: `${titulo} — Bênção do Dia`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f9f5ef;border-radius:12px">
              <h1 style="font-family:Georgia,serif;color:#c9a84c;font-size:28px;text-align:center">✝️ Bênção do Dia</h1>
              <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e8d49a;margin-top:20px">
                <h2 style="color:#2a1a10;font-size:18px;margin-top:0">${titulo}</h2>
                <p style="color:#5a4030;font-size:15px;line-height:1.6">${subtitulo}</p>
                <div style="text-align:center;margin:24px 0">
                  <div style="background:#0f0d0a;color:#c9a84c;font-size:36px;font-weight:800;letter-spacing:10px;padding:20px;border-radius:10px;display:inline-block">${code}</div>
                </div>
                <p style="color:#8a8070;font-size:13px">${rodape}</p>
              </div>
              <p style="text-align:center;color:#8a8070;font-size:12px;margin-top:20px">🙏 Paz e Bem! — Bênção do Dia</p>
            </div>`
        }),
      });

      const data = await res.json();
      if (res.ok) return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      throw new Error(data?.message || 'Erro ao enviar e-mail');
    }

    // ── VERIFICAR CÓDIGO ──
    if (acao === 'verificar') {
      const reg = codigos[contato];
      if (!reg) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código não encontrado. Solicite um novo.' }) };
      if (Date.now() > reg.expires) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado. Solicite um novo.' }) };
      if (reg.code !== codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código incorreto.' }) };
      delete codigos[contato];
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ação inválida' }) };

  } catch (e) {
    console.error('Erro:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
