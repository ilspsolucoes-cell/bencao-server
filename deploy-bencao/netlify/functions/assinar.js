// netlify/functions/assinar.js
// Cria o link de assinatura no Mercado Pago e redireciona o usuário

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://bencaododia.app.br';

const PLANOS = {
  basico:   { nome: 'Bênção do Dia — Básico',  valor: 29.00 },
  pro:      { nome: 'Bênção do Dia — Pro',      valor: 49.00 },
  paroquia: { nome: 'Bênção do Dia — Paróquia', valor: 99.00 },
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const plano = event.queryStringParameters?.plano;
  const email = event.queryStringParameters?.email;

  if (!plano || !PLANOS[plano]) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Plano inválido' }),
    };
  }

  const p = PLANOS[plano];

  try {
    const body = {
      reason: p.nome,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: p.valor,
        currency_id: 'BRL',
      },
      back_url: `${APP_URL}?plano=${plano}&status=aprovado`,
      status: 'pending',
    };

    // Adiciona email do pagador se disponível
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

    // Retorna erro detalhado para debug
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: data?.message || 'Erro ao criar assinatura', detail: data }),
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
