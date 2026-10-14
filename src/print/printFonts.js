// The print font (Noto Sans Bengali, SIL Open Font License) bundled with the app, so a print
// never waits for fonts.googleapis.com and still looks the same offline. printHtmlDocument swaps the
// Google Fonts <link> in a document for these @font-face rules (same weights and unicode ranges). Noto Sans
// is left out: its subsets cover the same ranges, so Noto Sans Bengali (first in the stack) always wins.
const GOOGLE_FONTS_LINK_RE = /<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+Bengali[^"]*"[^>]*>/i;

let fontCssPromise = null;
const loadFontCss = () => (fontCssPromise ||= import("./printFontData.js").then(({ notoSansBengaliBengali, notoSansBengaliLatinExt, notoSansBengaliLatin }) => [
  ["Noto Sans Bengali", 400, notoSansBengaliBengali, "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1, U+11DF0-11DF1"],
  ["Noto Sans Bengali", 400, notoSansBengaliLatinExt, "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF"],
  ["Noto Sans Bengali", 400, notoSansBengaliLatin, "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"],
  ["Noto Sans Bengali", 700, notoSansBengaliBengali, "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1, U+11DF0-11DF1"],
  ["Noto Sans Bengali", 700, notoSansBengaliLatinExt, "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF"],
  ["Noto Sans Bengali", 700, notoSansBengaliLatin, "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"],
  ["Noto Sans Bengali", 900, notoSansBengaliBengali, "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1, U+11DF0-11DF1"],
  ["Noto Sans Bengali", 900, notoSansBengaliLatinExt, "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF"],
  ["Noto Sans Bengali", 900, notoSansBengaliLatin, "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"],
].map(([family, weight, url, range]) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${url}) format('woff2');unicode-range:${range};}`
).join("\n")));

let readyFontCss = null;
const withFonts = (html, fontCss) => html.replace(GOOGLE_FONTS_LINK_RE, () => `<style>${fontCss}</style>`);

// Loads the fonts ahead of the first print, so printing never has to wait (a browser drops a popup that
// opens after an await that takes too long).
export function preloadPrintFonts() {
  return loadFontCss().then((css) => { readyFontCss = css; }).catch((error) => {
    console.warn("[S4 Print] bundled fonts unavailable", error);
    fontCssPromise = null;
  });
}

// Synchronous once preloaded; keeps the Google Fonts link if the bundled fonts are not ready.
export function inlinePrintFonts(html) {
  if (typeof html !== "string" || !readyFontCss || !GOOGLE_FONTS_LINK_RE.test(html)) return html;
  return withFonts(html, readyFontCss);
}
