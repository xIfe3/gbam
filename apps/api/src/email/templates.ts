import { formatNaira } from "@gbam/shared";
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
    }
  | {
      kind: "order_receipt";
      to: string;
      shopName: string;
      code: string;
      totalKobo: number;
      trackingUrl: string;
    }
  | {
      kind: "issue_reported";
      to: string;
      shopName: string;
      code: string;
      reasonLabel: string;
      note: string | null;
      orderUrl: string;
    }
  | {
      kind: "payout_account_changed";
      to: string;
      shopName: string;
      bankName: string;
      accountLast4: string;
    }
  | {
      kind: "account_closed";
      sellerId: string;
      shopName: string;
      slug: string;
      ownerEmail: string;
    };

const CONTACT_INBOX = "hello@gbam.app";
const PRIVACY_INBOX = "privacy@gbam.app";

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

  if (job.kind === "order_receipt") {
    return receiptEmail(job);
  }
  if (job.kind === "issue_reported") {
    return issueEmail(job);
  }
  if (job.kind === "account_closed") {
    return accountClosedEmail(job);
  }
  if (job.kind === "payout_account_changed") {
    return payoutChangedEmail(job);
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

/** Sent to a customer who gave their email at checkout: the code and the tracking link. */
function receiptEmail(job: Extract<EmailJob, { kind: "order_receipt" }>): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  const text = [
    `Thanks for your order from ${job.shopName}.`,
    ``,
    `Order code: ${job.code}`,
    `Total: ${total}`,
    ``,
    `Track your order, pay, or get help here:`,
    job.trackingUrl,
    ``,
    `Keep this email: the link opens your order without a password.`,
  ].join("\n");
  const html = [
    `<p>Thanks for your order from <strong>${escapeHtml(job.shopName)}</strong>.</p>`,
    `<p style="font-size: 24px; font-weight: bold; letter-spacing: 2px">${escapeHtml(job.code)}</p>`,
    `<p>Total: ${escapeHtml(total)}</p>`,
    `<p><a href="${escapeHtml(job.trackingUrl)}">Track your order, pay, or get help</a></p>`,
    `<p>Keep this email: the link opens your order without a password.</p>`,
  ].join("\n");
  return { to: job.to, subject: `Your order ${job.code} from ${job.shopName}`, text, html };
}

/** Sent to the seller when a customer reports a problem from their tracking page. */
function issueEmail(job: Extract<EmailJob, { kind: "issue_reported" }>): SendEmailInput {
  const lines = [
    `A customer reported a problem with order ${job.code}.`,
    ``,
    `Problem: ${job.reasonLabel}`,
  ];
  const htmlLines = [
    `<p>A customer reported a problem with order <strong>${escapeHtml(job.code)}</strong>.</p>`,
    `<p><strong>Problem:</strong> ${escapeHtml(job.reasonLabel)}</p>`,
  ];
  if (job.note) {
    lines.push(`Their note: ${job.note}`);
    htmlLines.push(
      `<p style="white-space: pre-wrap"><strong>Their note:</strong> ${escapeHtml(job.note)}</p>`,
    );
  }
  lines.push(``, `Open the order: ${job.orderUrl}`);
  htmlLines.push(`<p><a href="${escapeHtml(job.orderUrl)}">Open the order</a></p>`);
  return {
    to: job.to,
    subject: `${job.shopName}: problem reported on ${job.code}`,
    text: lines.join("\n"),
    html: htmlLines.join("\n"),
  };
}

/** To our privacy inbox: a seller deleted their account, so their data must be dealt with. */
function accountClosedEmail(job: Extract<EmailJob, { kind: "account_closed" }>): SendEmailInput {
  const lines = [
    `A seller deleted their account. The shop is already hidden and they are signed out.`,
    ``,
    `Shop: ${job.shopName} (/${job.slug})`,
    `Seller id: ${job.sellerId}`,
    `Owner email: ${job.ownerEmail}`,
    ``,
    `Delete or anonymise their data as the privacy policy says (keep what the law requires).`,
  ];
  const html = [
    `<p>A seller deleted their account. The shop is already hidden and they are signed out.</p>`,
    `<p><strong>Shop:</strong> ${escapeHtml(job.shopName)} (/${escapeHtml(job.slug)})<br>`,
    `<strong>Seller id:</strong> ${escapeHtml(job.sellerId)}<br>`,
    `<strong>Owner email:</strong> ${escapeHtml(job.ownerEmail)}</p>`,
    `<p>Delete or anonymise their data as the privacy policy says (keep what the law requires).</p>`,
  ].join("\n");
  return {
    to: PRIVACY_INBOX,
    subject: `Account deletion request: ${job.shopName}`,
    text: lines.join("\n"),
    html,
    replyTo: job.ownerEmail,
  };
}

/**
 * To the seller after their payout bank account changes. If it wasn't them, this is how
 * they find out before money goes to someone else.
 */
function payoutChangedEmail(job: Extract<EmailJob, { kind: "payout_account_changed" }>): SendEmailInput {
  const account = `${job.bankName}, account ending ${job.accountLast4}`;
  const warning = `If you didn't make this change, email support@gbam.app straight away and change your password.`;
  const text = [
    `The bank account for ${job.shopName}'s payouts was just changed.`,
    ``,
    `New payments will go to: ${account}`,
    ``,
    warning,
  ].join("\n");
  const html = [
    `<p>The bank account for <strong>${escapeHtml(job.shopName)}</strong>'s payouts was just changed.</p>`,
    `<p>New payments will go to: <strong>${escapeHtml(account)}</strong></p>`,
    `<p>${escapeHtml(warning)}</p>`,
  ].join("\n");
  return { to: job.to, subject: `Your Gbam payout account was changed`, text, html };
}
