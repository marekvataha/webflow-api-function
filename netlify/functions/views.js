// netlify/functions/views.js
// A lightweight, dependency-free function that tracks and returns views
// Works without any npm installs or Netlify add-ons

// Temporary in-memory storage (resets after each deploy)
let viewsStore = {}; // { slug: count }

// ===== CORS SETUP ===========================================================
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io', // Webflow staging
  'https://resolar.netlify.app',       // Netlify preview
  'https://resolar.cz',                // your live domain (optional)
];

function makeCorsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  const allowOrigin = ok ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

// ===== HANDLER ==============================================================
exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = makeCorsHeaders(origin);

  // --- Preflight (OPTIONS) ---
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // --- GET: Return counts ---
    if (event.httpMethod === 'GET') {
      const slugsParam = event.queryStringParameters?.slugs || '';
      const slugs = slugsParam.split(',').filter(Boolean);
      const counts = Object.fromEntries(slugs.map(s => [s, viewsStore[s] ?? 0]));
      return { statusCode: 200, headers, body: JSON.stringify({ counts }) };
    }

    // --- POST: Increment count ---
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const slug = body.slug?.trim();
      if (!slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing slug' }) };
      }

      const current = viewsStore[slug] ?? 0;
      viewsStore[slug] = current + 1;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ slug, views: viewsStore[slug] }),
      };
    }

    // --- Fallback for unsupported methods ---
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
