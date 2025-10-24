// netlify/functions/views.js
// Persistent view counter using Netlify Blobs (durable storage)

const { getStore } = require('@netlify/blobs');

// CORS allowlist
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io', // Webflow staging
  'https://resolar.netlify.app',       // Netlify preview
  'https://resolar.cz'                 // your live domain (add/change as needed)
];

function makeCorsHeaders(origin) {
  const match = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = makeCorsHeaders(origin);

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // Strong consistency so reads reflect the latest write
  const store = getStore({ name: 'views', consistency: 'strong' });

  try {
    if (event.httpMethod === 'GET') {
      // Read counts for ?slugs=a,b,c
      const slugsParam = event.queryStringParameters?.slugs || '';
      const slugs = slugsParam.split(',').map(s => s.trim()).filter(Boolean);

      const entries = await Promise.all(
        slugs.map(async (slug) => {
          const raw = await store.get(slug);              // returns string | null
          const n = raw ? Number(raw) : 0;
          return [slug, Number.isFinite(n) ? n : 0];
        })
      );

      const counts = Object.fromEntries(entries);
      return { statusCode: 200, headers, body: JSON.stringify({ counts }) };
    }

    if (event.httpMethod === 'POST') {
      // Increment a single slug { slug: "some-slug" }
      const body = JSON.parse(event.body || '{}');
      const slug = (body.slug || '').trim();
      if (!slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing slug' }) };
      }

      const currentRaw = await store.get(slug);
      const current = currentRaw ? Number(currentRaw) : 0;
      const next = (Number.isFinite(current) ? current : 0) + 1;

      await store.set(slug, String(next));
      return { statusCode: 200, headers, body: JSON.stringify({ slug, views: next }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
