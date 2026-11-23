// Shared quote matching for scrap extract and import (via fieldsOf).
//
// The page text used in prompts keeps HTML entities undecoded (e.g. the page
// holds `1705 Tech Avenue #1 &amp; 3 Toronto`), so when a model decodes them
// in its answer (`#1 & 3`) the quote is no longer an exact substring and
// fieldsOf drops every sub-field sharing that quote (`unverified_dropped`).
// Decode HTML character references on BOTH the page text and the quote
// before the substring test. The prompt text itself is untouched
// (byte-identical), and the stored value/quote stay as the model wrote them.
//
// Named references: the full HTML 4.01 table (W3C HTML 4.01 section 24, 252
// names: Latin-1 supplement U+00A0-U+00FF, Latin Extended-B OElig/oelig/
// Scaron/scaron/Yuml, spacing modifiers, Greek, punctuation, symbols, arrows
// and mathematical/technical marks) plus apos (XHTML; not in HTML 4.01 but
// required here). The table below is ASCII-only on purpose: every non-ASCII
// value is built from an explicit code point. No new dependency. A trailing
// semicolon is required; unknown names are left as-is.
// Numeric references: decimal `&#NNN;` and hex `&#xHH;` (case-insensitive x);
// 0x80-0x9F remap through the HTML Windows-1252 table; out-of-range,
// unassigned or surrogate code points are left as-is.
// Decoding applies exactly once per string (single regex pass, never looped):
// `&amp;amp;` decodes to `&amp;`, never to `&`.
// `&nbsp;` decodes to U+00A0, which then compares as a plain space, and every
// whitespace run collapses to one space on both sides.
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
};

