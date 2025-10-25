// netlify/functions/reports.js
let cache = {
  items: [],
  lastFetch: 0,
  ttl: 1000 * 60 * 60 // 1 hour
};

export async function handler(event, context) {
  const API_TOKEN = process.env.WEBFLOW_API_TOKEN;
  const COLLECTION_ID = "68a1d701da54a513636c4391";
  const WEBFLOW_SECRET = process.env.WEBFLOW_WEBHOOK_SECRET;

  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit || "100", 10), 100);
  const offset = parseInt(qs.offset || "0", 10);
  const sortParam = (qs.sort || "date-desc").toLowerCase(); // "date-desc" | "date-asc"
  const forceRefresh = qs.refresh === "true";
  const filterType = (qs.filter || "").toLowerCase();       // "", "reports", "aktuality"  ✅ NEW
  const excludeSlug = String(qs.excludeSlug || "").trim();  // slug to omit                ✅ NEW

  // 🔐 Webhook check
  const incomingSecret = event.headers["x-webflow-signature"] || event.headers["x-webflow-secret"];
  const isWebhook = event.httpMethod === "POST" && incomingSecret === WEBFLOW_SECRET;

  try {
    const now = Date.now();
    const cacheIsValid = cache.items.length && now - cache.lastFetch < cache.ttl;

    // Refresh cache when invalid, forced, or triggered by webhook
    if (!cacheIsValid || forceRefresh || isWebhook) {
      console.log(
        isWebhook ? "♻️ Refresh triggered by Webflow webhook…" :
        forceRefresh ? "♻️ Manual cache refresh…" :
        "♻️ Cache expired, refreshing…"
      );

      if (event.httpMethod === "POST" && !isWebhook) {
        return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized POST" }) };
        }
      cache.items = await fetchAllFromWebflow(API_TOKEN, COLLECTION_ID);
      cache.lastFetch = now;
    } else {
      console.log("⚡ Serving from cache...");
    }

    // Helper: detect "Výroční zpráva 2024"
    const reportNameRegex = /^Výroční zpráva\s\d{4}$/u;

    // ✅ Apply filtering BEFORE sorting/pagination
    let filtered = [...cache.items];

    if (filterType === "reports") {
      filtered = filtered.filter(item => reportNameRegex.test(item.fieldData?.["name"] || ""));
    } else if (filterType === "aktuality") {
      filtered = filtered.filter(item => !reportNameRegex.test(item.fieldData?.["name"] || ""));
    }
    // ✅ Exclude current article by slug BEFORE limiting
    if (excludeSlug) {
      filtered = filtered.filter(item => String(item.fieldData?.["slug"] || "") !== excludeSlug);
    }

    // ✅ Sort
    const getItemTime = (it) => {
      const manual = it.fieldData?.["datum-a-cas-publikovani"];
      const auto   = it.lastPublished;
      const chosen = manual || auto;
      const d = chosen ? new Date(chosen) : null;
      return d && !isNaN(d) ? d.getTime() : 0;
    };

    if (sortParam.startsWith("date")) {
      filtered.sort((a, b) => {
        const aT = getItemTime(a);
        const bT = getItemTime(b);
        return sortParam === "date-asc" ? aT - bT : bT - aT; // default desc
      });
    }

    // ✅ Paginate AFTER filtering/sorting/exclusion so LIMIT is precise
    const paginated = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Webflow-Signature, X-Webflow-Secret",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600"
      },
      body: JSON.stringify({
        items: paginated,
        meta: {
          limit,
          offset,
          total: filtered.length,
          hasMore,
          cachedAt: new Date(cache.lastFetch).toISOString(),
          fromCache: !(forceRefresh || isWebhook),
          filter: filterType || "none",
          excludeSlug: excludeSlug || "none"
        }
      })
    };
  } catch (err) {
    console.error("❌ Netlify function error:", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify({ error: err.message })
    };
  }
}

// —————————————————————————————
// Fetch all items from Webflow (once per hour or on refresh)
// —————————————————————————————
async function fetchAllFromWebflow(API_TOKEN, COLLECTION_ID) {
  const PAGE_LIMIT = 100;
  let offset = 0;
  let allItems = [];

  while (true) {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items?limit=${PAGE_LIMIT}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          Accept: "application/json"
        }
      }
    );

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

  console.log(`✅ Cached ${allItems.length} items from Webflow`);
  return allItems;
}
