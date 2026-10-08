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
      subtotalKobo: number;
      deliveryFeeKobo: number;
      /** Zone name, "Pickup", or null when the shop had no delivery zones. */
      deliveryLabel: string | null;
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
    }
  | {
      // To our support inbox: money came in that has to go back to the customer.
      kind: "needs_refund";
      orderCode: string;
      shopName: string;
      slug: string;
      totalKobo: number;
      /** Why the money can't be kept, in a sentence for the support team. */
      reason: string;
      /** The Paystack reference, when we know it. */
      paymentReference: string | null;
    }
  | { kind: "password_changed"; to: string; resetUrl: string }
  | {
      kind: "payment_received";
      to: string;
      shopName: string;
      code: string;
      customerName: string;
      totalKobo: number;
      orderUrl: string;
    }
  | {
      kind: "payment_confirmed";
      to: string;
      shopName: string;
      code: string;
      subtotalKobo: number;
      deliveryFeeKobo: number;
      /** Zone name, "Pickup", or null when the shop had no delivery zones. */
      deliveryLabel: string | null;
      totalKobo: number;
      trackingUrl: string;
    }
  | {
      kind: "order_cancelled";
      to: string;
      shopName: string;
      code: string;
      trackingUrl: string;
    }
  | {
      kind: "order_refunded";
      to: string;
      shopName: string;
      code: string;
      totalKobo: number;
      trackingUrl: string;
    }
  | { kind: "account_closed_owner"; to: string; shopName: string }
  | {
      kind: "welcome";
      to: string;
      shopName: string;
      shopUrl: string;
      dashboardUrl: string;
    }
  | { kind: "contact_auto_reply"; to: string }
  | { kind: "admin_invite"; to: string; name: string; inviteUrl: string }
  | {
      kind: "new_order";
      to: string;
      shopName: string;
      code: string;
      customerName: string;
      subtotalKobo: number;
      deliveryFeeKobo: number;
      /** Zone name, "Pickup", or null when the shop had no delivery zones. */
      deliveryLabel: string | null;
      totalKobo: number;
      orderUrl: string;
      settingsUrl: string;
    };

const CONTACT_INBOX = "hello@gbam.app";
const PRIVACY_INBOX = "privacy@gbam.app";
const SUPPORT_INBOX = "support@gbam.app";

/** Makes user-typed text safe to put inside HTML, so "<b>" shows as text, not markup. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/*
 * Brand colours, copied from apps/web/app/globals.css so emails look like the website.
 * Email apps ignore stylesheets and CSS variables, so every style below is written
 * inline on the element itself, and the layout uses tables (the one layout tool that
 * works in Gmail, Outlook and Apple Mail alike).
 */
const BRAND = "#13804f";
const BRAND_TINT = "#dcefe5";
const CORAL = "#ff7a6b";
const CORAL_WASH = "#fff0ec";
const CORAL_TINT = "#ffd2c9";
const BLUSH = "#fff8f5";
const INK = "#132a20";
const INK_MUTED = "#3b4b43";
const INK_SUBTLE = "#6b7a72";
const DISPLAY_FONT = "Fraunces, Georgia, 'Times New Roman', serif";
const BODY_FONT = "'DM Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** A normal paragraph. `innerHtml` must already be escaped. */
function paragraph(innerHtml: string): string {
  return `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: ${INK_MUTED}">${innerHtml}</p>`;
}

/** Small grey text, for "ignore this if it wasn't you" lines. */
function smallPrint(innerHtml: string): string {
  return `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: ${INK_SUBTLE}">${innerHtml}</p>`;
}

/** Bold dark text inside a paragraph. `innerHtml` must already be escaped. */
function strong(innerHtml: string): string {
  return `<strong style="color: ${INK}">${innerHtml}</strong>`;
}

// Matches an email address like support@gbam.app. The "g" flag finds every one in the text.
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Escapes plain text for HTML and makes any email address in it bold, so "email
 * support@gbam.app" stands out. `$&` in the replacement means "the address that matched".
 */
function withBoldEmails(plainText: string): string {
  const escaped = escapeHtml(plainText);
  return escaped.replace(EMAIL_ADDRESS, `<strong style="color: ${INK}">$&</strong>`);
}

