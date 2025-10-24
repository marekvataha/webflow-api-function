// netlify/functions/views.js
import { getStore } from '@netlify/blobs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const store = getStore({ name: 'global-views' }); // creates/uses a KV bucket named "global-views"

  try {
    if (event.httpMethod === 'GET') {
      // GET /.netlify/functions/views?slugs=a,b,c
      const qs = new URLSearchParams(event.rawQuery || '');
      const slugs = (qs.get('slugs') || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const counts = {};
      // Fetch each slug’s count; default 0
      for (const slug of slugs) {
        const val = await store.get(slug);
        counts[slug] = val ? parseInt(val, 10) || 0 : 0;
      }

      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts }),
      };
    }

    if (event.httpMethod === 'POST') {
      // POST { slug: "vyrocni-zprava-2024" }
      const body = JSON.parse(event.body || '{}');
      const slug = (body.slug || '').trim();
      if (!slug) {
        return {
          statusCode: 400,
          headers: cors,
          body: JSON.stringify({ error: 'Missing slug' }),
        };
      }

      // naive increment (get -> +1 -> set). Good enough for low concurrency.
      const current = await store.get(slug);
      const next = (current ? parseInt(current, 10) || 0 : 0) + 1;
      await store.set(slug, String(next));

      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, views: next }),
      };
    }

    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  } catch (e) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: e.message }),
    };
  }
}
