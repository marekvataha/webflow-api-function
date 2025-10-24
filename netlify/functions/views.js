// netlify/functions/views.js
// Persistent view counter using Netlify Blobs with explicit credentials (siteID + token)

const { getStore } = require('@netlify/blobs');

// ----- CORS allowlist -----
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io', // Webflow staging
  'https://resolar.netlify.app',       // Netlify preview
  'https://resolar.cz'                 // production (adjust if different)
];

function makeCorsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function ensureEnv() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.BLOBS_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      'Missing Blobs credentials. Set env vars BLOBS_SITE_ID and BLOBS_TOKEN in Netlify → Site settings → Build & deploy → Environment.'
    );
  }
  return { siteID, token };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const headers = makeCorsHeaders(origin);

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const { siteID, token } = ensureEnv();
    // Strong consistency so GET reflects the latest POST
    const store = getStore({ name: 'views', siteID, token, consistency: 'strong' });

    if (event.httpMethod === 'GET') {
      // ?slugs=a,b,c
      const slugsParam = event.queryStringParameters?.slugs || '';
      const slugs = slugsParam.split(',').map(s => s.trim()).filter(Boolean);

      const entries = await Promise.all(
        slugs.map(async (slug) => {
          const raw = await store.get(slug); // string | null
          const n = raw ? Number(raw) : 0;
          return [slug, Number.isFinite(n) ? n : 0];
        })
      );

      return { statusCode: 200, headers, body: JSON.stringify({ counts: Object.fromEntries(entries) }) };
    }

    if (event.httpMethod === 'POST') {
      // body: { slug: "some-slug" }
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