/** A big code (sign-in code or order code) in a green-tinted box. */
function codeBox(code: string): string {
  return [
    `<div style="margin: 8px 0 24px; padding: 20px; background: ${BRAND_TINT}; border-radius: 16px; text-align: center">`,
    `<span style="font-family: ${DISPLAY_FONT}; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: ${INK}">${escapeHtml(code)}</span>`,
    `</div>`,
  ].join("");
}

/** A green, rounded button like the website's. It is a plain link styled to look like a button. */
function button(url: string, label: string): string {
  return [
    `<p style="margin: 8px 0 24px">`,
    `<a href="${escapeHtml(url)}" style="display: inline-block; padding: 14px 28px; background: ${BRAND}; color: #ffffff; border-radius: 999px; font-weight: 700; font-size: 16px; text-decoration: none">${escapeHtml(label)}</a>`,
    `</p>`,
  ].join("");
}

/** A soft coral box for the one line the reader must act on, like warnings on the website. */
function warningBox(innerHtml: string): string {
  return `<p style="margin: 0 0 16px; padding: 16px; background: ${CORAL_WASH}; border: 1px solid ${CORAL_TINT}; border-radius: 16px; font-size: 15px; line-height: 1.6; color: ${INK}">${innerHtml}</p>`;
}

/**
 * Wraps an email's content in the Gbam look: blush background, the "gbam!" wordmark,
 * a white rounded card, and a small footer. `contentHtml` must already be escaped.
 */
function emailLayout(contentHtml: string): string {
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    // Asks email apps not to repaint the email in dark colours. Many respect it; some
    // (like Gmail's dark mode on phones) may still darken it a little.
    `<meta name="color-scheme" content="light">`,
    `<meta name="supported-color-schemes" content="light">`,
    `</head>`,
    `<body style="margin: 0; padding: 0; background: ${BLUSH}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BLUSH}">`,
    `<tr><td align="center" style="padding: 32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; font-family: ${BODY_FONT}">`,
    // The "gbam!" wordmark: dark word, coral exclamation mark.
    `<tr><td style="padding: 0 8px 20px; font-family: ${DISPLAY_FONT}; font-size: 32px; font-weight: 900; line-height: 1; color: ${INK}">`,
    `gbam<span style="color: ${CORAL}">!</span>`,
    `</td></tr>`,
    `<tr><td style="background: #ffffff; border-radius: 24px; padding: 32px 28px">`,
    contentHtml,
    `</td></tr>`,
    `<tr><td style="padding: 20px 8px 0; font-size: 13px; line-height: 1.6; color: ${INK_SUBTLE}">`,
    `Gbam: take orders and get paid on WhatsApp.`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
    `</body>`,
    `</html>`,
  ].join("\n");
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
  if (job.kind === "needs_refund") {
    return needsRefundEmail(job);
  }
  if (job.kind === "password_changed") {
    return passwordChangedEmail(job);
  }
  if (job.kind === "payment_received") {
    return paymentReceivedEmail(job);
  }
  if (job.kind === "payment_confirmed") {
    return paymentConfirmedEmail(job);
  }
  if (job.kind === "order_cancelled") {
    return orderCancelledEmail(job);
  }
  if (job.kind === "order_refunded") {
    return orderRefundedEmail(job);
  }
  if (job.kind === "account_closed_owner") {
    return accountClosedOwnerEmail(job);
  }
  if (job.kind === "welcome") {
    return welcomeEmail(job);
  }
  if (job.kind === "contact_auto_reply") {
    return contactAutoReplyEmail(job);
  }
  if (job.kind === "admin_invite") {
    return adminInviteEmail(job);
  }
  if (job.kind === "new_order") {
    return newOrderEmail(job);
  }

  // contact_message
  const lines = [`Name: ${job.name}`, `Email: ${job.email}`];
  if (job.phone) {
    lines.push(`Phone: ${job.phone}`);
  }
  const text = `${lines.join("\n")}\n\n${job.message}`;

  const htmlLines = [paragraph(`${strong("Name:")} ${escapeHtml(job.name)}`)];
  htmlLines.push(paragraph(`${strong("Email:")} ${strong(escapeHtml(job.email))}`));
  if (job.phone) {
    htmlLines.push(paragraph(`${strong("Phone:")} ${escapeHtml(job.phone)}`));
  }
  // white-space: pre-wrap keeps the sender's line breaks.
  htmlLines.push(
    paragraph(`<span style="white-space: pre-wrap">${escapeHtml(job.message)}</span>`),
  );

  return {
    to: CONTACT_INBOX,
    subject: `Gbam contact form: ${job.name}`,
    text,
    html: emailLayout(htmlLines.join("\n")),
    replyTo: job.email,
  };
}

