// netlify/functions/reports.js
export async function handler(event, context) {
  const API_TOKEN = process.env.WEBFLOW_API_TOKEN; // stored securely in Netlify
  const COLLECTION_ID = "68a1d701da54a513636c4391"; // replace with your real Webflow collection ID

  try {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Webflow API responded with ${res.status}`);
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // allows Webflow frontend to call
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}