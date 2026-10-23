// VerHentai (ver-hentai.online) — Hentai sub español
// v1.2.0: miniaturas, servidores reales (sin anuncios), reproducción en todas las filas

const BASE = "https://www.ver-hentai.online";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Dominios de anuncio / tracking / captcha — nunca usar como stream
const AD_HOSTS =
  /benchform\.org|biomanos\.org|exoclick|magsrv|pemsrv|popunder|doubleclick|googlesyndication|adservice|histats|clickadu|juicyads|trafficjunky|adsterra|propeller|tsyndicate|es\.xxxgames|vhentaicommunity\.jimdofree|comunidad\.hentaird|t\.me|tiktok\.com|instagram\.com|youtube\.com|facebook\.com/i;

// Embeds que suelen pedir captcha o no dan stream usable en Kino
const SKIP_EMBED =
  /do7go\.com|dood\.(watch|stream|to|la|ws|so|pm|sh|work)|ds2play|ds2video|playmogo\.com/i;

const PREFERRED = [
  "Filemoon",
  "Lulu",
  "SaveFiles",
  "Voe",
  "Gupload",
  "VidHide",
  "Sendvid",
  "UpFiles",
  "UsersDrive",
  "Firestream",
];

function log(...args) {
  try {
    kino.log(...args);
  } catch {}
}

async function fetchText(url) {
  const r = await kino.fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Referer: BASE + "/",
    },
    cookies: false,
    timeoutMs: 15000,
  });
  if (!r.ok) throw kino.error("unavailable", "ver-hentai.online respondió " + r.status);
  return r.text();
}

function cleanTitle(t) {
  return String(t || "")
    .replace(/\s+/g, " ")
    .replace(/Sub Español/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim()
    .slice(0, 200);
}

function isAdUrl(url) {
  if (!url) return true;
  try {
    const h = new URL(url).hostname;
    if (AD_HOSTS.test(h)) return true;
  } catch {
    return true;
  }
  return false;
}

function pickPoster(block) {
  if (!block) return undefined;
  // Prefer real covers from zx89 CDN
  const patterns = [
    /src="(https?:\/\/[^"]*zx89\.site\/hentai\/(?:portadas|miniportadas|covers)[^"]+)"/i,
    /src="(https?:\/\/[^"]*zx89\.site\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    /src="(https?:\/\/[^"]*hentaisd\.tv\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    /src="(https?:\/\/[^"]+(?:portadas|miniportadas|covers|poster)[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    /src="(https?:\/\/s4\.zx89\.site\/[^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (m && !isAdUrl(m[1])) return m[1].replace(/&amp;/g, "&");
  }
  return undefined;
}

function seriesFromEpisodePath(path) {
  // /hentaionline/slug-3.html → { seriesSlug, epNum }
  const m = String(path).match(/\/hentaionline\/([a-z0-9\-_.]+)-(\d+)\.html/i);
  if (!m) return null;
  return { seriesSlug: m[1], epNum: parseInt(m[2], 10) };
}

/**
 * Parse series/episode cards from any listing page.
 * Handles <article> (directorio) and a.episode-card (home "nuevos").
 */
