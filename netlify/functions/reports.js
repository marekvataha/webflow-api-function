// netlify/functions/reports.js
// ✅ 24h Netlify Blobs cache + secure Webflow webhook (HMAC) + filters/sort/paginate

import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export async function handler(event) {
  // --- CORS / preflight ---
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
    };
  }

  const API_TOKEN       = process.env.WEBFLOW_API_TOKEN;
  const COLLECTION_ID   = process.env.WEBFLOW_COLLECTION_ID || "68a1d701da54a513636c4391";
  const WEBFLOW_SECRETS = process.env.WEBFLOW_WEBHOOK_SECRETS || ""; // comma-separated

  // Query params
  const qs          = event.queryStringParameters || {};
  const limit       = Math.min(parseInt(qs.limit  || "100", 10), 100);
  const offset      = parseInt(qs.offset || "0", 10);
  const sortParam   = (qs.sort   || "date-desc").toLowerCase(); // "date-desc" | "date-asc"
  const filterType  = (qs.filter || "").toLowerCase();          // "", "reports", "aktuality"
  const excludeSlug = String(qs.excludeSlug || "").trim();
  const forceRefresh = qs.refresh === "true"; // manual override

  // Webflow webhook detection (HMAC of raw body)
  const signatureHeader = event.headers["x-webflow-signature"] || "";
  const rawBody = decodeRawBody(event);
  const isSignedWebhook =
    event.httpMethod === "POST" &&
    verifyWebflowSignature(rawBody, signatureHeader, WEBFLOW_SECRETS);

  // Blobs store
  const store = getStore("webflow-cache");

  try {
    let items = [];
    let lastFetch = 0;

    // Try read from cache
    const cached = await store.get("cachedItems", { type: "json" });
    const meta   = await store.get("cachedMeta",  { type: "json" });
    if (cached && Array.isArray(cached) && meta && typeof meta.lastFetch === "number") {
      items = cached;
      lastFetch = meta.lastFetch;
    }

    const now = Date.now();
    const cacheIsValid = items.length && (now - lastFetch) < CACHE_TTL_MS;

    // Refresh if:
    // - cache expired OR
    // - manual ?refresh=true OR
    // - valid signed Webflow webhook
    if (!cacheIsValid || forceRefresh || isSignedWebhook) {
      console.log(
        isSignedWebhook
          ? "♻️ Cache refresh: signed Webflow webhook"
          : forceRefresh
          ? "♻️ Cache refresh: manual ?refresh=true"
          : "♻️ Cache expired → refreshing"
      );

      const fresh = await fetchAllFromWebflowLive(API_TOKEN, COLLECTION_ID);
      await store.set("cachedItems", JSON.stringify(fresh));
      await store.set("cachedMeta", JSON.stringify({ lastFetch: now }));

      items = fresh;
      lastFetch = now;
    } else {
      console.log("⚡ Serving from Netlify Blobs cache");
    }

    // ============= FILTER =============
    const reportNameRegex = /^Výroční zpráva\s\d{4}$/u;
    let filtered = [...items];

    if (filterType === "reports") {
      filtered = filtered.filter(it =>
        reportNameRegex.test((it.fieldData?.["name"] || "").trim())
      );
    } else if (filterType === "aktuality") {
      filtered = filtered.filter(it =>
        !reportNameRegex.test((it.fieldData?.["name"] || "").trim())
      );
    }

    if (excludeSlug) {
      filtered = filtered.filter(it => String(it.fieldData?.["slug"] || "") !== excludeSlug);
    }

    // ============= SORT =============
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

    // ============= PAGINATE =============
    const total   = filtered.length;
    const itemsPg = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
        // client/CDN can cache for 60s, while the function itself uses 24h Blobs cache
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
      body: JSON.stringify({
        items: itemsPg,
        meta: {
          limit,
          offset,
          total,
          hasMore,
          filter: filterType || "none",
          excludeSlug: excludeSlug || "none",
          cachedAt: new Date(lastFetch || 0).toISOString(),
          fromCache: cacheIsValid && !forceRefresh && !isSignedWebhook,
          webhook: isSignedWebhook ? "verified" : "none",
        },
      }),
    };
  } catch (err) {
    console.error("❌ reports function error:", err);
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

/* ---------------- Helpers ---------------- */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Webflow-Signature",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function decodeRawBody(event) {
  // Webflow sends JSON; Netlify may set isBase64Encoded
  if (event.body == null) return "";
  if (event.isBase64Encoded) {
    try { return Buffer.from(event.body, "base64").toString("utf8"); }
    catch { return ""; }
  }
  return event.body; // already a string
}

function verifyWebflowSignature(rawBody, signatureHeader, secretsCsv) {
  if (!rawBody || !signatureHeader || !secretsCsv) return false;
  const secrets = secretsCsv.split(",").map(s => s.trim()).filter(Boolean);
  // Webflow uses HMAC-SHA256 over the raw request body (hex digest in header)
  for (const secret of secrets) {
    try {
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(rawBody, "utf8");
      const digest = hmac.digest("hex");
      if (timingSafeEqualHex(signatureHeader, digest)) return true;
    } catch { /* ignore and try next secret */ }
  }
  return false;
}

function timingSafeEqualHex(a, b) {
  try {
    const A = Buffer.from(String(a), "utf8");
    const B = Buffer.from(String(b), "utf8");
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch {
    return false;
  }
}

// Fetch all LIVE items (published) from Webflow, 100 per page
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
        Accept: "application/json",
      },
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

  console.log(`✅ Cached ${all.length} Webflow LIVE items`);
  return all;
}
