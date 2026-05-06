// netlify/functions/recuperar.js
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'https://bencaododia.app.br';

const codigos = global._codigos || (global._codigos = {});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { acao, contato, codigo } = body;

    // ── Enviar código ──
    if (acao === 'enviar') {
      if (!contato) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Informe seu e-mail' }) };

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = Date.now() + 15 * 60 * 1000; // 15 minutos
      codigos[contato] = { code, expires };

      // Envia e-mail via Resend
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Bênção do Dia <noreply@bencaododia.app.br>',
          to: [contato],
          subject: '🔑 Código de recuperação — Bênção do Dia',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f9f5ef;border-radius:12px">
              <div style="text-align:center;margin-bottom:24px">
                <h1 style="font-family:Georgia,serif;color:#c9a84c;font-size:28px;margin:0">✝️ Bênção do Dia</h1>
                <p style="color:#8a8070;font-size:14px;margin-top:6px">Cards Católicos para WhatsApp</p>
              </div>
              <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e8d49a">
                <h2 style="color:#2a1a10;font-size:18px;margin-top:0">Recuperação de senha</h2>
                <p style="color:#5a4030;font-size:15px;line-height:1.6">Use o código abaixo para redefinir sua senha. Ele é válido por <strong>15 minutos</strong>.</p>
                <div style="text-align:center;margin:24px 0">
                  <div style="background:#0f0d0a;color:#c9a84c;font-size:36px;font-weight:800;letter-spacing:10px;padding:20px;border-radius:10px;display:inline-block">
                    ${code}
                  </div>
                </div>
                <p style="color:#8a8070;font-size:13px;line-height:1.6">Se você não solicitou a recuperação de senha, ignore este e-mail.</p>
              </div>
              <p style="text-align:center;color:#8a8070;font-size:12px;margin-top:20px">
                🙏 Paz e Bem! — Equipe Bênção do Dia
              </p>
            </div>
          `,
        }),
      });

      const data = await res.json();
      console.log('Resend response:', JSON.stringify(data));

      if (res.ok) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: `Código enviado para ${contato}` }),
        };
      } else {
        throw new Error(data?.message || 'Erro ao enviar e-mail');
      }
    }

    // ── Verificar código ──
    if (acao === 'verificar') {
      const reg = codigos[contato];
      if (!reg) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código não encontrado. Solicite um novo.' }) };
      if (Date.now() > reg.expires) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código expirado. Solicite um novo.' }) };
      if (reg.code !== codigo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código incorreto.' }) };

      // Remove código após uso
      delete codigos[contato];
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ação inválida' }) };

  } catch (e) {
    console.error('Erro:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
