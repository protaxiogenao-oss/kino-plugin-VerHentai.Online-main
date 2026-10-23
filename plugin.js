// VerHentai (ver-hentai.online) — Hentai sub español
// apiVersion 6 + browser pages for embed resolution

const BASE = "https://www.ver-hentai.online";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
    .trim()
    .slice(0, 200);
}

function parseCards(html) {
  const items = [];
  const seen = new Set();

  const cardRe =
    /<a[^>]+href="(\/infohentai\/([a-z0-9\-_.]+)\.html)"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  let m;
  while ((m = cardRe.exec(html))) {
    const slug = m[2];
    if (!slug || seen.has(slug)) continue;
    const block = m[3];
    const title =
      (block.match(/alt="([^"]{2,120})"/i) ||
        block.match(/<h[23][^>]*>\s*([^<]+)/i) ||
        block.match(/title="([^"]{2,120})"/i) ||
        [])[1] || slug.replace(/-/g, " ");
    const poster =
      (block.match(/src="(https?:\/\/[^"]*zx89[^"]+)"/i) ||
        block.match(/src="(https?:\/\/[^"]+(?:covers|cover|poster)[^"]+)"/i) ||
        [])[1];
    seen.add(slug);
    items.push({
      id: slug,
      ref: "series:" + slug,
      title: cleanTitle(title),
      kind: "series",
      poster,
      adult: true,
      lang: "es",
    });
  }

  const epCardRe =
    /<a[^>]+href="(\/hentaionline\/([a-z0-9\-_.]+)-(\d+)\.html)"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  while ((m = epCardRe.exec(html))) {
    const seriesSlug = m[2];
    if (!seriesSlug || seen.has(seriesSlug)) continue;
    const block = m[4];
    const title =
      (block.match(/alt="([^"]{2,120})"/i) ||
        block.match(/<h[23][^>]*>\s*([^<]+)/i) ||
        block.match(/<h3[^>]*>\s*([^<]+)/i) ||
        [])[1] || seriesSlug.replace(/-/g, " ");
    const poster =
      (block.match(/src="(https?:\/\/[^"]*zx89[^"]+)"/i) ||
        block.match(/src="(https?:\/\/[^"]+(?:covers|cover|poster|slides)[^"]+)"/i) ||
        [])[1];
    seen.add(seriesSlug);
    items.push({
      id: seriesSlug,
      ref: "series:" + seriesSlug,
      title: cleanTitle(title),
      kind: "series",
      poster,
      adult: true,
      lang: "es",
    });
  }

  if (items.length < 5) {
    const re2 = /href="\/infohentai\/([a-z0-9\-_.]+)\.html"/gi;
    while ((m = re2.exec(html))) {
      const slug = m[1];
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      items.push({
        id: slug,
        ref: "series:" + slug,
        title: cleanTitle(slug.replace(/-/g, " ")),
        kind: "series",
        adult: true,
        lang: "es",
      });
    }
  }

  return items;
}

