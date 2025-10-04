// netlify/functions/reports.js
export async function handler(event, context) {
  const API_TOKEN = process.env.WEBFLOW_API_TOKEN; // stored securely in Netlify
  const COLLECTION_ID = "68a1d701da54a513636c4391"; // your Webflow collection ID

  const limit = 100;
  let offset = 0;
  let allItems = [];

  try {
    while (true) {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items?limit=${limit}&offset=${offset}`,
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

      if (items.length < limit) break; // stop when fewer than limit returned
      offset += limit;
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // allow Webflow frontend to call
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: allItems }),
    };
  } catch (err) {
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
