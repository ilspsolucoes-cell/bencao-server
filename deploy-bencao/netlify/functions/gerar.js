// netlify/functions/gerar.js
// Proxy seguro para a API da Anthropic — a chave fica no servidor

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: body.messages || [],
      }),
    });

    const text = await res.text();

    // Tenta fazer parse do JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      console.error('Erro ao fazer parse da resposta:', text.substring(0, 200));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Resposta inválida da API', detail: text.substring(0, 200) }),
      };
    }

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || `HTTP ${res.status}` }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };

  } catch (e) {
    console.error('Erro:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};

