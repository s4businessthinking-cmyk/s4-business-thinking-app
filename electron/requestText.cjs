// Error wording for the HTTPS bridge in main.cjs ("s4-asp:request"). The same bridge carries the e-invoice ASP calls and
// the owner's SMS / email reminder provider calls (share/reminderChannels.js sends purpose: "sms" | "email"), so each
// message names the service that was actually called.
const WHO = { asp: "The ASP", sms: "The SMS provider", email: "The email provider", provider: "The provider" };

function whoOf(purpose) {
  return WHO[String(purpose || "").toLowerCase()] || WHO.asp;
}

function requestText(purpose) {
  const who = whoOf(purpose);
  const lower = who.charAt(0).toLowerCase() + who.slice(1);
  return {
    badUrl: `${who} address is not a valid link`,
    notHttps: `${who} address must start with https://`,
    tooLarge: who === WHO.asp ? "The document is too large to send" : "The message is too large to send",
    timeout: (seconds) => `${who} did not answer within ${seconds} seconds`,
    failed: (detail) => (detail ? String(detail) : `Could not reach ${lower}`),
  };
}

module.exports = { requestText, whoOf };
