import fs from "node:fs/promises";

const DATA_FILE = new URL("../data/events.json", import.meta.url);

const SOURCES = [
  {
    key: "dallas",
    city: "Dallas",
    venue: "Kay Bailey Hutchison Convention Center Dallas",
    url: "https://www.dallasconventioncenter.com/events",
    parser: "dallas"
  },
  {
    key: "miami",
    city: "Miami Beach",
    venue: "Miami Beach Convention Center",
    url: "https://www.miamibeachconvention.com/events",
    parser: "miami"
  },
  {
    key: "sandiego",
    city: "San Diego",
    venue: "San Diego Convention Center",
    url: "https://www.visitsandiego.com/calendar?page=1",
    parser: "sandiego"
  },
  {
    key: "anaheim",
    city: "Anaheim",
    venue: "Anaheim Convention Center",
    url: "https://www.visitanaheim.org/listing/anaheim-convention-center/2959/",
    parser: "anaheim"
  },
  {
    key: "orlando",
    city: "Orlando",
    venue: "Orange County Convention Center",
    url: "https://events.occc.net/",
    parser: "orlando"
  },
  {
    key: "vegas",
    city: "Las Vegas",
    venue: "Las Vegas Convention Center",
    url: "https://www.vegasmeansbusiness.com/destination-calendar/",
    parser: "vegas"
  },
  {
    key: "chicago",
    city: "Chicago",
    venue: "Chicago major convention market",
    url: "https://www.choosechicago.com/meeting-planners/chicago-updates-for-meeting-planners/chicago-convention-calendar/",
    parser: "chicago"
  },
  {
    key: "nyc",
    city: "New York",
    venue: "Jacob K. Javits Convention Center",
    url: "https://javitscenter.com/calendar/",
    parser: "javits"
  }
];

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const clean = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function monthNum(s) {
  return MONTHS[String(s || "").replace(/\./g, "").toLowerCase()] || null;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—");
}

function stripMarkdown(line) {
  return clean(
    line
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[*+-]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
  );
}

function contentLines(input) {
  let text = String(input || "");

  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = decodeEntities(
      text
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "\n")
        .replace(/<!--[\s\S]*?-->/g, "\n")
        .replace(/<(br|hr)\b[^>]*\/?>/gi, "\n")
        .replace(/<\/?(p|div|li|ul|ol|section|article|header|footer|main|aside|h[1-6]|time|a|button|label|tr|td|th|option)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    );
  }

  return text
    .split(/\r?\n+/)
    .map(stripMarkdown)
    .filter(Boolean)
    .filter(x => !/^Image(?::|$)/i.test(x));
}

function parseNumericDate(line) {
  const m = String(line).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? iso(Number(m[3]), Number(m[1]), Number(m[2])) : null;
}

function parseNamedRange(text, defaultYear = new Date().getUTCFullYear()) {
  let x = clean(text)
    .replace(/[–—]/g, "-")
    .replace(/\bSept\./gi, "Sep.")
    .replace(/\bSept\b/gi, "Sep");

  // Month Day - Month Day, Year
  let m = x.match(
    /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\s*-\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:,\s*)?(\d{4})$/i
  );
  if (m) {
    const m1 = monthNum(m[1]);
    const m2 = monthNum(m[4]) || m1;
    const y2 = Number(m[6]);
    if (!m1 || !m2) return null;
    let y1 = m[3] ? Number(m[3]) : y2;
    if (!m[3] && m1 > m2) y1 = y2 - 1;
    return {
      startDate: iso(y1, m1, Number(m[2])),
      endDate: iso(y2, m2, Number(m[5]))
    };
  }

  // Month Day - Day, Year
  m = x.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(\d{4})$/i);
  if (m) {
    const mo = monthNum(m[1]);
    if (!mo) return null;
    return {
      startDate: iso(Number(m[4]), mo, Number(m[2])),
      endDate: iso(Number(m[4]), mo, Number(m[3]))
    };
  }

  // Month Day - Day (no year)
  m = x.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*(\d{1,2})$/i);
  if (m) {
    const mo = monthNum(m[1]);
    if (!mo) return null;
    return {
      startDate: iso(defaultYear, mo, Number(m[2])),
      endDate: iso(defaultYear, mo, Number(m[3]))
    };
  }

  // Month Day - Month Day (no year)
  m = x.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})$/i);
  if (m) {
    const m1 = monthNum(m[1]);
    const m2 = monthNum(m[3]);
    if (!m1 || !m2) return null;
    let y2 = defaultYear;
    if (m2 < m1) y2++;
    return {
      startDate: iso(defaultYear, m1, Number(m[2])),
      endDate: iso(y2, m2, Number(m[4]))
    };
  }

  // Single named date with year
  m = x.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const mo = monthNum(m[1]);
    if (!mo) return null;
    const d = iso(Number(m[3]), mo, Number(m[2]));
    return { startDate: d, endDate: d };
  }

  return null;
}

