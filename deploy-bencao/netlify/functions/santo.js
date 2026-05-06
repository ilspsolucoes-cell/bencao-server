// netlify/functions/santo.js
// Busca o Santo do Dia no Vatican News

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const res = await fetch('https://www.vaticannews.va/pt/santo-do-dia.html', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BencaoDiaBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    const html = await res.text();

    // Extrai o nome do santo do título da página
    let santo = '';

    // Tenta extrair do meta og:title
    const ogMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (ogMatch) santo = ogMatch[1];

    // Tenta extrair do h1
    if (!santo) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) santo = h1Match[1].trim();
    }

    // Tenta extrair do title
    if (!santo) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) santo = titleMatch[1].split('|')[0].trim();
    }

    if (santo) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ santo: santo.trim() }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ santo: null }),
    };

  } catch (e) {
    console.error('Erro ao buscar santo:', e.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ santo: null }),
    };
  }
};
