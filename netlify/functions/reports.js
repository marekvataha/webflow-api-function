// netlify/functions/reports.js
// ❗️Simplest version: no in-memory cache, always hit Webflow LIVE items,
// server-side filter+sort+paginate, and return no-store headers.

export async function handler(event) {
  const API_TOKEN     = process.env.WEBFLOW_API_TOKEN;
  const COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID || "68a1d701da54a513636c4391";

  const qs = event.queryStringParameters || {};
  const limit       = Math.min(parseInt(qs.limit  || "100", 10), 100);
  const offset      = parseInt(qs.offset || "0", 10);
  const sortParam   = (qs.sort   || "date-desc").toLowerCase();   // "date-desc" | "date-asc"
  const filterType  = (qs.filter || "").toLowerCase();            // "", "reports", "aktuality"
  const excludeSlug = String(qs.excludeSlug || "").trim();

  try {
    // 1) Fetch ALL published (live) items from Webflow (paged by 100)
    const allItems = await fetchAllFromWebflowLive(API_TOKEN, COLLECTION_ID);

    // 2) Filter (reports / aktuality) BEFORE sort/paginate
    const reportNameRegex = /^Výroční zpráva\s\d{4}$/u;
    let filtered = allItems;

    if (filterType === "reports") {
      filtered = filtered.filter(it => reportNameRegex.test((it.fieldData?.["name"] || "").trim()));
    } else if (filterType === "aktuality") {
      filtered = filtered.filter(it => !reportNameRegex.test((it.fieldData?.["name"] || "").trim()));
    }

    if (excludeSlug) {
      filtered = filtered.filter(it => String(it.fieldData?.["slug"] || "") !== excludeSlug);
    }

    // 3) Sort (date asc/desc)
    const getTime = (it) => {
      const manual = it.fieldData?.["datum-a-cas-publikovani"];
      const auto   = it.lastPublished;
      const chosen = manual || auto;
      const d = chosen ? new Date(chosen) : null;
      return d && !isNaN(d) ? d.getTime() : 0;
    };

    if (sortParam.startsWith("date")) {
      filtered.sort((a, b) => {
        const ta = getTime(a);
        const tb = getTime(b);
        return sortParam === "date-asc" ? (ta - tb) : (tb - ta);
      });
    }

    // 4) Paginate AFTER filter/sort
    const total   = filtered.length;
    const items   = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Webflow-Signature, X-Webflow-Secret",
        "Content-Type": "application/json",
        // 🚫 Do not cache at browser/CDN
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache"
      },
      body: JSON.stringify({
        items,
        meta: { limit, offset, total, hasMore, filter: filterType || "none", excludeSlug: excludeSlug || "none" }
      })
    };
  } catch (err) {
    console.error("❌ reports function error:", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: err.message })
    };
  }
}

// —————————————————————————————
// Fetch ALL published items from Webflow (LIVE)
// —————————————————————————————
async function fetchAllFromWebflowLive(API_TOKEN, COLLECTION_ID) {
  const PAGE_LIMIT = 100;
  let offset = 0;
  let all = [];

  while (true) {
    const url = new URL(`https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`);
    url.searchParams.set("limit",  String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Webflow API responded ${res.status}: ${txt}`);
    }

    const data  = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    all = all.concat(items);

    if (items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return all;
}
