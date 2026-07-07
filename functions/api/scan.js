// PriceMyWeb — live URL reader
// Cloudflare Pages Function. Path in your repo: functions/api/scan.js
// GET /api/scan?url=https://example.com
// Fetches the page SERVER-SIDE (no browser CORS limit) and returns real signals:
// detected platform, frameworks, page structure, responsive/https/SEO, theme colour.
// It does NOT judge visual beauty (that needs a rendered screenshot) — it reads the code.

export async function onRequest(context) {
  const { request } = context;
  const H = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return new Response(JSON.stringify({ ok: false, error: "no-url" }), { headers: H });

  let target;
  try { target = new URL(raw); if (!/^https?:$/.test(target.protocol)) throw 0; }
  catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-url" }), { headers: H }); }

  // basic SSRF guard — refuse private / local addresses
  const host = target.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return new Response(JSON.stringify({ ok: false, error: "blocked-host" }), { headers: H });
  }

  try {
    const resp = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceMyWebBot/1.0; +https://pricemyweb.com)", "Accept": "text/html" },
      redirect: "follow",
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const html = (await resp.text()).slice(0, 600000);
    const out = analyze(html, target);
    out.ok = true;
    out.status = resp.status;
    return new Response(JSON.stringify(out), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "fetch-failed" }), { headers: H });
  }
}

function analyze(html, target) {
  const low = html.toLowerCase();
  const count = (re) => (html.match(re) || []).length;

  // ---- platform detection ----
  let platform = "Unknown";
  if (low.includes("/wp-content/") || low.includes("wp-json") || /generator["'][^>]*wordpress/i.test(html)) platform = "WordPress";
  else if (low.includes("cdn.shopify.com") || low.includes("shopify.com")) platform = "Shopify";
  else if (low.includes("wixstatic") || low.includes("wix.com")) platform = "Wix";
  else if (low.includes("squarespace")) platform = "Squarespace";
  else if (low.includes("webflow")) platform = "Webflow";
  else if (low.includes("framerusercontent") || low.includes("framer.com")) platform = "Framer";

  // ---- framework hints ----
  const fw = [];
  if (low.includes("/_next/") || low.includes("__next")) fw.push("Next.js");
  else if (low.includes("data-reactroot") || low.includes("react-dom")) fw.push("React");
  if (low.includes("ng-version")) fw.push("Angular");
  if (low.includes("__nuxt")) fw.push("Nuxt");
  else if (low.includes("data-v-") || /vue(\.min)?\.js/.test(low)) fw.push("Vue");
  if (low.includes("svelte")) fw.push("Svelte");
  if (low.includes("tailwind")) fw.push("Tailwind");
  if (low.includes("bootstrap")) fw.push("Bootstrap");

  // ---- structure ----
  const counts = {
    images: count(/<img[\s>]/gi),
    scripts: count(/<script[\s>]/gi),
    links: count(/<a\s/gi),
    forms: count(/<form[\s>]/gi),
    headings: count(/<h[1-3][\s>]/gi),
    inputs: count(/<input[\s>]/gi)
  };

  // ---- quality / meta signals ----
  const responsive = /<meta[^>]+viewport/i.test(html);
  const https = target.protocol === "https:";
  const fonts = /fonts\.googleapis|@font-face|font-family/i.test(html);
  const tc = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  const themeColor = tc ? tc[1] : null;
  const title = ((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "").trim();
  const seo = {
    hasTitle: !!title,
    hasDescription: /<meta[^>]+name=["']description["']/i.test(html),
    hasOpenGraph: /<meta[^>]+property=["']og:/i.test(html)
  };
  const ecomHint = /add[\s-]?to[\s-]?cart|woocommerce|["'\/]cart["'\/]|checkout/i.test(low);

  return { platform, frameworks: fw, counts, responsive, https, fonts, themeColor, seo, ecomHint, title: title.slice(0, 120) };
}
