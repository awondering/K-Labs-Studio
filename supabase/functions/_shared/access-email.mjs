// Q45: the builder emails sent when the owner changes complimentary access, and the Resend send step.
// The layout, colours and wording rules match the K-Labs Studio authentication emails installed in Supabase (Q43b,
// scripts/build-auth-emails.cjs on feat/q43b-auth-email-templates): table layout, inline styles, 560 px column,
// dark scheme, one button, plain-link fallback, no images, fonts, scripts or tracking. Dates are shown in New Zealand
// time, where the owner sets them (an expiry is the end of the chosen day).
export const STUDIO_URL = "https://studio.klabs.co.nz/";
export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const COLORS = {
  page: "#060708", panel: "#0d1012", edge: "#242a2d",
  heading: "#f1eee7", text: "#ddd6c9", titanium: "#ada99d", muted: "#9a9c94", link: "#cfc8ba",
  button: "#8f1f2b", buttonEdge: "#b42736", buttonText: "#ffffff"
};
const C = COLORS;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const TIME_ZONE = "Pacific/Auckland";

export const EVENTS = ["granted", "extended", "expiry_changed", "revoked"];

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "11:59 pm on Thursday 31 December 2026 (New Zealand time)"
export function formatExpiry(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid access expiry is required.");
  const day = new Intl.DateTimeFormat("en-NZ", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(date).replace(/,/g, "");
  const time = new Intl.DateTimeFormat("en-NZ", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true })
    .format(date).replace(/\s/g, " ").replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
  return `${time} on ${day} (New Zealand time)`;
}

const until = (value) => `Your access runs until ${formatExpiry(value)}.`;
const NO_END = "Your access has no scheduled end date.";

// Customer-facing content only: never the owner's reason, audit details or any internal identifier.
export function accessEmailContent({ event, accessExpiresAt, previousExpiresAt }) {
  switch (event) {
    case "granted":
      return {
        subject: "Your K-Labs Studio access is ready",
        preheader: accessExpiresAt ? `Complimentary access until ${formatExpiry(accessExpiresAt)}.` : "Complimentary access with no scheduled end date.",
        heading: "Your access is ready",
        paragraphs: [
          "You now have complimentary access to K-Labs Studio, the custom rod building suite, for {EMAIL}.",
          accessExpiresAt ? until(accessExpiresAt) : NO_END
        ],
        note: "Sign in with this email address to start working in Studio."
      };
    case "extended":
      return {
        subject: "Your Studio access has been extended",
        preheader: accessExpiresAt ? `Your access now runs until ${formatExpiry(accessExpiresAt)}.` : "Your access now has no scheduled end date.",
        heading: "Your access has been extended",
        paragraphs: [
          "Your complimentary K-Labs Studio access for {EMAIL} has been extended.",
          accessExpiresAt ? `It now runs until ${formatExpiry(accessExpiresAt)}.` : "It now has no scheduled end date."
        ],
        note: "Nothing else has changed, and your records are unaffected."
      };
    case "expiry_changed":
      return {
        subject: "Your K-Labs Studio access end date has changed",
        preheader: `Your access now runs until ${formatExpiry(accessExpiresAt)}.`,
        heading: "Your access end date has changed",
        paragraphs: [
          "The end date of your complimentary K-Labs Studio access for {EMAIL} has changed.",
          `It now runs until ${formatExpiry(accessExpiresAt)}${previousExpiresAt ? `. It previously ran until ${formatExpiry(previousExpiresAt)}.` : ". It previously had no scheduled end date."}`
        ],
        note: "After this date, your records are kept safely and you can continue by choosing a subscription in Studio."
      };
    case "revoked":
      return {
        subject: "Your complimentary K-Labs Studio access has ended",
        preheader: "Your records are kept safely.",
        heading: "Your complimentary access has ended",
        paragraphs: [
          "Complimentary access to K-Labs Studio for {EMAIL} has ended.",
          "Your records are kept safely."
        ],
        note: "To continue working in Studio, sign in and choose a subscription."
      };
    default:
      throw new Error("Unsupported access email.");
  }
}

const REASON = "You received this email because the access for your K-Labs Studio account changed.";
const SECURITY = "If you weren’t expecting this change, you can ignore this email. Nothing else about your account has changed.";

