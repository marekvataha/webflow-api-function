// netlify/functions/views.js
// Persistent view counter using Netlify Blobs (no reset endpoint)

const { getStore } = require('@netlify/blobs');

// ----- CORS allowlist (edit if your prod domain is different) -----
const ALLOWED_ORIGINS = [
  'https://resolar-331643.webflow.io', // Webflow staging
  'https://resolar.netlify.app',       // Netlify preview
  'https://resolar.cz'                 // Production
];

function corsHeaders(origin) {
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

function requireEnv() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.BLOBS_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      'Missing Blobs credentials. Set BLOBS_SITE_ID and BLOBS_TOKEN in Site → Build & deploy → Environment.'
    );
  }
  return { siteID, token };
}

function normSlug(raw) {
  if (!raw) return '';
  try { raw = decodeURIComponent(raw); } catch {}
  return String(raw).trim().replace(/^\/+|\/+$/g, '');
}

const nsKey = (ns, slug) => `${ns}:${slug}`;

exports.handler = async (event) => {
  const headers = corsHeaders(event.headers.origin || '');

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const { siteID, token } = requireEnv();
    // Strong consistency so GET reflects latest POST
    const store = getStore({ name: 'views', siteID, token, consistency: 'strong' });

    // Namespace keeps data separated from any old keys
    const ns = (event.queryStringParameters?.ns || 'prod').trim();

    if (event.httpMethod === 'GET') {
      // Read counts for ?slugs=a,b,c&ns=prod
      const slugsParam = event.queryStringParameters?.slugs || '';
      const slugs = slugsParam.split(',').map(normSlug).filter(Boolean);

      const entries = await Promise.all(
        slugs.map(async (s) => {
          const raw = await store.get(nsKey(ns, s)); // string | null
          const n = raw ? Number(raw) : 0;
          return [s, Number.isFinite(n) ? n : 0];
        })
      );

      return { statusCode: 200, headers, body: JSON.stringify({ ns, counts: Object.fromEntries(entries) }) };
    }

    if (event.httpMethod === 'POST') {
      // Increment: body { slug, ns? }
      const body = JSON.parse(event.body || '{}');
      const slug = normSlug(body.slug);
      const nsBody = normSlug(body.ns || '') || ns;
      if (!slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing slug' }) };
        }

      const k = nsKey(nsBody, slug);
      const currentRaw = await store.get(k);
      const current = currentRaw ? Number(currentRaw) : 0;
      const next = (Number.isFinite(current) ? current : 0) + 1;

      await store.set(k, String(next));
      return { statusCode: 200, headers, body: JSON.stringify({ ns: nsBody, slug, views: next }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
