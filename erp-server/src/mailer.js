import nodemailer from "nodemailer";

/** Returns `sendMail({ to, subject, text, html })`, or null when SMTP is not configured. */
export function createMailer(cfg) {
  if (typeof cfg.sendMail === "function") return cfg.sendMail;
  const smtp = cfg.smtp || {};
  if (!smtp.host || !smtp.user || !smtp.pass) return null;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  const from = smtp.from || smtp.user;
  return (message) => transport.sendMail({ from, ...message });
}