function codeEmail(to: string, code: string, intro: string): SendEmailInput {
  const text = `${intro}\n\n${code}\n\nThis code expires in 15 minutes. If you didn't ask for it, you can ignore this email.`;
  const content = [
    paragraph(escapeHtml(intro)),
    codeBox(code),
    smallPrint(
      `This code expires in 15 minutes. If you didn't ask for it, you can ignore this email.`,
    ),
  ].join("\n");
  const html = emailLayout(content);
  return { to, subject: `Your Gbam code: ${code}`, text, html };
}

/**
 * "Items ₦12,000 · Delivery (Lekki) ₦2,500 · Total ₦14,500", or null when there's no
 * delivery to show (a shop with no zones: the total is just the items).
 */
function amountsLine(job: {
  subtotalKobo: number;
  deliveryFeeKobo: number;
  deliveryLabel: string | null;
  totalKobo: number;
}): string | null {
  if (job.deliveryLabel === null && job.deliveryFeeKobo === 0) {
    return null;
  }
  let label = "Delivery";
  if (job.deliveryLabel !== null) {
    label = `Delivery (${job.deliveryLabel})`;
  }
  let fee = formatNaira(job.deliveryFeeKobo);
  if (job.deliveryFeeKobo === 0) {
    fee = "Free";
  }
  return `Items ${formatNaira(job.subtotalKobo)} · ${label} ${fee} · Total ${formatNaira(job.totalKobo)}`;
}

/** Sent to a customer who gave their email at checkout: the code and the tracking link. */
function receiptEmail(job: Extract<EmailJob, { kind: "order_receipt" }>): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  // With delivery: the full breakdown. Without: just the total.
  const amounts = amountsLine(job);
  let totalText = `Total: ${total}`;
  let totalHtml = paragraph(`Total: ${strong(escapeHtml(total))}`);
  if (amounts !== null) {
    totalText = amounts;
    totalHtml = paragraph(escapeHtml(amounts));
  }
  const text = [
    `Thanks for your order from ${job.shopName}.`,
    ``,
    `Order code: ${job.code}`,
    totalText,
    ``,
    `Track your order, pay, or get help here:`,
    job.trackingUrl,
    ``,
    `Keep this email: the link opens your order without a password.`,
  ].join("\n");
  const content = [
    paragraph(`Thanks for your order from ${strong(escapeHtml(job.shopName))}.`),
    codeBox(job.code),
    totalHtml,
    button(job.trackingUrl, "Track your order, pay, or get help"),
    smallPrint(`Keep this email: the link opens your order without a password.`),
  ].join("\n");
  const html = emailLayout(content);
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
    paragraph(`A customer reported a problem with order ${strong(escapeHtml(job.code))}.`),
    paragraph(`${strong("Problem:")} ${escapeHtml(job.reasonLabel)}`),
  ];
  if (job.note) {
    lines.push(`Their note: ${job.note}`);
    const note = `<span style="white-space: pre-wrap">${escapeHtml(job.note)}</span>`;
    htmlLines.push(paragraph(`${strong("Their note:")} ${note}`));
  }
  lines.push(``, `Open the order: ${job.orderUrl}`);
  htmlLines.push(button(job.orderUrl, "Open the order"));
  return {
    to: job.to,
    subject: `${job.shopName}: problem reported on ${job.code}`,
    text: lines.join("\n"),
    html: emailLayout(htmlLines.join("\n")),
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
  const details = [
    `${strong("Shop:")} ${escapeHtml(job.shopName)} (/${escapeHtml(job.slug)})<br>`,
    `${strong("Seller id:")} ${escapeHtml(job.sellerId)}<br>`,
    `${strong("Owner email:")} ${strong(escapeHtml(job.ownerEmail))}`,
  ].join("\n");
  const content = [
    paragraph(
      `A seller deleted their account. The shop is already hidden and they are signed out.`,
    ),
    paragraph(details),
    paragraph(
      `Delete or anonymise their data as the privacy policy says (keep what the law requires).`,
    ),
  ].join("\n");
  const html = emailLayout(content);
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
function payoutChangedEmail(
  job: Extract<EmailJob, { kind: "payout_account_changed" }>,
): SendEmailInput {
  const account = `${job.bankName}, account ending ${job.accountLast4}`;
  const warning = `If you didn't make this change, email support@gbam.app straight away and change your password.`;
  const text = [
    `The bank account for ${job.shopName}'s payouts was just changed.`,
    ``,
    `New payments will go to: ${account}`,
    ``,
    warning,
  ].join("\n");
  const content = [
    paragraph(
      `The bank account for ${strong(escapeHtml(job.shopName))}'s payouts was just changed.`,
    ),
    paragraph(`New payments will go to: ${strong(escapeHtml(account))}`),
    warningBox(withBoldEmails(warning)),
  ].join("\n");
  const html = emailLayout(content);
  return { to: job.to, subject: `Your Gbam payout account was changed`, text, html };
}

/**
 * To our support inbox: a customer paid but the order can't take the money (the seller
 * cancelled it while they were paying, or the stock ran out). Someone has to refund them.
 */
function needsRefundEmail(job: Extract<EmailJob, { kind: "needs_refund" }>): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  let reference = "unknown";
  if (job.paymentReference !== null) {
    reference = job.paymentReference;
  }
  const text = [
    `A customer needs a refund.`,
    ``,
    `Why: ${job.reason}`,
    ``,
    `Order: ${job.orderCode}`,
    `Shop: ${job.shopName} (/${job.slug})`,
    `Amount: ${total}`,
    `Paystack reference: ${reference}`,
    ``,
    `Refund the customer from the Paystack dashboard, then mark the order refunded.`,
  ].join("\n");
  const details = [
    `${strong("Order:")} ${escapeHtml(job.orderCode)}<br>`,
    `${strong("Shop:")} ${escapeHtml(job.shopName)} (/${escapeHtml(job.slug)})<br>`,
    `${strong("Amount:")} ${escapeHtml(total)}<br>`,
    `${strong("Paystack reference:")} ${escapeHtml(reference)}`,
  ].join("\n");
  const content = [
    warningBox(`${strong("A customer needs a refund.")} ${escapeHtml(job.reason)}`),
    paragraph(details),
    paragraph(`Refund the customer from the Paystack dashboard, then mark the order refunded.`),
  ].join("\n");
  return {
    to: SUPPORT_INBOX,
    subject: `NEEDS REFUND: ${job.orderCode} (${job.shopName})`,
    text,
    html: emailLayout(content),
  };
}

