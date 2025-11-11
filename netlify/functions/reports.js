// netlify/functions/reports.js
// ✅ Final version with 24h Netlify Blobs caching + live Webflow data refresh

import { getStore } from "@netlify/blobs";

// Cache TTL (24 hours)
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export async function handler(event) {
  const API_TOKEN = process.env.WEBFLOW_API_TOKEN;
  const COLLECTION_ID =
    process.env.WEBFLOW_COLLECTION_ID || "68a1d701da54a513636c4391";
  const WEBFLOW_SECRET = process.env.WEBFLOW_WEBHOOK_SECRET;

  // Query params
  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit || "100", 10), 100);
  const offset = parseInt(qs.offset || "0", 10);
  const sortParam = (qs.sort || "date-desc").toLowerCase(); // "date-desc" | "date-asc"
  const forceRefresh = qs.refresh === "true";
  const filterType = (qs.filter || "").toLowerCase(); // "", "reports", "aktuality"
  const excludeSlug = String(qs.excludeSlug || "").trim();

  // Webhook authentication
  const incomingSecret =
    event.headers["x-webflow-signature"] || event.headers["x-webflow-secret"];
  const isWebhook =
    event.httpMethod === "POST" && incomingSecret === WEBFLOW_SECRET;

  // Connect to Netlify Blobs store
  const store = getStore("webflow-cache");

  try {
    let items = [];
    let lastFetch = 0;

    // Try reading cache
    const cached = await store.get("cachedItems", { type: "json" });
    const meta = await store.get("cachedMeta", { type: "json" });
    if (cached && meta && Array.isArray(cached)) {
      items = cached;
      lastFetch = meta.lastFetch || 0;
    }

    const now = Date.now();
    const cacheIsValid = items.length && now - lastFetch < CACHE_TTL_MS;

    // Fetch from Webflow if no valid cache or webhook/force refresh
    if (!cacheIsValid || forceRefresh || isWebhook) {
      console.log(
        isWebhook
          ? "♻️ Refresh triggered by Webflow webhook..."
          : forceRefresh
          ? "♻️ Manual cache refresh..."
          : "♻️ Cache expired, refreshing..."
      );

      const fresh = await fetchAllFromWebflow(API_TOKEN, COLLECTION_ID);
      await store.set("cachedItems", JSON.stringify(fresh), { metadata: {} });
      await store.set(
        "cachedMeta",
        JSON.stringify({ lastFetch: now }),
        { metadata: {} }
      );

      items = fresh;
      lastFetch = now;
    } else {
      console.log("⚡ Serving from Netlify Blobs cache...");
    }

    // ===================== FILTERING =====================
    const reportNameRegex = /^Výroční zpráva\s\d{4}$/u;
    let filtered = [...items];

    if (filterType === "reports") {
      filtered = filtered.filter((it) =>
        reportNameRegex.test(it.fieldData?.["name"] || "")
      );
    } else if (filterType === "aktuality") {
      filtered = filtered.filter(
        (it) => !reportNameRegex.test(it.fieldData?.["name"] || "")
      );
    }

    if (excludeSlug) {
      filtered = filtered.filter(
        (it) => String(it.fieldData?.["slug"] || "") !== excludeSlug
      );
    }

    // ===================== SORTING =====================
    const getItemTime = (it) => {
      const manual = it.fieldData?.["datum-a-cas-publikovani"];
      const auto = it.lastPublished;
      const chosen = manual || auto;
      const d = chosen ? new Date(chosen) : null;
      return d && !isNaN(d) ? d.getTime() : 0;
    };

    if (sortParam.startsWith("date")) {
      filtered.sort((a, b) => {
        const aT = getItemTime(a);
        const bT = getItemTime(b);
        return sortParam === "date-asc" ? aT - bT : bT - aT;
      });
    }

    // ===================== PAGINATION =====================
    const paginated = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;

    // ===================== RESPONSE =====================
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, X-Webflow-Signature, X-Webflow-Secret",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
      body: JSON.stringify({
        items: paginated,
        meta: {
          limit,
          offset,
          total: filtered.length,
          hasMore,
          cachedAt: new Date(lastFetch).toISOString(),
          fromCache: cacheIsValid && !forceRefresh && !isWebhook,
          filter: filterType || "none",
          excludeSlug: excludeSlug || "none",
        },
      }),
    };
  } catch (err) {
    console.error("❌ reports function error:", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// —————————————————————————————
// Fetch all LIVE items from Webflow (paged by 100)
// —————————————————————————————
async function fetchAllFromWebflow(API_TOKEN, COLLECTION_ID) {
  const PAGE_LIMIT = 100;
  let offset = 0;
  let allItems = [];

  while (true) {
    const url = `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live?limit=${PAGE_LIMIT}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Webflow API responded ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    allItems = allItems.concat(items);

    if (items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  console.log(`✅ Cached ${allItems.length} Webflow items`);
  return allItems;
}