const p = (html, style = "") => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text};${style}">${html}</p>`;

// { subject, html, text } for one builder. `email` is the builder's own account address, from the server.
export function buildAccessEmail({ event, email, accessExpiresAt = null, previousExpiresAt = null }) {
  if (typeof email !== "string" || !email) throw new Error("The builder's email address is required.");
  const content = accessEmailContent({ event, accessExpiresAt, previousExpiresAt });
  const addr = `<span style="color:${C.heading};word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(email)}</span>`;
  const paragraphs = content.paragraphs.map((x) => p(escapeHtml(x).replace("{EMAIL}", addr)));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(content.subject)}</title>
  <style>
    @media (max-width: 520px) {
      .kl-card { padding: 30px 22px !important; }
      .kl-button { width: 100% !important; }
      .kl-button a { display: block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};" bgcolor="${C.page}">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.page};">${escapeHtml(content.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
    <tr>
      <td align="center" style="padding:40px 12px;">
        <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 6px 18px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.32em;text-transform:uppercase;color:${C.titanium};">K-Labs Studio</td>
          </tr>
          <tr>
            <td class="kl-card" bgcolor="${C.panel}" style="background-color:${C.panel};border:1px solid ${C.edge};border-radius:16px;padding:36px 34px;">
              <h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:600;color:${C.heading};">${escapeHtml(content.heading)}</h1>
              ${paragraphs.join("\n              ")}
              <table role="presentation" class="kl-button" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;border-collapse:separate;">
                <tr>
                  <td align="center" bgcolor="${C.button}" style="background-color:${C.button};border:1px solid ${C.buttonEdge};border-radius:12px;">
                    <a href="${STUDIO_URL}" target="_blank" style="display:inline-block;padding:16px 30px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.buttonText};text-decoration:none;border-radius:12px;">Open K-Labs Studio</a>
                  </td>
                </tr>
              </table>
              ${p(escapeHtml(content.note), `font-size:14px;color:${C.muted};margin:0 0 16px;`)}
              ${p(`If the button doesn’t work, copy this link into your browser:<br><a href="${STUDIO_URL}" target="_blank" style="color:${C.link};text-decoration:underline;word-break:break-all;">${STUDIO_URL}</a>`, `font-size:13px;line-height:1.55;color:${C.muted};margin:0;`)}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 20px;"><tr><td style="border-top:1px solid ${C.edge};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>
              ${p(SECURITY, `font-size:14px;line-height:1.6;color:${C.muted};margin:0;`)}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 6px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">
              ${REASON}<br>
              K-Labs Studio &middot; <a href="${STUDIO_URL}" target="_blank" style="color:${C.muted};text-decoration:underline;">studio.klabs.co.nz</a>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
`;
  const text = [
    "K-LABS STUDIO", "", content.heading, "",
    ...content.paragraphs.map((x) => x.replace("{EMAIL}", email)), "",
    `Open K-Labs Studio: ${STUDIO_URL}`, "", content.note, "", SECURITY, "", REASON
  ].join("\n");
  return { subject: content.subject, html, text };
}

// Sends one email through the Resend API (the provider already verified for Studio's authentication emails).
// The idempotency key makes a repeated attempt for the same notification return the original result instead of
// sending again. Returns { accepted: true, messageId } or { accepted: false, error } with a short, secret-free reason.
// 'accepted' means Resend accepted the message for delivery; it does not confirm delivery.
export async function sendWithResend({ fetchImpl, apiKey, from, to, subject, html, text, idempotencyKey, timeoutMs = 10000 }) {
  if (!apiKey || !from) return { accepted: false, error: "Email sending is not configured on the server." };
  let res;
  try {
    res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    return { accepted: false, error: error?.name === "TimeoutError" ? "The email service did not answer in time." : "The email service could not be reached." };
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (res.ok && typeof body?.id === "string" && body.id) return { accepted: true, messageId: body.id };
  const detail = typeof body?.message === "string" ? body.message.replace(/re_[A-Za-z0-9_]+/g, "[key]").slice(0, 200) : "";
  return { accepted: false, error: `The email service refused the message (HTTP ${res.status})${detail ? `: ${detail}` : "."}` };
}
