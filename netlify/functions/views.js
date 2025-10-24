// netlify/functions/views.js
// Persistent view counters using Netlify Blobs.
// npm i @netlify/blobs

const { getStore } = require('@netlify/blobs');

// ---------- CORS ----------
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io', // Webflow staging
  'https://resolar.netlify.app',       // Netlify preview
  // Add your production domain when live:
  // 'https://resolar.cz',
];

function makeCorsHeaders(origin) {
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

async function getCounts(store) {
  // Reads a single JSON doc from Blobs (or returns {} if missing)
  const data = await store.get('counts', { type: 'json' });
  return data && typeof data === 'object' ? data : {};
}

async function setCounts(store, obj) {
  await store.set('counts', JSON.stringify(obj));
}

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = makeCorsHeaders(origin);

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const store = getStore('views'); // a named blob “bucket”

    if (event.httpMethod === 'GET') {
      // GET ?slugs=a,b,c
      const raw = (event.queryStringParameters?.slugs || '').trim();
      const slugs = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];

      const all = await getCounts(store);
      const counts = Object.fromEntries(slugs.map(s => [s, Number(all[s] ?? 0)]));

      return { statusCode: 200, headers, body: JSON.stringify({ counts }) };
    }

    if (event.httpMethod === 'POST') {
      // Body: { slug: "pf-2025" }
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
      const slug = (body.slug || '').trim();
      if (!slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing slug' }) };
      }

      const all = await getCounts(store);
      const current = Number(all[slug] ?? 0);
      const next = current + 1;
      all[slug] = next;
      await setCounts(store, all);

      return { statusCode: 200, headers, body: JSON.stringify({ slug, views: next }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
