// netlify/functions/views.js
exports.handler = async (event) => {
  const origin = event.headers.origin || '*';
  const allowed = [
    'https://resolar-331643.webflow.io',  // Webflow staging
    'https://resolar.netlify.app',        // Netlify domain
    'https://resolar.cz',                 // your real domain if live
  ];
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };

  // --- Preflight handler ---
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    if (event.httpMethod === 'GET') {
      const slugsParam = event.queryStringParameters?.slugs || '';
      const slugs = slugsParam.split(',').filter(Boolean);
      // dummy example — replace with your database lookup
      const counts = Object.fromEntries(slugs.map(s => [s, Math.floor(Math.random() * 100)]));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ counts }),
      };
    }

    if (event.httpMethod === 'POST') {
      // update count (optional)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
