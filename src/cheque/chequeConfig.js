// ─── UAE BANKS DATA ───────────────────────────────────────────
export const UAE_BANKS = [
  { id:"enbd",   name:"Emirates NBD",                  short:"ENBD", color:"#CC0000", code:"033", swift:"EBILAEAD",  tag:"Together Unlimited" },
  { id:"fab",    name:"First Abu Dhabi Bank",           short:"FAB",  color:"#00563F", code:"035", swift:"NBADAEAA",  tag:"Advancing Growth" },
  { id:"adcb",   name:"ADCB",                           short:"ADCB", color:"#E31837", code:"030", swift:"ADCBAEAA",  tag:"Abu Dhabi Commercial Bank" },
  { id:"dib",    name:"Dubai Islamic Bank",             short:"DIB",  color:"#006837", code:"240", swift:"DUIBAEAD",  tag:"Always with you" },
  { id:"mashreq",name:"Mashreq Bank",                   short:"MAQ",  color:"#E2211C", code:"031", swift:"BOMLAEAD",  tag:"Moving you forward" },
  { id:"adib",   name:"Abu Dhabi Islamic Bank",         short:"ADIB", color:"#7B2D8B", code:"500", swift:"ADIBAEAA",  tag:"Islamic Banking" },
  { id:"rak",    name:"RAKBANK",                        short:"RAK",  color:"#C8102E", code:"045", swift:"NRAKAEAK",  tag:"National Bank of Ras Al Khaimah" },
  { id:"hsbc",   name:"HSBC UAE",                       short:"HSBC", color:"#DB0011", code:"043", swift:"BBMEAEAD",  tag:"The World's Local Bank" },
  { id:"sc",     name:"Standard Chartered UAE",         short:"SCB",  color:"#0072BC", code:"050", swift:"SCBLAEAD",  tag:"Here for Good" },
  { id:"cbd",    name:"Commercial Bank of Dubai",       short:"CBD",  color:"#005B82", code:"053", swift:"CBDUAEAD",  tag:"Your bank, your life" },
  { id:"cbi",    name:"Commercial Bank International",  short:"CBI",  color:"#003087", code:"054", swift:"CBILAEAA",  tag:"CBI" },
  { id:"nbf",    name:"National Bank of Fujairah",      short:"NBF",  color:"#00529B", code:"055", swift:"NBFUAEAS",  tag:"A better way to bank" },
  { id:"nbq",    name:"National Bank of Umm Al Qaiwain",short:"NBQ",  color:"#005B82", code:"056", swift:"NBUQAEAQ",  tag:"NBQ" },
  { id:"sib",    name:"Sharjah Islamic Bank",           short:"SIB",  color:"#008000", code:"057", swift:"SIBLAEAA",  tag:"Islamic Banking" },
  { id:"alhilal",name:"Al Hilal Bank",                  short:"AHB",  color:"#00529B", code:"225", swift:"ALHIAEAA",  tag:"Islamic Banking" },
  { id:"invest", name:"Invest Bank",                    short:"INV",  color:"#1C4480", code:"095", swift:"INVBAEAS",  tag:"Invest Bank Sharjah" },
  { id:"citiuae",name:"Citibank UAE",                   short:"CITI", color:"#003A78", code:"082", swift:"CITIAEAX",  tag:"Citi — The Citi Never Sleeps" },
  { id:"ubl",    name:"United Bank Limited UAE",        short:"UBL",  color:"#005595", code:"095", swift:"UNILAEAA",  tag:"Pakistan's Global Bank" },
  { id:"emirates_islamic",name:"Emirates Islamic",      short:"EIB",  color:"#006400", code:"236", swift:"MEBLAEADXXX", tag:"Islamic Banking" },
  { id:"ajman",  name:"Ajman Bank",                     short:"AJB",  color:"#006633", code:"140", swift:"AJMAAEAA",  tag:"Ajman Bank" },
];

// ─── AMOUNT TO WORDS ──────────────────────────────────────────
export function amountToWordsAED(n) {
  if (!n || n <= 0) return "";
  const a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function hun(x) {
    if (x < 20) return a[x];
    if (x < 100) return b[Math.floor(x/10)] + (x%10 ? " " + a[x%10] : "");
    return a[Math.floor(x/100)] + " Hundred" + (x%100 ? " " + hun(x%100) : "");
  }
  const parts = parseFloat(n).toFixed(2).split(".");
  let whole = parseInt(parts[0]), fils = parseInt(parts[1]);
  let res = "";
  if (whole >= 1000000000) { res += hun(Math.floor(whole / 1000000000)) + " Billion "; whole %= 1000000000; }
  if (whole >= 1000000) { res += hun(Math.floor(whole / 1000000)) + " Million "; whole %= 1000000; }
  if (whole >= 1000) { res += hun(Math.floor(whole / 1000)) + " Thousand "; whole %= 1000; }
  if (whole > 0)          res += hun(whole) + " ";
  res += "Dirhams";
  if (fils > 0) res += " and " + hun(fils) + " Fils";
  return res.trim();
}

