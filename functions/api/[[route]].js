// =====================================================================
//  Know Knowledge Academy - Resources Finder : online live-data API
//  Cloudflare Pages Function. Handles:
//    GET /api/health
//    GET /api/sources?kw=&city=&psc=&rcat=&roles=      -> list of sources
//    GET /api/source?i=<id>&<same params>[&refresh=1]  -> one source's items
//  Each source is fetched in its own request (keeps CPU per request small).
// =====================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 ResourcesFinder/1.0";

function json(obj, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
    },
  });
}

/* ---------------- sources (same as the PC server) ---------------- */
function GN(q) {
  if (!/when:\d+d/.test(q)) q += " when:30d";
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=en-PK&gl=PK&ceid=PK:en";
}
// Bing News RSS: backup when Google News refuses (it rate-limits cloud servers).
// Bing ignores "site:" in news search, so the site is turned into a plain keyword.
function BING(gnUrl) {
  let q = new URL(gnUrl).searchParams.get("q") || "";
  q = q.replace(/when:\d+d/g, "").replace(/site:([a-z0-9.\-]+)/gi, (m, d) => d.replace(/\.(pk|org|com|gov)$/i, "")).replace(/\s+/g, " ").trim();
  return "https://www.bing.com/news/search?q=" + encodeURIComponent(q) + "&format=rss&qft=interval%3d%229%22";
}
const S = (name, type, kind, url, ttl, label) => {
  const s = { name, type, kind, url, ttl, label: label || name };
  if (url.startsWith("https://news.google.com/")) s.fallback = { url: BING(url), kind: "rss", via: "Bing News" };
  return s;
};

function buildSources(p) {
  const kw = (p.kw || "HR").slice(0, 40), city = (p.city || "").slice(0, 40), psc = (p.psc || "").slice(0, 12);
  const rcat = (p.rcat || "").replace(/[^a-z\-]/g, "");
  const roles = (p.roles || "").split(",").map(s => s.trim().slice(0, 50)).filter(Boolean).slice(0, 2);
  const year = new Date().getFullYear();
  const L = [];
  // private jobs
  L.push(S(`Jobz.pk - ${kw} jobs`, "job", "rss", GN(`site:jobz.pk ${kw} jobs`), 45));
  if (city) {
    L.push(S(`Jobz.pk - ${kw} jobs in ${city}`, "job", "rss", GN(`site:jobz.pk ${kw} ${city}`), 45));
    L.push(S(`Jobz.pk - graduate jobs ${city}`, "job", "rss", GN(`site:jobz.pk graduate jobs ${city}`), 45));
  } else {
    L.push(S("Jobz.pk - graduate jobs", "job", "rss", GN("site:jobz.pk graduate jobs"), 45));
  }
  for (const r of roles) {
    const where = city || "Pakistan";
    L.push(S(`Web - ${r} jobs ${where}`, "job", "rss", GN(`"${r}" jobs ${where} when:14d`), 45));
  }
  if (rcat) L.push(S(`Remotive - remote ${kw} jobs`, "job", "remotive", `https://remotive.com/api/remote-jobs?category=${rcat}&limit=80`, 360, "Remotive"));
  // government
  const fp = S("FPSC - official advertisements", "govt", "fpsc", "https://www.fpsc.gov.pk/jobs", 60);
  fp.fallback = { url: GN("site:fpsc.gov.pk advertisement"), kind: "rss", via: "Google News (FPSC)" };
  L.push(fp);
  const gcity = city || "Pakistan";
  L.push(S(`Jobz.pk - govt jobs ${gcity}`, "govt", "rss", GN(`site:jobz.pk government jobs ${gcity}`), 45));
  L.push(S(`Jobz.pk - govt ${kw} jobs`, "govt", "rss", GN(`site:jobz.pk govt ${kw}`), 45));
  if (psc) L.push(S(`${psc} - jobs news`, "govt", "rss", GN(`${psc} jobs advertisement when:30d`), 60));
  // internships
  L.push(S("Jobz.pk - internships", "intern", "rss", GN("site:jobz.pk internship"), 60));
  L.push(S(`Web - internship programs ${year}`, "intern", "rss", GN(`internship program Pakistan ${year} when:30d`), 60));
  L.push(S("Web - management trainee programs", "intern", "rss", GN("management trainee program Pakistan when:30d"), 60));
  // scholarships
  L.push(S("Opportunities for Youth", "schol", "rss", "https://opportunitiesforyouth.org/feed/", 120, "Opportunities for Youth"));
  L.push(S("Opportunities for Youth (2)", "schol", "rss", "https://opportunitiesforyouth.org/feed/?paged=2", 120, "Opportunities for Youth"));
  L.push(S("Scholars4Dev", "schol", "rss", "https://www.scholars4dev.com/feed/", 120, "Scholars4Dev"));
  L.push(S("Opportunity Desk", "schol", "rss", "https://opportunitydesk.org/feed/", 120, "Opportunity Desk"));
  L.push(S("Web - fully funded scholarships", "schol", "rss", GN(`fully funded scholarship ${year} Pakistani students when:30d`), 120));
  L.push(S("Web - HEC scholarships", "schol", "rss", GN("HEC scholarship when:30d"), 120));
  return L;
}