function normalize(e, source) {
  return {
    title: clean(e.title),
    city: source.city,
    venue: e.venue || source.venue,
    startDate: e.startDate,
    endDate: e.endDate || e.startDate,
    category: clean(e.category || "Convention / Event"),
    attendance: e.attendance ? Number(e.attendance) : null,
    sourceKey: source.key,
    sourceUrl: e.sourceUrl || source.url
  };
}

function usefulTitle(s) {
  const x = clean(s);
  if (x.length < 3 || x.length > 190) return false;
  return !/^(learn more|event website|visit website|navigate to event website|find out more|view more|calendar|events|all events|upcoming events|grid|list|cal|search|filter|load more events|apply|reset|clear all|rss|view calendar|official calendar)$/i.test(x);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(e => {
    if (!e?.title || !e?.startDate || !e?.city) return false;
    const key = `${e.sourceKey}|${e.startDate}|${e.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upcoming(items) {
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 550 * 86400000).toISOString().slice(0, 10);
  return items.filter(e => (e.endDate || e.startDate) >= today && e.startDate <= max);
}

async function fetchText(url, timeoutMs = 22000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      signal: controller.signal,
      redirect: "follow"
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchReader(url) {
  // Jina Reader basic usage requires no API key.
  // It renders JavaScript-heavy public pages and returns readable text/Markdown.
  const readerUrl = `https://r.jina.ai/${url}`;
  return fetchText(readerUrl, 45000);
}

async function directThenReader(url, parser, source) {
  let directError = null;

  try {
    const direct = await fetchText(url);
    const events = dedupe(upcoming(parser(direct, source)));
    if (events.length) return { events, mode: "direct" };
  } catch (e) {
    directError = String(e?.message || e);
  }

  try {
    const rendered = await fetchReader(url);
    const events = dedupe(upcoming(parser(rendered, source)));
    if (events.length) return { events, mode: "reader" };
    throw new Error("Rendered page contained no parsable upcoming events");
  } catch (readerError) {
    const extra = directError ? `; direct=${directError}` : "";
    throw new Error(`${String(readerError?.message || readerError)}${extra}`);
  }
}

/* ---------- Dallas ---------- */

function parseDallas(input, source) {
  const lines = contentLines(input);
  const out = [];
  const cats = new Set(["Consumer Show", "Sporting Event", "Meeting", "Special Event", "Trade Show"]);

  for (let i = 0; i < lines.length; i++) {
    const range = parseNamedRange(lines[i]);
    if (!range) continue;

    let j = i + 1;
    let category = "";

    if (cats.has(lines[j])) {
      category = lines[j];
      j++;
    }

    while (j < Math.min(lines.length, i + 8) && !usefulTitle(lines[j])) j++;
    if (j >= lines.length) continue;

    const title = clean(lines[j]);
    if (/^(exhibit hall|ballroom|room\s)/i.test(title)) continue;

    out.push(normalize({ title, category: category || "Convention Center Event", ...range }, source));
  }

  return out;
}

/* ---------- Miami Beach ---------- */

function parseMiami(input, source) {
  const lines = contentLines(input);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const d1 = parseNumericDate(lines[i]);
    if (!d1) continue;

    let j = i + 1;
    let d2 = d1;

    const maybeEnd = parseNumericDate(lines[j] || "");
    if (maybeEnd) {
      d2 = maybeEnd;
      j++;
    }

    while (
      j < Math.min(lines.length, i + 8) &&
      (!usefulTitle(lines[j]) || /^(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\b/i.test(lines[j]))
    ) {
      j++;
    }

    if (j >= lines.length) continue;
    const title = clean(lines[j]);

    if (/summer black business showcase/i.test(title)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(title)) continue;

    out.push(normalize({
      title,
      startDate: d1,
      endDate: d2,
      category: "Convention Center Event"
    }, source));
  }

  return out;
}

/* ---------- San Diego ---------- */

function parseSanDiego(input, source) {
  const lines = contentLines(input);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const att = lines[i].match(/^Attendance:\s*(--|[\d,]+)$/i);
    if (!att) continue;

    let title = "";
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (/^(Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)$/i.test(lines[j])) continue;
      if (/^\d{1,2}$/.test(lines[j])) continue;
      if (usefulTitle(lines[j])) {
        title = clean(lines[j]);
        break;
      }
    }

    if (!title || /^Private Event:/i.test(title)) continue;

    let summary = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
      if ((lines[j].match(/\d{2}\/\d{2}\/\d{4}/g) || []).length >= 2) {
        summary = lines[j];
        break;
      }
    }
    if (!summary) continue;

    const dates = [...summary.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
    if (dates.length < 2) continue;

    const startDate = iso(Number(dates[0][3]), Number(dates[0][1]), Number(dates[0][2]));
    const endDate = iso(Number(dates[1][3]), Number(dates[1][1]), Number(dates[1][2]));

    let category = summary.slice(0, dates[0].index).trim();
    if (category.toLowerCase().startsWith(title.toLowerCase())) {
      category = category.slice(title.length).trim();
    }
    if (!category) category = "Convention Center Event";

    const attendance = att[1] === "--" ? null : Number(att[1].replace(/,/g, ""));

    out.push(normalize({
      title,
      startDate,
      endDate,
      category,
      attendance
    }, source));
  }

  return out;
}

