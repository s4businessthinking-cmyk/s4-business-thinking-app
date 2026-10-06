import crypto from "node:crypto";
import { fail } from "./errors.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_TRIES = 5;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export const maskEmail = (email) => {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "";
  const keep = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${keep}${"*".repeat(Math.max(2, name.length - keep.length))}@${domain}`;
};

/** Owner PIN recovery: a 6-digit code mailed to the owner's login email. Codes live in memory only. */
export function createPinResetService({ db, store, sendMail }) {
  const pending = new Map();

  const ownerAccount = async (uid) => {
    const account = await db.findAccountByUid(uid);
    if (!account?.email) fail("unauthenticated", "auth/user-not-found");
    const profile = await store.getDocument(uid, "users", uid);
    if (profile?.data?.role !== "owner") fail("permission-denied", "Only the shop owner can reset the owner PIN.");
    return account;
  };

  return {
    async requestCode(uid) {
      if (!sendMail) fail("unavailable", "Email is not set up on the server yet.");
      const account = await ownerAccount(uid);
      const now = Date.now();
      const prev = pending.get(uid);
      if (prev && now - prev.sentAt < RESEND_GAP_MS) fail("resource-exhausted", "Wait a minute before asking for another code.");
      const sends = (prev?.sends || []).filter((t) => now - t < 60 * 60 * 1000);
      if (sends.length >= MAX_SENDS_PER_HOUR) fail("resource-exhausted", "Too many codes requested. Try again later.");

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await sendMail({
        to: account.email,
        subject: `S4 Business Thinking — owner PIN reset code ${code}`,
        text: `Your owner PIN reset code is ${code}\n\nIt expires in 10 minutes. If you did not ask for this, someone may know your login password — change it.\n\nআপনার মালিকের পিন রিসেট কোড: ${code}\n১০ মিনিটের মধ্যে ব্যবহার করুন। আপনি না চাইলে কেউ আপনার লগইন পাসওয়ার্ড জানে — পাসওয়ার্ড বদলান।`,
      });
      pending.set(uid, { hash: sha256(`${uid}:${code}`), expiresAt: now + CODE_TTL_MS, sentAt: now, sends: [...sends, now], tries: 0 });
      return { ok: true, email: maskEmail(account.email), expiresInSec: CODE_TTL_MS / 1000 };
    },

    async verifyCode(uid, { code }) {
      await ownerAccount(uid);
      const entry = pending.get(uid);
      if (!entry || entry.expiresAt < Date.now()) fail("not-found", "The code has expired. Ask for a new one.");
      entry.tries += 1;
      const given = Buffer.from(sha256(`${uid}:${String(code || "").trim()}`));
      if (!crypto.timingSafeEqual(given, Buffer.from(entry.hash))) {
        if (entry.tries >= MAX_TRIES) entry.expiresAt = 0;
        fail("invalid-argument", entry.tries >= MAX_TRIES ? "Too many wrong codes. Ask for a new one." : "Wrong code.");
      }
      pending.delete(uid);
      return { ok: true };
    },
  };
}
