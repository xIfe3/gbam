import { z } from "zod";

/**
 * The marketing pages whose words and photos admins can edit. The layout stays in code; only
 * these fields change, so an edit can't break the design. Pricing isn't here: its headline
 * comes from the live fee settings.
 */
export const MARKETING_PAGES = [
  "home",
  "features",
  "about",
  "how-it-works",
  "use-cases",
  "mission",
  "security",
] as const;
export type MarketingPage = (typeof MARKETING_PAGES)[number];

export const MARKETING_PAGE_LABELS: Record<MarketingPage, string> = {
  home: "Home",
  features: "Features",
  about: "About",
  "how-it-works": "How it works",
  "use-cases": "Use cases",
  mission: "Mission",
  security: "Security",
};

const words = (max: number) => z.string().trim().min(1, "This can't be empty").max(max);

/** A photo on the site: one of ours (/images/…) or an uploaded one (https://…). */
const photoSrc = z
  .string()
  .trim()
  .regex(/^(\/images\/[\w./-]+|https:\/\/\S+)$/, "Use /images/… or an https:// photo address");

/** The split header at the top of most marketing pages. */
export const pageHeaderSchema = z.object({
  eyebrow: words(40),
  title: words(120),
  lead: words(400),
  photoSrc,
  photoAlt: words(200),
  /** The button under the text; empty = no button. */
  ctaLabel: z.string().trim().max(40),
});
export type PageHeaderFields = z.output<typeof pageHeaderSchema>;

export const featureTileSchema = z.object({
  eyebrow: words(40),
  title: words(80),
  text: words(400),
});
export type FeatureTile = z.output<typeof featureTileSchema>;

const seoDescription = words(300);

const homeSchema = z.object({
  seoDescription,
  heroSubtitle: words(300),
  primaryButton: words(40),
  secondaryButton: words(40),
  heroSmallPrint: words(150),
});
const featuresSchema = z.object({
  seoDescription,
  header: pageHeaderSchema,
  tiles: z.array(featureTileSchema).min(1).max(12),
});
const headerPageSchema = z.object({ seoDescription, header: pageHeaderSchema });

/** Each page's fields, checked by its own schema. */
export const MARKETING_SCHEMAS = {
  home: homeSchema,
  features: featuresSchema,
  about: headerPageSchema,
  "how-it-works": headerPageSchema,
  "use-cases": headerPageSchema,
  mission: headerPageSchema,
  security: headerPageSchema,
} as const;

export type MarketingFields<P extends MarketingPage> = z.output<(typeof MARKETING_SCHEMAS)[P]>;

