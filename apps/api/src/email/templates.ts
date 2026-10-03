import type { SendEmailInput } from "@gbam/integrations";

export type EmailJob =
  | { kind: "verify_email"; to: string; code: string }
  | { kind: "reset_password"; to: string; code: string }
  | {
      kind: "contact_message";
      name: string;
      email: string;
      phone: string | null;
      message: string;
    };

const CONTACT_INBOX = "hello@gbam.app";

/** Makes user-typed text safe to put inside HTML, so "<b>" shows as text, not markup. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Turns a job into the finished email (recipient, subject, plain text and HTML). */
export function renderEmail(job: EmailJob): SendEmailInput {
  if (job.kind === "verify_email") {
    return codeEmail(job.to, job.code, "Use this code to verify your email address.");
  }
  if (job.kind === "reset_password") {
    return codeEmail(job.to, job.code, "Use this code to reset your Gbam password.");
  }

  // contact_message
  const lines = [`Name: ${job.name}`, `Email: ${job.email}`];
  if (job.phone) {
    lines.push(`Phone: ${job.phone}`);
  }
  const text = `${lines.join("\n")}\n\n${job.message}`;

  const htmlLines = [`<p><strong>Name:</strong> ${escapeHtml(job.name)}</p>`];
  htmlLines.push(`<p><strong>Email:</strong> ${escapeHtml(job.email)}</p>`);
  if (job.phone) {
    htmlLines.push(`<p><strong>Phone:</strong> ${escapeHtml(job.phone)}</p>`);
  }
  // white-space: pre-wrap keeps the sender's line breaks.
  htmlLines.push(`<p style="white-space: pre-wrap">${escapeHtml(job.message)}</p>`);

  return {
    to: CONTACT_INBOX,
    subject: `Gbam contact form: ${job.name}`,
    text,
    html: htmlLines.join("\n"),
    replyTo: job.email,
  };
}

function codeEmail(to: string, code: string, intro: string): SendEmailInput {
  const text = `${intro}\n\n${code}\n\nThis code expires in 15 minutes. If you didn't ask for it, you can ignore this email.`;
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px">${escapeHtml(code)}</p>`,
    `<p>This code expires in 15 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  ].join("\n");
  return { to, subject: `Your Gbam code: ${code}`, text, html };
}
