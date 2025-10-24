// netlify/functions/views.js
// Node 18+ function using Netlify Blobs for persistent counts.
const { getStore } = require('@netlify/blobs');

// ---------- CORS ----------
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io', // Webflow staging
  'https://resolar.netlify.app',       // Netlify preview
  // Add your production domain when live:
  // 'https://resolar.cz',
];

function makeHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}

// Single JSON object stored in Netlify Blobs under key "counts"
const store = getStore({ name: 'views-store' });
const COUNTS_KEY = 'counts.json';

async function readMap() {
  const json = await store.get(COUNTS_KEY, { type: 'json' });
  return json || {};
}

async function writeMap(map) {
  await store.set(COUNTS_KEY, map);
}

function normalizeSlug(s) {
  if (!s) return '';
  return String(s).trim().toLowerCase();
}

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = makeHeaders(origin);

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // GET /views?slugs=a,b,c  -> { counts: { a: 12, b: 0, c: 5 } }
    if (event.httpMethod === 'GET') {
      const slugsParam = (event.queryStringParameters?.slugs || '').trim();
      const slugs = slugsParam
        ? slugsParam.split(',').map(normalizeSlug).filter(Boolean)
        : [];

      const map = await readMap();
      const counts = Object.fromEntries(slugs.map(s => [s, Number(map[s] || 0)]));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ counts }),
      };
    }

    // POST /views  body: { slug: "my-article" }  -> increments count
    if (event.httpMethod === 'POST') {
      let payload = {};
      try {
        payload = JSON.parse(event.body || '{}');
      } catch {}

      const slug = normalizeSlug(payload.slug);
      if (!slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing slug' }) };
      }

      // naive read-modify-write (adequate for low traffic)
      const map = await readMap();
      map[slug] = Number(map[slug] || 0) + 1;
      await writeMap(map);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, slug, views: map[slug] }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || 'Internal error' }),
    };
  }
};
