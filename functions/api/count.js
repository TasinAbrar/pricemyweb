// PriceMyWeb — live counter
// Cloudflare Pages Function. Path in your repo: functions/api/count.js
// GET  /api/count  -> { "count": <number> }        (read current total)
// POST /api/count  -> { "count": <number+1> }       (increment on each appraisal)
//
// Requires a KV namespace bound to this project with the variable name: COUNTER
// (Cloudflare dashboard -> your Pages project -> Settings -> Functions ->
//  KV namespace bindings -> Add -> Variable name: COUNTER)

export async function onRequest(context) {
  const { request, env } = context;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  // If the KV binding isn't set up yet, respond gracefully so the site still works.
  if (!env.COUNTER) {
    return new Response(JSON.stringify({ count: null, error: "no-kv-binding" }), { headers });
  }

  const KEY = "total";
  let count = parseInt(await env.COUNTER.get(KEY), 10) || 0;

  if (request.method === "POST") {
    count += 1;
    await env.COUNTER.put(KEY, String(count));
  }

  return new Response(JSON.stringify({ count }), { headers });
}
