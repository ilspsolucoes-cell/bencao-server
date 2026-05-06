// netlify/functions/webhook.js
// Recebe notificações do Mercado Pago quando alguém paga ou cancela

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const PRICE_PLANS = {
  29: 'Básico',
  49: 'Pro',
  99: 'Paróquia',
};

// Banco simples — em produção use FaunaDB ou Supabase
const db = global._bencaoDB || (global._bencaoDB = {});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const type = body?.type;
    const id   = body?.data?.id;

    console.log('Webhook MP recebido:', type, id);

    // Assinatura criada ou renovada
    if (type === 'subscription_preapproval') {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const sub = await res.json();
      const email = sub?.payer_email?.toLowerCase().trim();
      const valor = Math.round(sub?.auto_recurring?.transaction_amount);
      const plan  = PRICE_PLANS[valor] || 'Básico';
      const status = sub?.status;

      if (email) {
        if (status === 'authorized') {
          db[email] = { plan, updatedAt: new Date().toISOString() };
          console.log(`✅ Plano ${plan} liberado para ${email}`);
        } else if (status === 'cancelled' || status === 'paused') {
          db[email] = { plan: 'Grátis', updatedAt: new Date().toISOString() };
          console.log(`❌ Plano cancelado para ${email}`);
        }
      }
    }

    // Pagamento aprovado
    if (type === 'payment') {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const pay = await res.json();
      const email = pay?.payer?.email?.toLowerCase().trim();
      const valor = Math.round(pay?.transaction_amount);
      const plan  = PRICE_PLANS[valor] || 'Básico';

      if (email && pay?.status === 'approved') {
        db[email] = { plan, updatedAt: new Date().toISOString() };
        console.log(`✅ Pagamento aprovado — Plano ${plan} para ${email}`);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };

  } catch (e) {
    console.error('Erro no webhook:', e.message);
    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
  }
};
