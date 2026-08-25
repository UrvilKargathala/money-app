/**
 * Email delivery seam — Resend in production, console.log locally.
 * When RESEND_API_KEY is absent, emails print to terminal so the
 * developer can copy verification/reset/magic links during development.
 */

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let warnedNoKey = false;

async function deliverViaResend(payload: EmailPayload): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.RESEND_FROM_EMAIL ?? "MoneyMind <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  if (result.error) {
    throw new Error(`Resend delivery failed: ${result.error.message}`);
  }
}

function deliverViaConsole(payload: EmailPayload): void {
  if (!warnedNoKey) {
    warnedNoKey = true;
    console.warn(
      "[email] RESEND_API_KEY not set — emails are printed to terminal (dev mode)."
    );
  }
  console.log(
    `[email] To: ${payload.to} | Subject: ${payload.subject}\n` +
      `  Text: ${payload.text}\n`
  );
}

/** Sends an email via Resend or prints it locally depending on configuration. */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    await deliverViaResend(payload);
  } else if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1"
  ) {
    // Production without email config should fail loudly.
    throw new Error(
      "RESEND_API_KEY must be set in production for password reset and magic-link flows."
    );
  } else {
    deliverViaConsole(payload);
  }
}

/** Convenience helper for link-based emails. */
export function sendLinkEmail(params: {
  to: string;
  subject: string;
  intro: string;
  url: string;
  ctaText: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const expiryNote = params.expiresInMinutes
    ? `\n\nThis link expires in ${params.expiresInMinutes} minutes.`
    : "";
  return sendEmail({
    to: params.to,
    subject: params.subject,
    html:
      `<div style="font-family:sans-serif;padding:24px;max-width:480px">` +
      `<h2>${params.subject}</h2>` +
      `<p>${params.intro}</p>` +
      `<p><a href="${params.url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">${params.ctaText}</a></p>` +
      `<p style="color:#999;font-size:12px">If you didn't request this, ignore this email.${expiryNote.replace("\n\n", " ")}</p>` +
      `</div>`,
    text: `${params.intro}\n\n${params.ctaText}: ${params.url}${expiryNote}`,
  });
}