function parseCards(html) {
  const items = [];
  const seen = new Set();

  // Strip scripts so we don't pick JSON carousel entries without real cards
  const body = String(html).replace(/<script[\s\S]*?<\/script>/gi, " ");

  function pushSeries(slug, title, poster) {
    if (!slug || seen.has(slug)) return;
    if (/^(page|login|register|search|dir)/i.test(slug)) return;
    seen.add(slug);
    items.push({
      id: slug,
      ref: "series:" + slug,
      title: cleanTitle(title || slug.replace(/-/g, " ")),
      kind: "series",
      poster: poster || undefined,
      adult: true,
      lang: "es",
      genres: ["anime"],
    });
  }

  // 1) <article>…</article> (directorio, más vistos, sin censura)
  const articles = body.match(/<article[\s\S]*?<\/article>/gi) || [];
  for (const art of articles) {
    const hrefM = art.match(
      /href="((?:https?:\/\/[^"]+)?\/infohentai\/([a-z0-9\-_.]+)\.html)"/i
    );
    if (!hrefM) continue;
    const slug = hrefM[2];
    const title =
      (art.match(/alt="([^"]{2,160})"/i) ||
        art.match(/<h[23][^>]*>\s*([^<]+)/i) ||
        [])[1] || slug;
    pushSeries(slug, title, pickPoster(art));
  }

  // 2) episode-card blocks (home "nuevos")
  const epCards =
    body.match(/<a[^>]+class="[^"]*episode-card[^"]*"[\s\S]*?<\/a>/gi) || [];
  for (const card of epCards) {
    const hrefM = card.match(
      /href="(?:https?:\/\/[^"]+)?\/hentaionline\/([a-z0-9\-_.]+)-(\d+)\.html"/i
    );
    if (!hrefM) continue;
    const seriesSlug = hrefM[1];
    const title =
      (card.match(/alt="([^"]{2,160})"/i) ||
        card.match(/<h[23][^>]*>\s*([^<]+)/i) ||
        [])[1] || seriesSlug;
    const clean = String(title).replace(/\s*[-–]\s*Episodio\s*\d+/i, "").trim();
    pushSeries(seriesSlug, clean, pickPoster(card));
  }

  // 3) Fallback: any /infohentai/ link with nearby poster
  if (items.length < 3) {
    const re =
      /href="(?:https?:\/\/[^"]+)?(\/infohentai\/([a-z0-9\-_.]+)\.html)"/gi;
    let m;
    while ((m = re.exec(body))) {
      const slug = m[2];
      if (seen.has(slug)) continue;
      const start = Math.max(0, m.index - 200);
      const end = Math.min(body.length, m.index + 1800);
      const block = body.slice(start, end);
      const poster = pickPoster(block);
      if (!poster) continue;
      const title =
        (block.match(/alt="([^"]{2,160})"/i) ||
          block.match(/<h[23][^>]*>\s*([^<]+)/i) ||
          [])[1] || slug;
      pushSeries(slug, title, poster);
    }
  }

  // 4) Fallback episode links
  if (items.length < 5) {
    const epRe =
      /href="(?:https?:\/\/[^"]+)?(\/hentaionline\/([a-z0-9\-_.]+)-(\d+)\.html)"/gi;
    let em;
    while ((em = epRe.exec(body))) {
      const seriesSlug = em[2];
      if (seen.has(seriesSlug)) continue;
      const start = Math.max(0, em.index - 150);
      const end = Math.min(body.length, em.index + 1200);
      const block = body.slice(start, end);
      const title =
        (block.match(/alt="([^"]{2,160})"/i) || [])[1] || seriesSlug;
      const clean = String(title).replace(/\s*[-–]\s*Episodio\s*\d+/i, "").trim();
      pushSeries(seriesSlug, clean, pickPoster(block));
    }
  }

  return items;
}

function parseEpisodeList(html, seriesSlug) {
  const episodes = [];
  const found = new Set();
  const esc = seriesSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    "href=\"(?:https?:\\/\\/[^\"]+)?\\/hentaionline\\/" + esc + "-(\\d+)\\.html\"",
    "gi"
  );
  let m;
  while ((m = re.exec(html))) {
    const num = parseInt(m[1], 10);
    if (!num || found.has(num)) continue;
    found.add(num);
    episodes.push({
      season: 1,
      number: num,
      ref: "ep:" + seriesSlug + ":" + num,
      title: "Episodio " + num,
    });
  }
  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

