// netlify/functions/reports.js
export async function handler(event, context) {
  const API_TOKEN = process.env.WEBFLOW_API_TOKEN; // stored securely in Netlify
  const COLLECTION_ID = "68a1d701da54a513636c4391"; // your Webflow collection ID

  const PAGE_LIMIT = 100;
  let offset = 0;
  let allItems = [];

  try {
    // Fetch all collection items in pages of 100
    while (true) {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items?limit=${PAGE_LIMIT}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Webflow API responded ${res.status}: ${txt}`);
      }

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      allItems = allItems.concat(items);

      if (items.length < PAGE_LIMIT) break; // stop when fewer than limit returned
      offset += PAGE_LIMIT;
    }

    // ——— Handle sorting
    const sortParam = event.queryStringParameters?.sort || "date-desc";
    if (sortParam.startsWith("date")) {
      allItems.sort((a, b) => {
        const dateA = new Date(a.fieldData?.["datum-a-cas-publikovani"] || a.lastPublished).getTime();
        const dateB = new Date(b.fieldData?.["datum-a-cas-publikovani"] || b.lastPublished).getTime();
        if (sortParam === "date-asc") return dateA - dateB;
        return dateB - dateA; // default: date-desc
      });
    }

    // ——— Handle limit
    const limitParam = parseInt(event.queryStringParameters?.limit || "0", 10);
    if (limitParam > 0) {
      allItems = allItems.slice(0, limitParam);
    }

    // ——— Return response
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // allow Webflow frontend
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: allItems }),
    };
  } catch (err) {
    console.error("❌ Netlify function error:", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