/* ---------------- parsing helpers ---------------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", rarr: "→" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const v = ENT[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}
function clean(s, max = 0) {
  if (!s) return "";
  s = s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
  s = decode(s);
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  s = decode(s).replace(/\s+/g, " ").trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}
function tag(s, t) {
  const m = s.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`));
  return m ? m[1] : "";
}
const item = (src, title, link, source, posted, summary, text, location) =>
  ({ title, link, source, kind: src.type, posted, summary, text, location, origin: src.name });

function parseRss(body, src) {
  const out = [];
  for (const m of body.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const x = m[0];
    let title = clean(tag(x, "title"));
    const link = clean(tag(x, "link"));
    const date = clean(tag(x, "pubDate"));
    const desc = clean(tag(x, "description"));
    const cont = clean(tag(x, "content:encoded").slice(0, 15000), 2500);
    const source = clean(tag(x, "source")) || clean(tag(x, "News:Source")) || src.label;
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    let summary = desc.startsWith(title) ? "" : desc;
    if (summary.length > 300) summary = summary.slice(0, 300) + "...";
    const text = cont.length >= desc.length ? cont : desc;
    if (title && link) out.push(item(src, title, link, source, date, summary, text, ""));
  }
  return out;
}

function parseFpsc(body, src) {
  const out = [];
  const rx = /<p[^>]*>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*<\/p>\s*<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<p[^>]*>\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*<\/p>\s*<h2|$)/g;
  for (const m of body.matchAll(rx)) {
    const pdf = m[3].match(/href="([^"]+\.pdf)"/i);
    let link = "https://www.fpsc.gov.pk/jobs";
    if (pdf) link = pdf[1].startsWith("/") ? "https://www.fpsc.gov.pk" + pdf[1] : pdf[1];
    out.push(item(src, "FPSC: " + clean(m[2]), link, "FPSC (official)", m[1], "", clean(m[3], 1200), "Pakistan"));
    if (out.length >= 15) break;
  }
  return out;
}

function parseRemotive(body, src) {
  const out = [];
  const j = JSON.parse(body);
  for (const job of j.jobs || []) {
    const loc = String(job.candidate_required_location || "");
    if (!/worldwide|anywhere|asia|pakistan|apac|global|emea/i.test(loc)) continue;
    const desc = clean(String(job.description || "").slice(0, 20000), 2000);
    out.push(item(src, String(job.title), String(job.url), "Remotive - " + job.company_name, String(job.publication_date),
      desc.length > 280 ? desc.slice(0, 280) + "..." : desc, desc, `Remote (${loc})`));
    if (out.length >= 40) break;
  }
  return out;
}

/* ---------------- fetching + caching ---------------- */
async function fetchText(url, force, ttlMin) {
  let last;
  for (let t = 0; t < 3; t++) {
    if (t > 0) await new Promise(r => setTimeout(r, 700 * t + Math.random() * 600));   // back off before retrying
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, application/json, text/html, */*" },
        signal: ac.signal,
        cf: force ? { cacheTtl: 0 } : { cacheTtl: ttlMin * 60, cacheEverything: true },
      });
      if (!r.ok) {
        const err = new Error("HTTP " + r.status);
        if (r.status !== 429 && r.status < 500) { err.fatal = true; }
        throw err;
      }
      return await r.text();
    } catch (e) {
      last = e;
      if (e.fatal) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

async function getSource(src, force, ctx) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://kka-cache.internal/v2/" + encodeURIComponent(src.url));
  const staleKey = new Request("https://kka-cache.internal/v2-stale/" + encodeURIComponent(src.url));
  if (cache && !force) {
    try { const hit = await cache.match(key); if (hit) return { ...(await hit.json()), cached: true }; } catch (e) { }
  }
  try {
    let items, via = null;
    try {
      const body = await fetchText(src.url, force, src.ttl);
      items = src.kind === "fpsc" ? parseFpsc(body, src) : src.kind === "remotive" ? parseRemotive(body, src) : parseRss(body, src);
    } catch (e1) {
      if (!src.fallback) throw e1;
      const body = await fetchText(src.fallback.url, force, src.ttl);
      items = parseRss(body, src);
      via = src.fallback.via;
    }
    const d = { ok: true, items, error: null, via, fetchedAt: new Date().toISOString() };
    if (cache) {
      const str = JSON.stringify(d);
      const put = (k, age) => cache.put(k, new Response(str, { headers: { "content-type": "application/json", "cache-control": `max-age=${age}` } }));
      ctx.waitUntil(Promise.all([put(key, src.ttl * 60), put(staleKey, 7 * 86400)]).catch(() => { }));
    }
    return { ...d, cached: false };
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "Timed out" : String((e && e.message) || e);
    if (cache) {
      try { const old = await cache.match(staleKey); if (old) return { ...(await old.json()), stale: true, error: msg }; } catch (_) { }
    }
    return { ok: false, items: [], error: msg };
  }
}

/* ---------------- router ---------------- */
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const p = Object.fromEntries(url.searchParams);
  if (path === "/api/health") return json({ ok: true, version: 3, mode: "cloud" });
  if (path === "/api/sources") {
    return json({ v: 2, sources: buildSources(p).map((s, i) => ({ id: i, name: s.name, type: s.type })) });
  }
  if (path === "/api/source") {
    const list = buildSources(p);
    const src = list[parseInt(p.i, 10)];
    if (!src) return json({ error: "Unknown source" }, 400);
    const force = p.refresh === "1";
    const d = await getSource(src, force, ctx);
    return json({ ...d, name: src.name, type: src.type }, 200, force || !d.ok ? 0 : Math.min(src.ttl, 30) * 60);
  }
  return json({ error: "Not found" }, 404);
}