/* ---------- Anaheim ---------- */

function parseAnaheim(input, source) {
  const lines = contentLines(input);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Dates vary between\s+(.+?)\s+[-–—]\s+(.+)$/i);
    if (!m) continue;

    const left = parseNamedRange(m[1]);
    const right = parseNamedRange(m[2]);
    if (!left || !right) continue;

    let title = "";

    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
      const candidate = clean(lines[j]);

      if (!usefulTitle(candidate)) continue;
      if (/^(Presented By|Location):?/i.test(candidate)) continue;
      if (/^Anaheim Convention Center$/i.test(candidate)) continue;
      if (/^(Events|Meeting Facilities|Facility Info|Amenities|General)$/i.test(candidate)) continue;
      if (/^(View More|See Yelp Reviews)$/i.test(candidate)) continue;

      title = candidate.replace(/^(Presented By|Location):\s*/i, "");
      if (/^Anaheim Convention Center$/i.test(title)) {
        title = "";
        continue;
      }
      break;
    }

    if (!title) continue;

    out.push(normalize({
      title,
      startDate: left.startDate,
      endDate: right.startDate,
      category: "Convention Center Event"
    }, source));
  }

  return out;
}

/* ---------- Orlando ---------- */

function jsonLdEvents(input, source) {
  const out = [];
  const html = String(input || "");

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(m[1]);
      const stack = Array.isArray(root) ? [...root] : [root];

      while (stack.length) {
        const x = stack.pop();
        if (!x || typeof x !== "object") continue;
        if (Array.isArray(x)) {
          stack.push(...x);
          continue;
        }
        if (x["@graph"]) stack.push(x["@graph"]);
        if (x.itemListElement) stack.push(x.itemListElement);
        if (x.item) stack.push(x.item);

        const t = x["@type"];
        const isEvent = Array.isArray(t) ? t.includes("Event") : t === "Event";

        if (isEvent && x.name && x.startDate) {
          const d1 = String(x.startDate).slice(0, 10);
          const d2 = String(x.endDate || x.startDate).slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(d1)) {
            out.push(normalize({
              title: x.name,
              startDate: d1,
              endDate: d2,
              category: "Event",
              sourceUrl: x.url || source.url
            }, source));
          }
        }
      }
    } catch {}
  }

  return out;
}