function serverLabel(url) {
  const u = url.toLowerCase();
  if (u.includes("byseraguci") || u.includes("filemoon")) return "Filemoon";
  if (u.includes("voe.sx") || u.includes("voe-")) return "Voe";
  if (u.includes("firestream")) return "Firestream";
  if (u.includes("streamhls") || u.includes("savefiles")) return "SaveFiles";
  if (u.includes("luluvid") || u.includes("luluvido")) return "Lulu";
  if (u.includes("gupload")) return "Gupload";
  if (u.includes("vidhide")) return "VidHide";
  if (u.includes("sendvid")) return "Sendvid";
  if (u.includes("upfiles")) return "UpFiles";
  if (u.includes("usersdrive")) return "UsersDrive";
  if (u.includes("dood") || u.includes("do7go") || u.includes("playmogo")) return "Doodstream";
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "Servidor";
  }
}

function toEmbedUrl(url) {
  return String(url)
    .replace(/\\\\/g, "")
    .replace(/\\\//g, "/")
    .replace(/\\u002F/gi, "/")
    .replace(/\/(d|w|v)\//, "/e/")
    .replace(/\/f\//, "/e/");
}

function extractServers(html) {
  const servers = [];
  const seen = new Set();

  function add(raw) {
    if (!raw) return;
    let url = toEmbedUrl(String(raw).trim().replace(/&amp;/g, "&"));
    if (!/^https?:\/\//i.test(url)) return;
    if (isAdUrl(url)) return;
    if (SKIP_EMBED.test(url)) return; // captcha / unreliable
    // only known video hosts
    if (
      !/(voe\.sx|firestream\.to|streamhls\.to|luluvid|luluvido|filemoon|byseraguci|savefiles|gupload|vidhide|sendvid|upfiles\.com|usersdrive)/i.test(
        url
      )
    ) {
      return;
    }
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    servers.push({ label: serverLabel(url), url });
  }

  // Plain URLs
  const hostRe =
    /(https?:\/\/(?:voe\.sx|firestream\.to|streamhls\.to|luluvid\.com|luluvido\.com|filemoon\.[a-z]+|byseraguci\.com|savefiles\.com|gupload\.site|vidhidepro\.com|sendvid\.com|upfiles\.com|usersdrive\.com)\/[^\s"'<>\\&]+)/gi;
  let m;
  while ((m = hostRe.exec(html))) add(m[1]);

  // HTML-entity encoded JSON: embed_code&quot;:&quot;https:\/\/...
  const entRe = /embed_code&quot;:&quot;(https?:\\\/\\\/[^&]+)/gi;
  while ((m = entRe.exec(html))) {
    add(m[1].replace(/\\\//g, "/"));
  }

  // Escaped JSON in scripts
  const escRe = /"embed_code"\s*:\s*"(https?:\\\/\\\/[^"]+)"/gi;
  while ((m = escRe.exec(html))) {
    add(m[1].replace(/\\\//g, "/"));
  }

  // iframe src
  const iframeRe = /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = iframeRe.exec(html))) add(m[1]);

  servers.sort((a, b) => {
    const ai = PREFERRED.indexOf(a.label);
    const bi = PREFERRED.indexOf(b.label);
    return (ai === -1 ? 50 : ai) - (bi === -1 ? 50 : bi);
  });

  return servers;
}

export async function search(query) {
  const q = (query && query.q ? query.q : "").trim();
  if (!q) return [];

  const urls = [
    BASE + "/directorio?search=" + encodeURIComponent(q),
    BASE + "/dir-hentai/?search=" + encodeURIComponent(q),
  ];

  let items = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      items = parseCards(html);
      if (items.length) break;
    } catch (e) {
      log("search failed", url, e.message);
    }
  }

  if (items.length < 3) {
    try {
      const html = await fetchText(BASE + "/dir-hentai/");
      const all = parseCards(html);
      const lower = q.toLowerCase();
      items = all.filter((it) => it.title.toLowerCase().includes(lower)).slice(0, 40);
    } catch (e) {
      log("fallback search", e.message);
    }
  }

  return items.slice(0, 50);
}

export async function home() {
  const rows = [];

  async function addRow(id, title, path, limit, genre) {
    try {
      const html = await fetchText(BASE + path);
      const items = parseCards(html).slice(0, limit);
      if (items.length) {
        const row = { id, title, items, ref: "lista:" + id };
        if (genre) row.genre = genre;
        rows.push(row);
      }
    } catch (e) {
      log("home", id, e.message);
    }
  }

  await addRow("nuevos", "Nuevos capítulos", "/", 36);
  await addRow("vistos", "Más vistos", "/hentai-mas-vistos.html", 36);
  await addRow("sincensura", "Sin censura", "/hentai-sin-censura.html", 30);
  await addRow("directorio", "Directorio", "/dir-hentai/", 48, "anime");

  return rows;
}

export async function browse(ref, cursor) {
  const map = {
    "lista:nuevos": "/",
    "lista:vistos": "/hentai-mas-vistos.html",
    "lista:sincensura": "/hentai-sin-censura.html",
    "lista:directorio": "/dir-hentai/",
  };

  const path = map[ref] || "/dir-hentai/";
  const page = cursor ? parseInt(cursor, 10) || 1 : 1;

  let url = BASE + path;
  if (page > 1) {
    url += (url.includes("?") ? "&" : "?") + "page=" + page;
  }

  const html = await fetchText(url);
  const items = parseCards(html).slice(0, 48);

  let next = undefined;
  if (
    html.includes("page=" + (page + 1)) ||
    html.includes("?page=" + (page + 1)) ||
    items.length >= 20
  ) {
    next = String(page + 1);
  }

  return next ? { items, next } : { items };
}

export async function episodes(ref) {
  const seriesSlug = String(ref || "").replace(/^series:/, "");
  if (!seriesSlug) throw kino.error("not_found", "Serie no encontrada");

  let html = null;
  const candidates = [
    BASE + "/infohentai/" + seriesSlug + ".html",
    BASE + "/infohentai/" + seriesSlug.replace(/_/g, "-") + ".html",
  ];
  let lastErr = null;
  for (const url of candidates) {
    try {
      html = await fetchText(url);
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!html) {
    // Try episode 1 page and discover series link
    try {
      const epHtml = await fetchText(BASE + "/hentaionline/" + seriesSlug + "-1.html");
      const link = epHtml.match(/href="(\/infohentai\/[a-z0-9\-_.]+\.html)"/i);
      if (link) {
        html = await fetchText(BASE + link[1]);
      } else {
        const eps = parseEpisodeList(epHtml, seriesSlug);
        if (eps.length) {
          return {
            series: {
              title: cleanTitle(seriesSlug.replace(/-/g, " ")),
              genres: ["anime"],
            },
            episodes: eps,
          };
        }
        throw lastErr || kino.error("not_found", "Serie no encontrada");
      }
    } catch (e2) {
      throw lastErr || e2;
    }
  }

  let episodes = parseEpisodeList(html, seriesSlug);
  if (!episodes.length) {
    // Some series pages only list episode numbers differently
    const loose = html.match(
      new RegExp(
        "/hentaionline/" +
          seriesSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "-(\\d+)\\.html",
        "gi"
      )
    );
    if (loose && loose.length) {
      episodes = parseEpisodeList(html, seriesSlug);
    }
  }
  if (!episodes.length) {
    // At least offer ep 1
    episodes = [{ season: 1, number: 1, ref: "ep:" + seriesSlug + ":1", title: "Episodio 1" }];
  }

  let title = seriesSlug.replace(/-/g, " ");
  const titleMatch =
    html.match(/<h1[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
    html.match(/<h1[^>]*>([^<]+)/i) ||
    html.match(/og:title" content="([^"]+)"/i);
  if (titleMatch) title = cleanTitle(titleMatch[1]);

  let poster = pickPoster(html);
  if (!poster) {
    const og = html.match(/og:image" content="([^"]+)"/i);
    if (og && !isAdUrl(og[1])) poster = og[1];
  }

  let overview;
  const sinMatch = html.match(
    /(?:Sinopsis|Descripción)[\s\S]{0,80}?<p[^>]*>([\s\S]{20,600}?)<\/p>/i
  );
  if (sinMatch) overview = sinMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 500);

  return {
    series: { title, poster, overview, genres: ["anime"] },
    episodes,
  };
}

export async function resolve(ref) {
  function pickMedia(page) {
    const list = Array.isArray(page) ? page : (page && page.media) || [];
    if (!list.length) return null;
    const score = (c) => {
      const u = (c.url || "") + " " + (c.mime || "");
      if (!c.url || !/^https?:\/\//i.test(c.url)) return -1;
      if (/blob:|data:/i.test(c.url)) return -1;
      if (isAdUrl(c.url)) return -1;
      if (/\/e\/[a-z0-9]+\/?$/i.test(c.url) && !/m3u8|mp4|mpd/i.test(u)) return -1;
      let s = 0;
      if (/m3u8|\.mpd|mpegurl|dash\+xml/i.test(u)) s += 100;
      if (/\.mp4(\?|$)|video\/mp4/i.test(u)) s += 50;
      if (/\/hls\/|playlist|manifest|master|urlset/i.test(u)) s += 30;
      return s;
    };
    let best = null;
    let bestScore = -1;
    for (const c of list) {
      const sc = score(c);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    return bestScore >= 0 ? best : null;
  }

  function streamFrom(media, embedUrl, label, alternatives) {
    let embedOrigin;
    try {
      embedOrigin = new URL(embedUrl).origin;
    } catch {}

    const headers = Object.assign({}, media.headers || {});
    if (!headers["User-Agent"] && !headers["user-agent"]) headers["User-Agent"] = UA;
    if (!headers.Referer && !headers.referer) headers.Referer = embedUrl;
    if (!headers.Origin && !headers.origin && embedOrigin) headers.Origin = embedOrigin;

    const isHls = /m3u8|\.mpd|mpegurl/i.test(media.url + " " + (media.mime || ""));
    const out = {
      url: media.url,
      mime: media.mime || (isHls ? "application/vnd.apple.mpegurl" : undefined),
      headers,
      label: label || "Servidor",
    };
    if (alternatives && alternatives.length) out.alternatives = alternatives;
    return out;
  }

  function urlsFromHtml(html) {
    const found = [];
    const re = /(https?:\/\/[^"'\\\s<>]+(?:\.m3u8|\.mpd|\.mp4)[^"'\\\s<>]*)/gi;
    let m;
    while ((m = re.exec(html))) {
      const u = m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      if (!isAdUrl(u)) found.push(u);
    }
    const srcRe =
      /["'](?:src|file|source|url)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = srcRe.exec(html))) {
      if (/\.m3u8|\.mp4|\.mpd|\/hls\/|playlist/i.test(m[1]) && !isAdUrl(m[1])) {
        found.push(m[1]);
      }
    }
    return [...new Set(found)];
  }

  async function captureEmbed(embedUrl, label) {
    log("capture", label || "", embedUrl);
    let host = "";
    try {
      host = new URL(embedUrl).hostname;
    } catch {}

    if (SKIP_EMBED.test(host) || isAdUrl(embedUrl)) {
      log("skip ad/captcha host", host);
      return null;
    }

    try {
      const timeoutMs = label === "SaveFiles" || label === "Voe" || label === "Filemoon" ? 18000 : 14000;
      const page = await kino.browser.capture(embedUrl, {
        timeoutMs,
        headers: { Referer: BASE + "/", "User-Agent": UA },
        match:
          "m3u8|\\.mpd|\\.mp4|master|playlist|/hls/|videoplayback|manifest|index\\.m3u|urlset",
      });
      const media = pickMedia(page);
      if (media) {
        log("capture ok", label || "", media.url.slice(0, 140));
        return media;
      }
    } catch (e) {
      const msg = e.message || String(e);
      log("capture err", label || "", msg);
      if (/confirm a human|captcha|blocked/i.test(msg)) return null;
    }

    if (kino.browser && typeof kino.browser.page === "function") {
      try {
        const doc = await kino.browser.page(embedUrl, {
          timeoutMs: 8000,
          headers: { Referer: BASE + "/", "User-Agent": UA },
        });
        const html = (doc && (doc.html || doc.text || doc.body)) || "";
        const urls = urlsFromHtml(html);
        if (urls.length) {
          const u = urls.find((x) => /m3u8/i.test(x)) || urls[0];
          log("page-extract ok", label || "", u.slice(0, 140));
          return {
            url: u,
            mime: /m3u8/i.test(u) ? "application/vnd.apple.mpegurl" : undefined,
            headers: { Referer: embedUrl, "User-Agent": UA },
          };
        }
      } catch (e) {
        log("page fallback", label || "", e.message);
      }
    }

    try {
      const r = await kino.fetch(embedUrl, {
        headers: { "User-Agent": UA, Referer: BASE + "/", Accept: "text/html,*/*" },
        cookies: false,
        timeoutMs: 8000,
      });
      if (r.ok) {
        const urls = urlsFromHtml(await r.text());
        if (urls.length) {
          const u = urls.find((x) => /m3u8/i.test(x)) || urls[0];
          log("fetch-extract ok", label || "", u.slice(0, 140));
          return {
            url: u,
            mime: /m3u8/i.test(u) ? "application/vnd.apple.mpegurl" : undefined,
            headers: { Referer: embedUrl, "User-Agent": UA },
          };
        }
      }
    } catch (e) {
      log("fetch fallback", label || "", e.message);
    }
    return null;
  }

  // Lazy alternative: embed:URL
  if (String(ref).startsWith("embed:")) {
    const embedUrl = decodeURIComponent(String(ref).slice(6));
    if (isAdUrl(embedUrl) || SKIP_EMBED.test(embedUrl)) {
      throw kino.error("unavailable", "Servidor no disponible (anuncio o captcha)");
    }
    try {
      const media = await captureEmbed(embedUrl, serverLabel(embedUrl));
      if (media) return streamFrom(media, embedUrl, serverLabel(embedUrl));
    } catch (e) {
      log("lazy embed failed", e.message);
    }
    throw kino.error("unavailable", "No se pudo cargar este servidor");
  }

  let seriesSlug, epNum;
  if (String(ref).startsWith("ep:")) {
    const parts = String(ref).slice(3).split(":");
    seriesSlug = parts[0];
    epNum = parseInt(parts[1], 10);
  } else if (String(ref).startsWith("series:")) {
    seriesSlug = String(ref).slice(7);
    epNum = 1;
  } else {
    throw kino.error("not_found", "Referencia inválida");
  }
  if (!seriesSlug || !epNum) throw kino.error("not_found", "Episodio no encontrado");

  const pageUrl = BASE + "/hentaionline/" + seriesSlug + "-" + epNum + ".html";
  let html;
  try {
    html = await fetchText(pageUrl);
  } catch (e) {
    throw kino.error(
      "unavailable",
      "Episodio no disponible (" + seriesSlug + "-" + epNum + ")"
    );
  }

  const servers = extractServers(html);
  if (!servers.length) {
    throw kino.error(
      "unavailable",
      "No hay servidores reproducibles (solo anuncios o captcha)"
    );
  }

  const tried = [];
  const maxTry = Math.min(servers.length, 4);
  for (let i = 0; i < maxTry; i++) {
    const s = servers[i];
    tried.push(s.label);
    try {
      const media = await captureEmbed(s.url, s.label);
      if (media) {
        const alternatives = servers
          .filter((_, j) => j !== i)
          .slice(0, 8)
          .map((x) => ({
            label: x.label,
            ref: "embed:" + encodeURIComponent(x.url),
          }));
        return streamFrom(media, s.url, s.label, alternatives);
      }
    } catch (e) {
      log("server failed", s.label, e.message);
    }
  }

  throw kino.error(
    "unavailable",
    "No se extrajo stream de: " + tried.join(", ") + ". Prueba otro servidor."
  );
}
