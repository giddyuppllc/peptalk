/**
 * Transactional email.
 *
 * WHY THIS EXISTS
 * There was no way to send a customer an email at all. No welcome message, no
 * purchase confirmation, and nothing from Supabase either — `mailer_autoconfirm`
 * is on, so even the signup confirmation is skipped. A person could create an
 * account and pay $49.99 and receive nothing.
 *
 * DELIVERABILITY — READ THIS BEFORE TRUSTING IT
 * peptalk.bio publishes SPF and DMARC at `p=quarantine` but has NO DKIM record.
 * Mail sent as peptalk.bio by anyone other than Google Workspace will be
 * quarantined. Verifying the domain inside the provider adds the DKIM record
 * and fixes this — it is a required setup step, not an optimisation. Until it
 * is done these messages will send successfully and land in spam, which is the
 * worst of both worlds because nothing reports an error.
 *
 * NO-OPS WHEN UNCONFIGURED
 * Without RESEND_API_KEY this logs and returns false. It never throws. An email
 * failure must never take down a signup or, worse, a payment — the money has
 * already moved by the time we try to send a receipt.
 *
 * SWAPPING PROVIDER
 * Resend is one HTTP POST with a JSON body. Postmark, SendGrid and Mailgun are
 * the same shape with different field names; changing provider means editing
 * `send()` below and nothing else. Callers only ever see sendEmail().
 */

const API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
/** Must be a mailbox on a domain verified with the provider. */
const FROM = Deno.env.get('EMAIL_FROM') ?? 'PepTalk <noreply@peptalk.bio>';
const REPLY_TO = Deno.env.get('EMAIL_REPLY_TO') ?? '';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Always required — some clients never render the HTML. */
  text: string;
  html?: string;
}

export function emailEnabled(): boolean {
  return API_KEY.length > 0;
}

/**
 * Send one transactional email. Returns true only on a confirmed accept.
 *
 * Never throws: callers are on signup and payment paths where a failed send
 * must not surface as a failed operation.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', msg.to);
    return false;
  }
  if (!msg.to || !msg.to.includes('@')) {
    console.warn('[email] refusing to send to a malformed address');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] send failed ${res.status}:`, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send threw:', err);
    return false;
  }
}

/**
 * Minimal HTML wrapper. Deliberately plain: a table-free, image-free, mostly
 * inline-styled message renders consistently and is far less likely to be
 * classed as bulk than a designed template.
 */
export function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14201f;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dfe5e3;border-radius:10px;padding:28px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#14201f;">${title}</h1>
${bodyHtml}
<p style="margin:26px 0 0;font-size:12px;color:#6e8280;border-top:1px solid #eceff0;padding-top:14px;">
PepTalk is for educational purposes only and does not provide medical advice.
Consult your healthcare provider before making health decisions.
</p>
</div></body></html>`;
}
