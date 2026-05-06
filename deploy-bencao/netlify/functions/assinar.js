// netlify/functions/assinar.js
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://bencaododia.app.br';

const PLANOS = {
  fiel_mensal: { nome: 'Bênção do Dia — Fiel Mensal',    valor: 10.00, frequency: 1, frequency_type: 'months' },
  fiel_anual:  { nome: 'Bênção do Dia — Fiel Anual',     valor: 99.00, frequency: 1, frequency_type: 'months' },
  paroquia:    { nome: 'Bênção do Dia — Paróquia',        valor: 57.00, frequency: 1, frequency_type: 'months' },
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const plano = event.queryStringParameters?.plano;
  const email = event.queryStringParameters?.email;

  console.log('Plano recebido:', plano);

  if (!plano || !PLANOS[plano]) {
    console.log('Planos disponíveis:', Object.keys(PLANOS));
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Plano inválido', plano_recebido: plano, planos_validos: Object.keys(PLANOS) }) };
  }

  const p = PLANOS[plano];

  try {
    const body = {
      reason: p.nome,
      auto_recurring: {
        frequency:          p.frequency,
        frequency_type:     p.frequency_type,
        transaction_amount: p.valor,
        currency_id:        'BRL',
      },
      back_url: `${APP_URL}?plano=${plano}&status=aprovado`,
      status: 'pending',
    };

    if (email) body.payer_email = decodeURIComponent(email);

    const res = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('Resposta MP:', JSON.stringify(data));

    if (data?.init_point) {
      return {
        statusCode: 302,
        headers: { ...headers, Location: data.init_point },
        body: '',
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: data?.message || 'Erro ao criar assinatura', detail: data }),
    };

  } catch (e) {
    console.error('Erro:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