/** To the seller after their password changes, so a change they didn't make is noticed. */
function passwordChangedEmail(
  job: Extract<EmailJob, { kind: "password_changed" }>,
): SendEmailInput {
  const warning = `If you didn't do this, reset your password now and email support@gbam.app.`;
  const text = [
    `Your Gbam password was just changed. Any other phones or computers were signed out.`,
    ``,
    warning,
    `Reset your password: ${job.resetUrl}`,
  ].join("\n");
  const content = [
    paragraph(
      `Your Gbam password was just changed. Any other phones or computers were signed out.`,
    ),
    warningBox(withBoldEmails(warning)),
    button(job.resetUrl, "Reset my password"),
  ].join("\n");
  return {
    to: job.to,
    subject: `Your Gbam password was changed`,
    text,
    html: emailLayout(content),
  };
}

/** To the seller: a customer has paid for an order. */
function paymentReceivedEmail(
  job: Extract<EmailJob, { kind: "payment_received" }>,
): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  const text = [
    `${job.customerName} paid ${total} for order ${job.code}.`,
    ``,
    `Paystack sends the money to your bank account. Time to get the order ready.`,
    ``,
    `Open the order: ${job.orderUrl}`,
  ].join("\n");
  const content = [
    paragraph(
      `${strong(escapeHtml(job.customerName))} paid ${strong(escapeHtml(total))} for order:`,
    ),
    codeBox(job.code),
    paragraph(`Paystack sends the money to your bank account. Time to get the order ready.`),
    button(job.orderUrl, "Open the order"),
  ].join("\n");
  return {
    to: job.to,
    subject: `Paid: ${job.code} (${total})`,
    text,
    html: emailLayout(content),
  };
}