async function parseOrlando(source) {
  const html = await fetchText(source.url);
  let out = jsonLdEvents(html, source);
  if (out.length) return out;

  const candidateMaps = new Set([
    "https://events.occc.net/sitemap.xml",
    "https://events.occc.net/sitemap_index.xml"
  ]);

  try {
    const robots = await fetchText("https://events.occc.net/robots.txt");
    for (const m of robots.matchAll(/^\s*Sitemap:\s*(https?:\/\/\S+)/gmi)) {
      candidateMaps.add(m[1]);
    }
  } catch {}

  const eventUrls = new Set();
  const queue = [...candidateMaps];

  for (let pass = 0; pass < 3 && queue.length; pass++) {
    const batch = queue.splice(0, 8);

    for (const mapUrl of batch) {
      try {
        const xml = await fetchText(mapUrl);

        for (const m of xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
          const url = decodeEntities(m[1]);
          if (/events\.occc\.net\/event\//i.test(url)) eventUrls.add(url);
          else if (/sitemap/i.test(url) && queue.length < 30) queue.push(url);
        }
      } catch {}
    }
  }

  const urls = [...eventUrls].slice(-140);

  for (let i = 0; i < urls.length; i += 8) {
    const batch = await Promise.allSettled(
      urls.slice(i, i + 8).map(async url => ({ url, html: await fetchText(url) }))
    );

    for (const result of batch) {
      if (result.status !== "fulfilled") continue;

      const localSource = { ...source, url: result.value.url };
      let items = jsonLdEvents(result.value.html, localSource);

      if (items.length) {
        out.push(...items);
        continue;
      }

      const lines = contentLines(result.value.html);
      const dateIndex = lines.findIndex(x => /^Dates:\s*/i.test(x));
      let range = null;

      if (dateIndex >= 0) {
        range =
          parseNamedRange(lines[dateIndex].replace(/^Dates:\s*/i, "")) ||
          parseNamedRange(lines[dateIndex + 1] || "");
      }

      let title = "";
      if (dateIndex > 0) {
        for (let j = dateIndex - 1; j >= Math.max(0, dateIndex - 8); j--) {
          if (usefulTitle(lines[j])) {
            title = clean(lines[j]);
            break;
          }
        }
      }

      if (range && title) {
        out.push(normalize({ title, ...range }, localSource));
      }
    }
  }

  return out;
}

/* ---------- Las Vegas ---------- */

function currentVegasUrl(source) {
  const start = new Date();
  const end = new Date(Date.now() + 365 * 86400000);

  const mdY = d => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;

  const qs = new URLSearchParams({
    convention_facilities_ids: "31137",
    filter_date_start: mdY(start),
    filter_date_end: mdY(end),
    sort: "date",
    view: "list"
  });

  return `${source.url}?${qs.toString()}`;
}

function inferYearForMonth(month, reference = new Date()) {
  const y = reference.getUTCFullYear();
  const currentMonth = reference.getUTCMonth() + 1;
  if (month < currentMonth - 1) return y + 1;
  return y;
}

function parseVegas(input, source) {
  const lines = contentLines(input);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const att = lines[i].match(/^Est\.\s*Attendees:\s*([\d,]+)$/i);
    if (!att) continue;

    const venue = clean(lines[i - 1] || source.venue);
    const title = clean(lines[i - 2] || "");
    if (!usefulTitle(title)) continue;

    let rangeLine = "";
    let monthLine = "";

    for (let j = i - 3; j >= Math.max(0, i - 10); j--) {
      if (!rangeLine && /^\d{1,2}\s*-\s*\d{1,2}$/.test(lines[j])) {
        rangeLine = lines[j];
        monthLine = clean(lines[j - 1] || "");
        break;
      }

      const embedded = lines[j].match(/^([A-Za-z]{3,9})(?:\s+([A-Za-z]{3,9}))?\s+(\d{1,2})\s*-\s*(\d{1,2})$/);
      if (embedded) {
        monthLine = `${embedded[1]} ${embedded[2] || ""}`.trim();
        rangeLine = `${embedded[3]}-${embedded[4]}`;
        break;
      }
    }

    if (!rangeLine) continue;

    const days = rangeLine.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    const months = monthLine.match(/[A-Za-z]{3,9}/g) || [];
    if (!days || !months.length) continue;

    const m1 = monthNum(months[0]);
    const m2 = monthNum(months[1]) || m1;
    if (!m1 || !m2) continue;

    let y1 = inferYearForMonth(m1);
    let y2 = y1;
    if (m2 < m1) y2++;

    out.push(normalize({
      title,
      venue,
      startDate: iso(y1, m1, Number(days[1])),
      endDate: iso(y2, m2, Number(days[2])),
      category: "Convention / Trade Show",
      attendance: Number(att[1].replace(/,/g, ""))
    }, source));
  }

  return out;
}

/* ---------- Chicago ---------- */

function parseChicago(input, source) {
  const lines = contentLines(input);
  const out = [];

  let year = new Date().getUTCFullYear();
  for (const line of lines) {
    const y = line.match(/\b(20\d{2})\s+events and conventions\b/i);
    if (y) {
      year = Number(y[1]);
      break;
    }
  }

  for (const line of lines) {
    // Example: IMTS 2026 (Sept. 14 – 19)
    const m = line.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
    if (!m) continue;

    const title = clean(m[1]);
    const dateText = clean(m[2]).replace(/[–—]/g, "-");
    const range = parseNamedRange(dateText, year);

    if (!range || !usefulTitle(title)) continue;

    out.push(normalize({
      title,
      ...range,
      category: "Major Chicago Convention",
      venue: "Chicago convention market"
    }, source));
  }

  return out;
}