// [entity name, code point]: the HTML 4.01 set (252 names). Source: W3C
// HTML 4.01 section 24 (plus apos above).
const CODE_POINTS: Array<[string, number]> = [
  ["nbsp", 0xA0], ["iexcl", 0xA1], ["cent", 0xA2], ["pound", 0xA3],
  ["curren", 0xA4], ["yen", 0xA5], ["brvbar", 0xA6], ["sect", 0xA7],
  ["uml", 0xA8], ["copy", 0xA9], ["ordf", 0xAA], ["laquo", 0xAB],
  ["not", 0xAC], ["shy", 0xAD], ["reg", 0xAE], ["macr", 0xAF],
  ["deg", 0xB0], ["plusmn", 0xB1], ["sup2", 0xB2], ["sup3", 0xB3],
  ["acute", 0xB4], ["micro", 0xB5], ["para", 0xB6], ["middot", 0xB7],
  ["cedil", 0xB8], ["sup1", 0xB9], ["ordm", 0xBA], ["raquo", 0xBB],
  ["frac14", 0xBC], ["frac12", 0xBD], ["frac34", 0xBE], ["iquest", 0xBF],
  ["Agrave", 0xC0], ["Aacute", 0xC1], ["Acirc", 0xC2], ["Atilde", 0xC3],
  ["Auml", 0xC4], ["Aring", 0xC5], ["AElig", 0xC6], ["Ccedil", 0xC7],
  ["Egrave", 0xC8], ["Eacute", 0xC9], ["Ecirc", 0xCA], ["Euml", 0xCB],
  ["Igrave", 0xCC], ["Iacute", 0xCD], ["Icirc", 0xCE], ["Iuml", 0xCF],
  ["ETH", 0xD0], ["Ntilde", 0xD1], ["Ograve", 0xD2], ["Oacute", 0xD3],
  ["Ocirc", 0xD4], ["Otilde", 0xD5], ["Ouml", 0xD6],
  ["times", 0xD7], ["Oslash", 0xD8],
  ["Ugrave", 0xD9], ["Uacute", 0xDA], ["Ucirc", 0xDB], ["Uuml", 0xDC],
  ["Yacute", 0xDD], ["THORN", 0xDE], ["szlig", 0xDF],
  ["agrave", 0xE0], ["aacute", 0xE1], ["acirc", 0xE2], ["atilde", 0xE3],
  ["auml", 0xE4], ["aring", 0xE5], ["aelig", 0xE6], ["ccedil", 0xE7],
  ["egrave", 0xE8], ["eacute", 0xE9], ["ecirc", 0xEA], ["euml", 0xEB],
  ["igrave", 0xEC], ["iacute", 0xED], ["icirc", 0xEE], ["iuml", 0xEF],
  ["eth", 0xF0], ["ntilde", 0xF1], ["ograve", 0xF2], ["oacute", 0xF3],
  ["ocirc", 0xF4], ["otilde", 0xF5], ["ouml", 0xF6],
  ["divide", 0xF7], ["oslash", 0xF8],
  ["ugrave", 0xF9], ["uacute", 0xFA], ["ucirc", 0xFB], ["uuml", 0xFC],
  ["yacute", 0xFD], ["thorn", 0xFE], ["yuml", 0xFF],
  // Latin Extended-B.
  ["OElig", 0x152], ["oelig", 0x153], ["Scaron", 0x160], ["scaron", 0x161],
  ["Yuml", 0x178],
  // Spacing modifiers and lowercase f hook.
  ["fnof", 0x192], ["circ", 0x2C6], ["tilde", 0x2DC],
  // Greek capitals.
  ["Alpha", 0x391], ["Beta", 0x392], ["Gamma", 0x393], ["Delta", 0x394],
  ["Epsilon", 0x395], ["Zeta", 0x396], ["Eta", 0x397], ["Theta", 0x398],
  ["Iota", 0x399], ["Kappa", 0x39A], ["Lambda", 0x39B], ["Mu", 0x39C],
  ["Nu", 0x39D], ["Xi", 0x39E], ["Omicron", 0x39F], ["Pi", 0x3A0],
  ["Rho", 0x3A1], ["Sigma", 0x3A3], ["Tau", 0x3A4], ["Upsilon", 0x3A5],
  ["Phi", 0x3A6], ["Chi", 0x3A7], ["Psi", 0x3A8], ["Omega", 0x3A9],
  // Greek small letters.
  ["alpha", 0x3B1], ["beta", 0x3B2], ["gamma", 0x3B3], ["delta", 0x3B4],
  ["epsilon", 0x3B5], ["zeta", 0x3B6], ["eta", 0x3B7], ["theta", 0x3B8],
  ["iota", 0x3B9], ["kappa", 0x3BA], ["lambda", 0x3BB], ["mu", 0x3BC],
  ["nu", 0x3BD], ["xi", 0x3BE], ["omicron", 0x3BF], ["pi", 0x3C0],
  ["rho", 0x3C1], ["sigmaf", 0x3C2], ["sigma", 0x3C3], ["tau", 0x3C4],
  ["upsilon", 0x3C5], ["phi", 0x3C6], ["chi", 0x3C7], ["psi", 0x3C8],
  ["omega", 0x3C9],
  ["thetasym", 0x3D1], ["upsih", 0x3D2], ["piv", 0x3D6],
  // Spaces and invisible format marks.
  ["ensp", 0x2002], ["emsp", 0x2003], ["thinsp", 0x2009],
  ["zwnj", 0x200C], ["zwj", 0x200D], ["lrm", 0x200E], ["rlm", 0x200F],
  // Punctuation (hellip, mdash, ndash, quotes, bull, trade and euro join the
  // Latin-1 block above; the rest is new here).
  ["ndash", 0x2013], ["mdash", 0x2014],
  ["lsquo", 0x2018], ["rsquo", 0x2019], ["sbquo", 0x201A],
  ["ldquo", 0x201C], ["rdquo", 0x201D], ["bdquo", 0x201E],
  ["dagger", 0x2020], ["Dagger", 0x2021], ["bull", 0x2022],
  ["hellip", 0x2026],
  ["permil", 0x2030], ["prime", 0x2032], ["Prime", 0x2033],
  ["lsaquo", 0x2039], ["rsaquo", 0x203A], ["oline", 0x203E],
  ["frasl", 0x2044], ["euro", 0x20AC],
  // Letter-like symbols.
  ["image", 0x2111], ["weierp", 0x2118], ["real", 0x211C],
  ["trade", 0x2122], ["alefsym", 0x2135],
  // Arrows.
  ["larr", 0x2190], ["uarr", 0x2191], ["rarr", 0x2192], ["darr", 0x2193],
  ["harr", 0x2194], ["crarr", 0x21B5],
  ["lArr", 0x21D0], ["uArr", 0x21D1], ["rArr", 0x21D2], ["dArr", 0x21D3],
  ["hArr", 0x21D4],
  // Mathematical operators.
  ["forall", 0x2200], ["part", 0x2202], ["exist", 0x2203],
  ["empty", 0x2205], ["nabla", 0x2207], ["isin", 0x2208],
  ["notin", 0x2209], ["ni", 0x220B], ["prod", 0x220F], ["sum", 0x2211],
  ["minus", 0x2212], ["lowast", 0x2217], ["radic", 0x221A], ["prop", 0x221D],
  ["infin", 0x221E], ["ang", 0x2220], ["and", 0x2227], ["or", 0x2228],
  ["cap", 0x2229], ["cup", 0x222A], ["int", 0x222B], ["there4", 0x2234],
  ["sim", 0x223C], ["cong", 0x2245], ["asymp", 0x2248], ["ne", 0x2260],
  ["equiv", 0x2261], ["le", 0x2264], ["ge", 0x2265], ["sub", 0x2282],
  ["sup", 0x2283], ["nsub", 0x2284], ["sube", 0x2286], ["supe", 0x2287],
  ["oplus", 0x2295], ["otimes", 0x2297], ["perp", 0x22A5], ["sdot", 0x22C5],
  // Technical.
  ["lceil", 0x2308], ["rceil", 0x2309], ["lfloor", 0x230A],
  ["rfloor", 0x230B], ["lang", 0x2329], ["rang", 0x232A],
  // Geometric shape and card suits.
  ["loz", 0x25CA],
  ["spades", 0x2660], ["clubs", 0x2663], ["hearts", 0x2665],
  ["diams", 0x266A],
];