/** To the customer (if they gave an email): their payment went through. */
function paymentConfirmedEmail(
  job: Extract<EmailJob, { kind: "payment_confirmed" }>,
): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  const breakdownText: string[] = [];
  const breakdownHtml: string[] = [];
  const amounts = amountsLine(job);
  if (amounts !== null) {
    breakdownText.push(amounts);
    breakdownHtml.push(smallPrint(escapeHtml(amounts)));
  }
  const text = [
    `We got your payment of ${total} for your order from ${job.shopName}.`,
    ``,
    `Order code: ${job.code}`,
    ...breakdownText,
    ``,
    `${job.shopName} will get your order ready. Follow it here:`,
    job.trackingUrl,
    ``,
    `Keep this email as your proof of payment.`,
  ].join("\n");
  const shop = strong(escapeHtml(job.shopName));
  const content = [
    paragraph(`We got your payment of ${strong(escapeHtml(total))} for your order from ${shop}.`),
    codeBox(job.code),
    ...breakdownHtml,
    paragraph(`${escapeHtml(job.shopName)} will get your order ready.`),
    button(job.trackingUrl, "Follow your order"),
    smallPrint(`Keep this email as your proof of payment.`),
  ].join("\n");
  return {
    to: job.to,
    subject: `Payment received: order ${job.code} from ${job.shopName}`,
    text,
    html: emailLayout(content),
  };
}

/** To the customer (if they gave an email): the seller cancelled the order. */
function orderCancelledEmail(job: Extract<EmailJob, { kind: "order_cancelled" }>): SendEmailInput {
  const text = [
    `${job.shopName} cancelled your order ${job.code}.`,
    ``,
    `If you already paid, you will get your money back. See the order or get help here:`,
    job.trackingUrl,
  ].join("\n");
  const content = [
    paragraph(`${strong(escapeHtml(job.shopName))} cancelled your order:`),
    codeBox(job.code),
    paragraph(`If you already paid, you will get your money back.`),
    button(job.trackingUrl, "See the order or get help"),
  ].join("\n");
  return {
    to: job.to,
    subject: `Order ${job.code} from ${job.shopName} was cancelled`,
    text,
    html: emailLayout(content),
  };
}

/** To the customer (if they gave an email): their money was given back. */
function orderRefundedEmail(job: Extract<EmailJob, { kind: "order_refunded" }>): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  const text = [
    `${job.shopName} refunded ${total} for your order ${job.code}.`,
    ``,
    `Banks can take a few working days to show the money in your account.`,
    ``,
    `See the order or get help: ${job.trackingUrl}`,
  ].join("\n");
  const shop = strong(escapeHtml(job.shopName));
  const content = [
    paragraph(`${shop} refunded ${strong(escapeHtml(total))} for your order:`),
    codeBox(job.code),
    paragraph(`Banks can take a few working days to show the money in your account.`),
    button(job.trackingUrl, "See the order or get help"),
  ].join("\n");
  return {
    to: job.to,
    subject: `Refund for order ${job.code} from ${job.shopName}`,
    text,
    html: emailLayout(content),
  };
}

/** To the owner after they delete their account: a record, and a warning if it wasn't them. */
function accountClosedOwnerEmail(
  job: Extract<EmailJob, { kind: "account_closed_owner" }>,
): SendEmailInput {
  const gone = `Your shop is no longer visible, and you've been signed out everywhere. We keep order records only as long as the law requires.`;
  const warning = `If you didn't do this, email support@gbam.app straight away and we'll help you get your shop back.`;
  const text = [`Your Gbam account for ${job.shopName} was deleted.`, ``, gone, ``, warning].join(
    "\n",
  );
  const content = [
    paragraph(`Your Gbam account for ${strong(escapeHtml(job.shopName))} was deleted.`),
    paragraph(escapeHtml(gone)),
    warningBox(withBoldEmails(warning)),
  ].join("\n");
  return {
    to: job.to,
    subject: `Your Gbam account was deleted`,
    text,
    html: emailLayout(content),
  };
}