/* ---------- Javits ---------- */

function isJavitsInternal(title) {
  return /(OUTFRONT MEDIA|CONFINE SPACE TRAINING|HIGH POWER INSTALLATION|ON HOLD|WIFI 7 INSTALLATION|ELECTRICIANS?' SIGN-IN|PRE-EVENT|PRE-CON\b|COAT CHECK|PRIDE ERG|STATE OF THE CENTER|LAW ENFORCEMENT MEETING|EVENT PLANNER MEETING)/i.test(title);
}

function parseJavits(input, source) {
  const lines = contentLines(input);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const range = parseNamedRange(lines[i]);
    if (!range) continue;

    let title = "";

    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const candidate = clean(lines[j]);
      if (!usefulTitle(candidate)) continue;
      if (/^(List View|Calendar View|List|Calendar|SELECT MONTH)$/i.test(candidate)) continue;
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\s+'\d{2})?$/i.test(candidate)) continue;
      title = candidate;
      break;
    }

    if (!title) {
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
        if (usefulTitle(lines[j])) {
          title = clean(lines[j]);
          break;
        }
      }
    }

    if (!title || isJavitsInternal(title)) continue;

    out.push(normalize({
      title,
      ...range,
      category: "Javits Center Event"
    }, source));
  }

  return out;
}

/* ---------- Refresh orchestration ---------- */

function parserFor(source) {
  if (source.parser === "dallas") return parseDallas;
  if (source.parser === "miami") return parseMiami;
  if (source.parser === "sandiego") return parseSanDiego;
  if (source.parser === "anaheim") return parseAnaheim;
  if (source.parser === "vegas") return parseVegas;
  if (source.parser === "chicago") return parseChicago;
  if (source.parser === "javits") return parseJavits;
  throw new Error(`Unknown parser: ${source.parser}`);
}

async function refreshMiami(source) {
  let all = [];
  let usedReader = false;

  for (let page = 0; page < 7; page++) {
    const url = page === 0 ? source.url : `${source.url}?page=${page}`;
    try {
      const result = await directThenReader(url, parseMiami, source);
      all.push(...result.events);
      if (result.mode === "reader") usedReader = true;
    } catch (e) {
      console.log(`Miami page ${page}: ${String(e?.message || e)}`);
    }
  }

  all = dedupe(upcoming(all));
  if (!all.length) throw new Error("No parsable upcoming events returned");
  return { events: all, mode: usedReader ? "reader" : "direct" };
}

async function refreshSource(source) {
  try {
    let result;

    if (source.parser === "orlando") {
      const events = dedupe(upcoming(await parseOrlando(source)));
      if (!events.length) throw new Error("No parsable upcoming events returned");
      result = { events, mode: "direct" };
    } else if (source.parser === "miami") {
      result = await refreshMiami(source);
    } else {
      const parser = parserFor(source);
      const url = source.parser === "vegas" ? currentVegasUrl(source) : source.url;
      result = await directThenReader(url, parser, source);
    }

    return {
      ok: true,
      events: result.events,
      mode: result.mode,
      error: null
    };
  } catch (err) {
    return {
      ok: false,
      events: [],
      mode: "fallback",
      error: String(err?.message || err)
    };
  }
}

const previous = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));

let combined = [];
const statuses = [];

for (const source of SOURCES) {
  const result = await refreshSource(source);
  const old = (previous.events || []).filter(e => e.sourceKey === source.key);

  combined.push(...(result.ok ? result.events : upcoming(old)));

  const prev = (previous.sources || []).find(x => x.key === source.key);

  statuses.push({
    key: source.key,
    city: source.city,
    venue: source.venue,
    url: source.url,
    ok: result.ok,
    mode: result.mode,
    lastSuccess: result.ok ? new Date().toISOString() : (prev?.lastSuccess || null),
    error: result.ok ? null : result.error
  });

  console.log(
    `${source.city}: ${
      result.ok
        ? `${result.events.length} events (${result.mode})`
        : `fallback (${result.error})`
    }`
  );
}

combined = dedupe(upcoming(combined)).sort((a, b) =>
  a.startDate.localeCompare(b.startDate) ||
  (Number(b.attendance || 0) - Number(a.attendance || 0))
);

await fs.writeFile(
  DATA_FILE,
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      events: combined,
      sources: statuses
    },
    null,
    2
  ) + "\n"
);

console.log(`Wrote ${combined.length} upcoming events.`);
