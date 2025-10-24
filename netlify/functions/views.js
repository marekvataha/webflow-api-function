// netlify/functions/views.js
let viewsStore = {}; // slug -> number of views (temporary in-memory storage)

// --- CORS setup ---------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io',  // Webflow staging
  'https://resolar.netlify.app',        // Netlify preview
  'https://resolar.cz',                 // your production domain (if used)
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

// --- Handler ------------------------------------------------------------------
exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = makeCorsHeaders(origin);

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // ------------------ READ COUNTS ------------------
    if (event.httpMethod === 'GET') {
      const slugsParam = event.queryStringParameters?.slugs || '';
      const slugs = slugsParam.split(',').filter(Boolean);

      // Always return deterministic numbers
      const counts = Object.fromEntries(
        slugs.map(s => [s, viewsStore[s] ?? 0])
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ counts }),
      };
    }

    // ------------------ INCREMENT COUNT ------------------
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

    // Unsupported
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