// ─── PER-BANK PRINT POSITIONS (millimetres from top/left of cheque) ──────────
// These are calibrated for each bank's standard UAE cheque leaf (210mm × 90mm).
// If a field prints in the wrong spot, increment or decrement the value by 1–2mm
// and re-print a test page until aligned.
//
// Field guide:
//   payeeTop / payeeLeft / payeeMaxW  → "Pay to" beneficiary name line
//   amtTop   / amtRight              → AED amount box (right-aligned)
//   wordsTop / wordsLeft / wordsMaxW → Amount in words line
//   dateTop  / dateDDLeft            → Day digits  (DD)
//   dateTop  / dateMMLeft            → Month digits (MM)
//   dateTop  / dateYYLeft            → Year digits  (YYYY)
// ─────────────────────────────────────────────────────────────────────────────
export const CHEQUE_POSITIONS = {
  //               payee             amount          words              date
  enbd:   { payeeTop:31, payeeLeft:52, payeeMaxW:112, amtTop:29, amtRight:13, wordsTop:43, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  fab:    { payeeTop:32, payeeLeft:54, payeeMaxW:110, amtTop:30, amtRight:12, wordsTop:44, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  adcb:   { payeeTop:36, payeeLeft:46, payeeMaxW:118, amtTop:54, amtRight:10, wordsTop:48, wordsLeft:10, wordsMaxW:146, dateTop:22, dateDDLeft:145, dateMMLeft:158, dateYYLeft:170 },
  dib:    { payeeTop:31, payeeLeft:50, payeeMaxW:114, amtTop:28, amtRight:12, wordsTop:43, wordsLeft:11, wordsMaxW:148, dateTop:57, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  mashreq:{ payeeTop:30, payeeLeft:50, payeeMaxW:115, amtTop:27, amtRight:13, wordsTop:42, wordsLeft:12, wordsMaxW:148, dateTop:57, dateDDLeft:150, dateMMLeft:164, dateYYLeft:176 },
  adib:   { payeeTop:31, payeeLeft:48, payeeMaxW:116, amtTop:28, amtRight:11, wordsTop:43, wordsLeft:10, wordsMaxW:148, dateTop:58, dateDDLeft:148, dateMMLeft:163, dateYYLeft:175 },
  rak:    { payeeTop:30, payeeLeft:50, payeeMaxW:114, amtTop:28, amtRight:12, wordsTop:42, wordsLeft:12, wordsMaxW:148, dateTop:57, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  hsbc:   { payeeTop:31, payeeLeft:52, payeeMaxW:112, amtTop:29, amtRight:13, wordsTop:43, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:150, dateMMLeft:164, dateYYLeft:176 },
  sc:     { payeeTop:31, payeeLeft:52, payeeMaxW:112, amtTop:29, amtRight:13, wordsTop:43, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:150, dateMMLeft:164, dateYYLeft:176 },
  cbd:    { payeeTop:30, payeeLeft:50, payeeMaxW:115, amtTop:28, amtRight:12, wordsTop:42, wordsLeft:11, wordsMaxW:148, dateTop:57, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  default:{ payeeTop:32, payeeLeft:50, payeeMaxW:114, amtTop:29, amtRight:12, wordsTop:43, wordsLeft:11, wordsMaxW:148, dateTop:58, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
};

// ─── PER-BANK USER DEFAULT TEMPLATE VALUES ──────────────────────────────────
// These are user-adjustable defaults. Saved values in localStorage override them.
// Reset returns to these values for the selected bank only.
export const CHEQUE_TEMPLATE_DEFAULTS = {
  default: {
    px:0, py:0, wx:0, wy:0, ax:0, ay:0, dx:0, dy:0, mo:0, yo:0,
    w:196, h:99, dm:"slash",
  },
  adcb: {
    // ADCB calibrated from user's real cheque/printer test screenshots.
    px:-12, py:-16,
    wx:19, wy:-18,
    ax:-8, ay:-15,
    dx:14, dy:-19,
    mo:-3, yo:-3,
    w:200, h:90,
    dm:"slash",
  },
};

export const DATE_FORMAT_OPTIONS = [
  { id:"slash", label:"DD/MM/YYYY", sep:"/" },
  { id:"dot",   label:"DD.MM.YYYY", sep:"." },
  { id:"dash",  label:"DD-MM-YYYY", sep:"-" },
  { id:"space", label:"DD MM YYYY", sep:" " },
  { id:"box",   label:"Box / digit spacing", sep:null },
];

export const getChequeTemplateDefault = (bankId) => ({
  ...CHEQUE_TEMPLATE_DEFAULTS.default,
  ...(CHEQUE_TEMPLATE_DEFAULTS[bankId] || {}),
});
