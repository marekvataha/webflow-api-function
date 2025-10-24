// Classic Netlify Functions (Node 18+). Adjust to your data source as needed.
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io',   // Webflow staging
  'https://resolar.netlify.app',         // Netlify preview
  'https://YOUR-PROD-DOMAIN.TLD',        // <-- add your real prod domain
];

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = corsHeaders(origin);

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Expect ?slugs=a,b,c
    const slugsParam = (event.queryStringParameters?.slugs || '').trim();
    const slugs = slugsParam ? slugsParam.split(',').map(s => s.trim()).filter(Boolean) : [];

    // TODO: Replace with your real store/DB lookup.
    // Return 0 for unknown slugs so sorting still works.
    const counts = Object.fromEntries(slugs.map(s => [s, await getViewsForSlug(s)]));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ counts }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal error' }),
    };
  }
};

// Dummy placeholder. Hook to your KV/DB/analytics.
async function getViewsForSlug(slug) {
  // e.g., read from Upstash/Redis, Fauna, D1, Supabase, etc.
  return 0;
}
