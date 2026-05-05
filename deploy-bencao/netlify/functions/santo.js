// netlify/functions/santo.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const res = await fetch('https://www.vaticannews.va/pt/santo-do-dia.html', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
    });
    const html = await res.text();
    let santo = '';
    const ogMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (ogMatch) santo = ogMatch[1];
    if (!santo) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) santo = h1Match[1].trim();
    }
    if (!santo) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) santo = titleMatch[1].split('|')[0].trim();
    }
    return { statusCode: 200, headers, body: JSON.stringify({ santo: santo.trim()||null }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ santo: null }) };
  }
};
