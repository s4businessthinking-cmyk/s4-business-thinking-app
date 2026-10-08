/** Minimum password rules shared by signup/change flows (client + server mirror). */
export function isAcceptablePassword(password) {
  const s = String(password || "");
  return s.length >= 6 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

export const PASSWORD_HINT = {
  bn: "কমপক্ষে ৬ অক্ষর, অক্ষর ও সংখ্যা মিশিয়ে লিখুন",
  en: "At least 6 characters with both letters and numbers",
};