for (const [name, cp] of CODE_POINTS) NAMED[name] = String.fromCodePoint(cp);

const ENTITY_RE = /&(?:#([0-9]+)|#[xX]([0-9A-Fa-f]+)|([A-Za-z][A-Za-z0-9]+));/g;

// HTML maps numeric references 0x80-0x9F through Windows-1252; the five
// unassigned codes (0x81, 0x8D, 0x8F, 0x90, 0x9D) are left as-is.
const WIN1252: Record<number, number> = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
  0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
  0x9E: 0x017E, 0x9F: 0x0178,
};

const scalarValue = (cp: number): boolean =>
  Number.isInteger(cp) && cp > 0 && cp <= 0x10FFFF && (cp < 0xD800 || cp > 0xDFFF);

export function decodeHtmlEntitiesOnce(s: string): string {
  return s.replace(ENTITY_RE, (m, dec?: string, hex?: string, name?: string) => {
    if (dec !== undefined) {
      const raw = parseInt(dec, 10);
      const cp = raw >= 0x80 && raw <= 0x9F ? (WIN1252[raw] ?? raw) : raw;
      return scalarValue(cp) ? String.fromCodePoint(cp) : m;
    }
    if (hex !== undefined) {
      const raw = parseInt(hex, 16);
      const cp = raw >= 0x80 && raw <= 0x9F ? (WIN1252[raw] ?? raw) : raw;
      return scalarValue(cp) ? String.fromCodePoint(cp) : m;
    }
    if (name !== undefined) return Object.hasOwn(NAMED, name) ? NAMED[name]! : m;
    return m;
  });
}

const NBSP = String.fromCodePoint(0xA0);

const normalizeForQuoteMatch = (s: string): string =>
  decodeHtmlEntitiesOnce(s).split(NBSP).join(" ").replace(/\s+/g, " ");

export function quoteMatches(pageText: string, quote: string): boolean {
  const nq = normalizeForQuoteMatch(quote);
  if (!nq.trim()) return false;
  return normalizeForQuoteMatch(pageText).includes(nq);
}