function parseEpisodeList(html, seriesSlug) {
  const episodes = [];
  const found = new Set();
  const re = new RegExp(
    "href=\"/hentaionline/" +
      seriesSlug.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") +
      "-(\\d+)\\.html\"",
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
  if (u.includes("dood") || u.includes("do7go")) return "Doodstream";
  if (u.includes("gupload")) return "Gupload";
  if (u.includes("vidhide")) return "VidHide";
  if (u.includes("sendvid")) return "Sendvid";
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
    .replace(/\/(d|w|v)\//, "/e/")
    .replace(/\/f\//, "/e/");
}

function extractServers(html) {
  const servers = [];
  const seen = new Set();

  function add(raw) {
    if (!raw) return;
    let url = toEmbedUrl(String(raw).trim());
    if (!/^https?:\/\//i.test(url)) return;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    servers.push({ label: serverLabel(url), url });
  }

  const hostRe =
    /(https?:\/\/(?:voe\.sx|firestream\.to|streamhls\.to|luluvid\.com|luluvido\.com|filemoon\.[a-z]+|dood\.[a-z.]+|do7go\.com|gupload\.site|savefiles\.com|byseraguci\.com|vidhidepro\.com|sendvid\.com)\/[^\s"'<>\\&]+)/gi;
  let m;
  while ((m = hostRe.exec(html))) add(m[1].replace(/&amp;/g, "&"));

  const entRe = /embed_code&quot;:&quot;(https?:\\\/\\\/[^&]+)/gi;
  while ((m = entRe.exec(html))) {
    add(m[1].replace(/\\\//g, "/"));
  }

  const preferred = [
    "SaveFiles",
    "Voe",
    "Lulu",
    "Filemoon",
    "Firestream",
    "Gupload",
    "Doodstream",
    "Sendvid",
    "VidHide",
  ];
  servers.sort((a, b) => {
    const ai = preferred.indexOf(a.label);
    const bi = preferred.indexOf(b.label);
    return (ai === -1 ? 50 : ai) - (bi === -1 ? 50 : bi);
  });

  return servers;
}

export async function search(query) {
  const q = (query.q || "").trim();
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

  return items.map((it) => ({ ...it, adult: true })).slice(0, 50);
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

  try {
    const html2 = await fetchText(BASE + "/dir-hentai/?page=2");
    const more = parseCards(html2).slice(0, 40);
    if (more.length) {
      rows.push({
        id: "directorio2",
        title: "Más del directorio",
        items: more,
        ref: "lista:directorio",
      });
    }
  } catch (e) {
    log("home directorio2", e.message);
  }

  return rows;
}

export async function browse(ref, cursor) {
  const map = {
    "lista:nuevos": "/",
    "lista:vistos": "/hentai-mas-vistos.html",
    "lista:sincensura": "/hentai-sin-censura.html",
    "lista:directorio": "/dir-hentai/",
  };

  let path = map[ref] || "/dir-hentai/";
  let page = cursor ? parseInt(cursor, 10) || 1 : 1;

  let url = BASE + path;
  if (page > 1) {
    url += (url.includes("?") ? "&" : "?") + "page=" + page;
  }

  const html = await fetchText(url);
  const items = parseCards(html).slice(0, 48);

  let next = null;
  if (html.includes("page=" + (page + 1)) || html.includes("?page=" + (page + 1))) {
    next = String(page + 1);
  }

  return { items: items.map((it) => ({ ...it, adult: true })), next };
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
              genres: [],
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

  const episodes = parseEpisodeList(html, seriesSlug);
  if (!episodes.length) {
    throw kino.error("not_found", "No se encontraron episodios");
  }

  let title = seriesSlug.replace(/-/g, " ");
  const titleMatch =
    html.match(/<h1[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
    html.match(/<h1[^>]*>([^<]+)/i) ||
    html.match(/og:title" content="([^"]+)"/i);
  if (titleMatch) title = cleanTitle(titleMatch[1]);

  let poster;
  const posterMatch =
    html.match(/src="(https?:\/\/[^"]+zx89[^"]+)"/i) ||
    html.match(/og:image" content="([^"]+)"/i);
  if (posterMatch) poster = posterMatch[1];

  let overview;
  const sinMatch = html.match(
    /(?:Sinopsis|Descripción)[\s\S]{0,80}?<p[^>]*>([\s\S]{20,600}?)<\/p>/i
  );
  if (sinMatch) overview = sinMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 500);

  return {
    series: { title, poster, overview, genres: [] },
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

    // Prefer headers captured with the media request (Cookie, token…)
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
      found.push(m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/"));
    }
    const srcRe =
      /["'](?:src|file|source|url)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = srcRe.exec(html))) {
      if (/\.m3u8|\.mp4|\.mpd|\/hls\/|playlist/i.test(m[1])) found.push(m[1]);
    }
    return [...new Set(found)];
  }

  async function captureEmbed(embedUrl, label) {
    log("capture", label || "", embedUrl);
    let host = "";
    try {
      host = new URL(embedUrl).hostname;
    } catch {}

    // do7go / dood often force captcha — skip capture
    const captchaProne = /do7go|dood/i.test(host);

    if (!captchaProne) {
      try {
        const timeoutMs =
          label === "SaveFiles" || label === "Voe" ? 18000 : 12000;
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
        const urls = urlsFromHtml(r.text());
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

  if (ref.startsWith("embed:")) {
    const embedUrl = decodeURIComponent(ref.slice(6));
    try {
      const media = await captureEmbed(embedUrl, serverLabel(embedUrl));
      if (media) return streamFrom(media, embedUrl, serverLabel(embedUrl));
    } catch (e) {
      log("lazy embed failed", e.message);
    }
    throw kino.error("unavailable", "No se pudo cargar este servidor");
  }

  let seriesSlug, epNum;
  if (ref.startsWith("ep:")) {
    const parts = ref.slice(3).split(":");
    seriesSlug = parts[0];
    epNum = parseInt(parts[1], 10);
  } else if (ref.startsWith("series:")) {
    seriesSlug = ref.slice(7);
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
    throw kino.error("unavailable", "No se encontraron servidores");
  }

  // Only top 3 for speed (SaveFiles / Voe / Lulu first)
  const tried = [];
  const maxTry = Math.min(servers.length, 3);
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