/** Today's words: what each page shows until an admin publishes a change. */
export const MARKETING_DEFAULTS: { [P in MarketingPage]: MarketingFields<P> } = {
  home: {
    seoDescription:
      "Give customers one link to order and pay. Gbam keeps your WhatsApp orders organised and your payments safe.",
    heroSubtitle:
      "One link for your whole shop. Customers order and pay with Paystack, get updates on WhatsApp, and you just pack and deliver.",
    primaryButton: "Start selling free",
    secondaryButton: "See how it works →",
    heroSmallPrint: "Free for founding sellers · No app to install · Payments by Paystack",
  },
  features: {
    seoDescription:
      "One shop link, Paystack payments, automatic WhatsApp updates and an order dashboard for Nigerian sellers.",
    header: {
      eyebrow: "Features",
      title: "Everything a WhatsApp shop needs",
      lead: "Stop chasing payments in the DMs. Gbam gives you a shop link, takes payment, tells your customers what is happening, and keeps your orders in one place.",
      photoSrc: "/images/pages/features.webp",
      photoAlt: "A food seller checking an order on his phone at his stall",
      ctaLabel: "Start selling free",
    },
    tiles: [
      {
        eyebrow: "Storefront",
        title: "One link for your whole shop",
        text: "Put your products on a page of your own and share the link on your WhatsApp status, in your bio or in any chat. Customers open it in their browser: no app to install.",
      },
      {
        eyebrow: "Payments",
        title: "Review & pay with Paystack",
        text: "Each order comes with a payment link. Customers see what they ordered and the total, then pay in Paystack's secure window, so we never see their card numbers.",
      },
      {
        eyebrow: "Updates",
        title: "Automatic WhatsApp updates",
        text: "Order received, payment confirmed, on its way: your customer gets a WhatsApp message at each step without you typing it.",
      },
      {
        eyebrow: "Orders",
        title: "An order dashboard",
        text: "See every order with its status (new, awaiting payment, paid, sent out, delivered) and a history of what changed and when.",
      },
      {
        eyebrow: "Payouts",
        title: "Paid out to your bank",
        text: "Money from paid orders is settled to the bank account you add during setup, through a Paystack subaccount in your name.",
      },
      {
        eyebrow: "Delivery",
        title: "Delivery status",
        text: "Mark an order as sent out or delivered and your customer is told for you. You still arrange the delivery yourself, with your own rider or courier.",
      },
      {
        eyebrow: "Products",
        title: "Photos, options and stock",
        text: "Add products with photos, a price and options such as size or colour. Each combination can have its own price and stock, and stock comes off when an order is paid.",
      },
      {
        eyebrow: "Tracking",
        title: "Order tracking for customers",
        text: "Customers get an order code and a private link to follow their order, pay, or report a problem. No account needed.",
      },
      {
        eyebrow: "Refunds",
        title: "Cancel and refund safely",
        text: "Cancelling gives you a few seconds to undo. Refunds show the payment reference and the steps to give the money back.",
      },
      {
        eyebrow: "Settings",
        title: "Your shop, your way",
        text: "Change your shop name, WhatsApp number, payout bank account or password whenever you need to.",
      },
    ],
  },
  about: {
    seoDescription: "Why Gbam exists, and who is building it.",
    header: {
      eyebrow: "About",
      title: "Why Gbam exists",
      lead: "Many Nigerian businesses sell on WhatsApp. Payments, orders and updates end up scattered across chats. Gbam puts them in one place.",
      photoSrc: "/images/pages/about.webp",
      photoAlt: "A small business owner holding her laptop",
      ctaLabel: "",
    },
  },
  "how-it-works": {
    seoDescription: "From your first shop link to a delivered order, step by step.",
    header: {
      eyebrow: "How it works",
      title: "From link to delivered order",
      lead: "Here is what happens on your side and on your customer's side.",
      photoSrc: "/images/pages/how-it-works.webp",
      photoAlt: "A delighted customer looking at her phone",
      ctaLabel: "",
    },
  },
  "use-cases": {
    seoDescription: "How food sellers, fashion sellers, beauty sellers and more can use Gbam.",
    header: {
      eyebrow: "Use cases",
      title: "Made for every kind of seller",
      lead: "If your customers already message you on WhatsApp to order, Gbam can take over the payment chasing.",
      photoSrc: "/images/pages/use-cases.webp",
      photoAlt: "A smiling tailor at work among bales of fabric",
      ctaLabel: "",
    },
  },
  mission: {
    seoDescription: "Our mission: make selling on WhatsApp simple, paid and organised.",
    header: {
      eyebrow: "Mission",
      title: "No more chasing payments in the DMs",
      lead: "Our mission is to make selling on WhatsApp simple, paid and organised.",
      photoSrc: "/images/pages/mission.webp",
      photoAlt: "A relaxed woman smiling over a cup of tea",
      ctaLabel: "",
    },
  },
  security: {
    seoDescription: "How Gbam protects money and data: Paystack payments, signed webhooks, HTTPS.",
    header: {
      eyebrow: "Security",
      title: "How we protect money and data",
      lead: "Here is what we do, in plain words. If you have a security concern, write to support@gbam.app.",
      photoSrc: "/images/pages/security.webp",
      photoAlt: "A woman using her phone",
      ctaLabel: "",
    },
  },
};

export function isMarketingPage(value: string): value is MarketingPage {
  for (const page of MARKETING_PAGES) {
    if (page === value) {
      return true;
    }
  }
  return false;
}

/**
 * A page's fields: each saved field that's still valid, today's default for any that's
 * missing or no longer fits (e.g. saved before a field changed). A page never breaks.
 */
export function resolveMarketing<P extends MarketingPage>(
  page: P,
  saved: unknown,
): MarketingFields<P> {
  const defaults = MARKETING_DEFAULTS[page] as Record<string, unknown>;
  const schema = MARKETING_SCHEMAS[page];
  const result: Record<string, unknown> = { ...defaults };
  if (typeof saved === "object" && saved !== null) {
    const values = saved as Record<string, unknown>;
    for (const key of Object.keys(defaults)) {
      const fieldSchema = schema.shape[key as keyof typeof schema.shape] as z.ZodType;
      const checked = fieldSchema.safeParse(values[key]);
      if (checked.success) {
        result[key] = checked.data;
      }
    }
  }
  return result as MarketingFields<P>;
}