/** To a new seller once their email is verified: what to do next. */
function welcomeEmail(job: Extract<EmailJob, { kind: "welcome" }>): SendEmailInput {
  const steps = [
    `Add your products, with prices and photos.`,
    `Add your bank account, so customers can pay you.`,
    `Share your shop link on WhatsApp: ${job.shopUrl}`,
  ];

  const textLines = [`Welcome to Gbam, ${job.shopName}!`, ``, `Three steps to your first order:`];
  // An ordered list: "1. ...", "2. ..." in the text version, one <li> each in the HTML.
  const listItems: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) {
      continue;
    }
    textLines.push(`${i + 1}. ${step}`);
    listItems.push(`<li style="margin: 0 0 8px">${escapeHtml(step)}</li>`);
  }
  textLines.push(``, `Open your dashboard: ${job.dashboardUrl}`);

  const list = `<ol style="margin: 0 0 16px; padding-left: 20px; font-size: 16px; line-height: 1.6; color: ${INK_MUTED}">${listItems.join("")}</ol>`;
  const content = [
    paragraph(`Welcome to Gbam, ${strong(escapeHtml(job.shopName))}!`),
    paragraph(`Three steps to your first order:`),
    list,
    button(job.dashboardUrl, "Open my dashboard"),
  ].join("\n");
  return {
    to: job.to,
    subject: `Welcome to Gbam`,
    text: textLines.join("\n"),
    html: emailLayout(content),
  };
}

/**
 * To whoever used the contact form. On purpose it repeats nothing they typed: anyone can
 * put any address in the form, so this must never carry someone else's words to a stranger.
 */
function contactAutoReplyEmail(
  job: Extract<EmailJob, { kind: "contact_auto_reply" }>,
): SendEmailInput {
  const thanks = `Thanks for getting in touch. We got your message and will reply within one working day.`;
  const notYou = `If you didn't contact Gbam, you can ignore this email.`;
  const content = [paragraph(thanks), smallPrint(notYou)].join("\n");
  return {
    to: job.to,
    subject: `We got your message`,
    text: `${thanks}\n\n${notYou}`,
    html: emailLayout(content),
  };
}

/** To the seller: a new order came in (they can turn these off in Settings). */
function newOrderEmail(job: Extract<EmailJob, { kind: "new_order" }>): SendEmailInput {
  const total = formatNaira(job.totalKobo);
  const breakdownText: string[] = [];
  const breakdownHtml: string[] = [];
  const amounts = amountsLine(job);
  if (amounts !== null) {
    breakdownText.push(amounts);
    breakdownHtml.push(paragraph(escapeHtml(amounts)));
  }
  const text = [
    `New order from ${job.customerName}: ${total}.`,
    ``,
    `Order code: ${job.code}`,
    ...breakdownText,
    ``,
    `Open the order: ${job.orderUrl}`,
    ``,
    `Don't want these emails? Turn them off in Settings: ${job.settingsUrl}`,
  ].join("\n");
  const settingsLink = `<a href="${escapeHtml(job.settingsUrl)}" style="color: ${INK_SUBTLE}">Settings</a>`;
  const customer = strong(escapeHtml(job.customerName));
  const content = [
    paragraph(`New order from ${customer}: ${strong(escapeHtml(total))}.`),
    codeBox(job.code),
    ...breakdownHtml,
    button(job.orderUrl, "Open the order"),
    smallPrint(`Don't want these emails? Turn them off in ${settingsLink}.`),
  ].join("\n");
  return {
    to: job.to,
    subject: `New order ${job.code} (${total})`,
    text,
    html: emailLayout(content),
  };
}

/** To someone invited to the Gbam admin area: the link to set their password and app. */
function adminInviteEmail(job: Extract<EmailJob, { kind: "admin_invite" }>): SendEmailInput {
  const steps = `You'll choose a password and set up an authenticator app (like Google Authenticator) on your phone.`;
  const expiry = `The link works once and expires in 48 hours. If you weren't expecting this, ignore this email.`;
  const text = [
    `Hi ${job.name},`,
    ``,
    `You've been invited to the Gbam admin area.`,
    steps,
    ``,
    `Accept the invite: ${job.inviteUrl}`,
    ``,
    expiry,
  ].join("\n");
  const content = [
    paragraph(`Hi ${strong(escapeHtml(job.name))},`),
    paragraph(`You've been invited to the Gbam admin area. ${escapeHtml(steps)}`),
    button(job.inviteUrl, "Accept the invite"),
    smallPrint(escapeHtml(expiry)),
  ].join("\n");
  return {
    to: job.to,
    subject: `You're invited to the Gbam admin area`,
    text,
    html: emailLayout(content),
  };
}
