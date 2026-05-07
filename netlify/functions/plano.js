// netlify/functions/plano.js
// Verifica o plano do usuário no Mercado Pago

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Mapa de preços → planos
const PRICE_PLANS = {
  2900: 'Básico',
  4900: 'Pro',
  9900: 'Paróquia',
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const email = event.queryStringParameters?.email;
  if (!email) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ plan: 'Grátis', error: 'E-mail não informado' }),
    };
  }

  try {
    // Busca assinaturas ativas do usuário no Mercado Pago
    const res = await fetch(
      `https://api.mercadopago.com/preapproval/search?payer_email=${encodeURIComponent(email)}&status=authorized`,
      {
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await res.json();
    const results = data?.results || [];

    if (results.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ plan: 'Grátis' }),
      };
    }

    // Pega a assinatura mais recente ativa
    const sub = results[0];
    const valor = Math.round(sub.auto_recurring?.transaction_amount * 100);
    const plan = PRICE_PLANS[valor] || 'Básico';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ plan, status: sub.status }),
    };

  } catch (e) {
    console.error('Erro ao verificar plano:', e.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ plan: 'Grátis' }),
    };
  }
};
