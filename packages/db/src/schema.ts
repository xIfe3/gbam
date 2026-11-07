import {
  ANNOUNCEMENT_STATUSES,
  NOTIFICATION_DISPLAYS,
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUSES,
  TOUR_NAMES,
} from "@gbam/shared";
import { relations, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  bigint,
  date,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The enum values come from @gbam/shared, so the DB and the state machine can't drift.
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const orderActorEnum = pgEnum("order_actor", ["seller", "system"]);
export const issueReasonEnum = pgEnum("issue_reason", [
  "paid_not_marked",
  "not_received",
  "wrong_or_damaged",
  "other",
]);
export const tourNameEnum = pgEnum("tour_name", TOUR_NAMES);
export const tourOutcomeEnum = pgEnum("tour_outcome", ["completed", "skipped"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "success", "failed"]);
/** accepted = Meta took our request; the rest come from the WhatsApp webhook. */
export const whatsappStatusEnum = pgEnum("whatsapp_status", [
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const productStatusEnum = pgEnum("product_status", ["active", "hidden", "archived"]);

export const userRoleEnum = pgEnum("user_role", ["seller", "admin"]);
export const emailCodePurposeEnum = pgEnum("email_code_purpose", [
  "verify_email",
  "reset_password",
]);
export const contactStatusEnum = pgEnum("contact_status", ["new", "handled"]);
export const contentTypeEnum = pgEnum("content_type", [
  "help_article",
  "faq",
  "blog_post",
  "changelog",
  "legal",
  // Text and photos of a marketing page (home, features...), as typed fields in `data`.
  "marketing_page",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** Integer kobo. bigint so large orders don't overflow int4 (~₦21M). */
const kobo = (name: string) => bigint(name, { mode: "number" }).notNull();

/** A person who can log in. Emails are stored lowercase. */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  role: userRoleEnum("role").notNull().default("seller"),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A login session. Only a hash of the session token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time codes emailed to a user (verify email, reset password). Only a hash is stored. */
export const emailCodes = pgTable(
  "email_codes",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: emailCodePurposeEnum("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /**
     * reset_password only: SHA-256 of the requestId given to the browser that asked for
     * the reset. The code works only together with that requestId.
     */
    requestTokenHash: text("request_token_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("email_codes_user_idx").on(t.userId)],
);

/** Messages sent from the public contact form. */
export const contactMessages = pgTable("contact_messages", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message").notNull(),
  status: contactStatusEnum("status").notNull().default("new"),
  /** What the admin who handled it wrote, and when. */
  handledNote: text("handled_note"),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Help articles, FAQs, blog posts, changelog and legal pages, loaded from Markdown files. */
export const contentEntries = pgTable(
  "content_entries",
  {
    id: id(),
    type: contentTypeEnum("type").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    /** Markdown. */
    body: text("body").notNull().default(""),
    /** Extra structured fields (e.g. legal sections). */
    data: jsonb("data"),
    category: text("category"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** null = draft, not shown publicly. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** The search engine description (meta description). */
    seoDescription: text("seo_description"),
    /**
     * Unpublished changes from the content editor ({ title, summary, body, data, category,
     * sortOrder, seoDescription }). The public only ever sees the fields above; Publish copies
     * this draft over them. null = nothing waiting to be published.
     */
    draft: jsonb("draft"),
    /** In the bin (restorable for 30 days). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("content_entries_type_slug_uq").on(t.type, t.slug)],
);

/** Every time an entry is published, a copy of what went live, so it can be compared or restored. */
export const contentVersions = pgTable(
  "content_versions",
  {
    id: id(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    /** 1 for the first publish, then 2, 3... */
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    body: text("body").notNull(),
    data: jsonb("data"),
    category: text("category"),
    seoDescription: text("seo_description"),
    publishedBy: uuid("published_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [unique("content_versions_entry_version_uq").on(t.entryId, t.version)],
);

/** A seller is the tenant. Every other row hangs off seller_id. */
export const sellers = pgTable("sellers", {
  id: id(),
  slug: text("slug").notNull().unique(),
  businessName: text("business_name").notNull(),
  whatsappPhone: text("whatsapp_phone").notNull().unique(),
  /** Seller's Paystack subaccount: payments split to their bank account. */
  paystackSubaccountCode: text("paystack_subaccount_code"),
  /** "Founding seller" offer: no gbam fee until this date. null = normal fees. */
  feeWaivedUntil: timestamp("fee_waived_until", { withTimezone: true }),
  /** The user who owns this shop. Nullable until every seller has an owner. */
  ownerUserId: uuid("owner_user_id")
    .unique()
    .references(() => users.id),
  /** Payout bank details. Only the last 4 digits of the account number are kept. */
  bankName: text("bank_name"),
  accountLast4: text("account_last4"),
  bankAccountName: text("bank_account_name"),
  /**
   * Set when the owner deletes their account: the shop is hidden at once and its owner
   * can't sign in. The rows are kept (orders are business records) until deletion is done.
   */
  closedAt: timestamp("closed_at", { withTimezone: true }),
  /**
   * Set by an admin to stop a shop taking orders (e.g. a fraud report). The shop page says it
   * isn't taking orders and no payments go through; the seller can still sign in.
   */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  /** Email the owner when a new order comes in. Busy shops can turn it off in Settings. */
  newOrderEmails: boolean("new_order_emails").notNull().default(true),
  /**
   * false (the default): the customer can pay the moment they order. true: every order waits
   * until the seller checks it and taps "Request payment" (for made-to-order shops).
   */
  approveOrdersFirst: boolean("approve_orders_first").notNull().default(false),
  /**
   * Where the seller first came from, e.g. "shop-mama-ngozi" (the "Powered by Gbam" link on
   * that shop) or a ?utm_source=. null = unknown. Tells us which channels bring sellers.
   */
  signupSource: text("signup_source"),
  /** Gbam's "news and tips" announcements. Off = unsubscribed (Settings or the email link). */
  newsEmails: boolean("news_emails").notNull().default(true),
  /** Shown to customers who pick a pickup zone, e.g. "Shop 12, Balogun Market, after 10am". */
  pickupNote: text("pickup_note"),
  /** The shop's logo and banner photos (keys in photo storage); null = the default look. */
  logoKey: text("logo_key"),
  bannerKey: text("banner_key"),
  /** When the shop link (slug) was last changed: it can change at most once every 30 days. */
  slugChangedAt: timestamp("slug_changed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A place a seller delivers to, with its price, e.g. "Lekki / VI – ₦2,500". A pickup zone
 * means the customer collects the order. Removing a zone sets archived_at (old orders keep
 * their own copy of its name and fee).
 */
export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    feeKobo: integer("fee_kobo").notNull(),
    isPickup: boolean("is_pickup").notNull().default(false),
    /** The order the seller put them in (0 first). */
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("delivery_zones_seller_idx").on(t.sellerId)],
);

export const deliveryZonesRelations = relations(deliveryZones, ({ one }) => ({
  seller: one(sellers, { fields: [deliveryZones.sellerId], references: [sellers.id] }),
}));

export const customers = pgTable(
  "customers",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customers_seller_phone_uq").on(t.sellerId, t.phone)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * Set once when the product is created, never changed. Unique within a shop.
     */
    slug: text("slug").notNull(),
    description: text("description"),
    status: productStatusEnum("status").notNull().default("active"),
    /** Optimistic-lock counter: bumped on every save so a stale editor is detected. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_seller_idx").on(t.sellerId),
    uniqueIndex("products_seller_slug_idx").on(t.sellerId, t.slug),
  ],
);

// Row types, so other code can say "a Product" instead of repeating the table shape.
export type Product = typeof products.$inferSelect;

/** A choice a buyer makes on a product, e.g. name "Size", values ["S", "M", "L"]. */
export const productOptions = pgTable(
  "product_options",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    values: text("values").array().notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_options_product_idx").on(t.productId)],
);

/** An uploaded photo. productId is null until the photo is attached to a product. */
export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** Storage keys of the two WebP sizes (1600 px and 400 px). */
    largeKey: text("large_key").notNull(),
    smallKey: text("small_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId),
    index("product_images_seller_idx").on(t.sellerId),
  ],
);

/**
 * One buyable combination of a product's options. A product with no options has one
 * default variant whose optionValues is empty.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** One value per option, in option order, e.g. ["M", "Red"]. */
    optionValues: text("option_values").array().notNull().default([]),
    title: text("title").notNull().default(""),
    priceKobo: kobo("price_kobo"),
    /** null = untracked stock. */
    stock: integer("stock"),
    imageId: uuid("image_id").references(() => productImages.id, { onDelete: "set null" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    // Only live variants must be unique: an archived one keeps its old combination.
    uniqueIndex("product_variants_product_values_idx")
      .on(t.productId, t.optionValues)
      .where(sql`${t.archivedAt} is null`),
  ],
);

export type ProductVariant = typeof productVariants.$inferSelect;

export const orders = pgTable(
  "orders",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    /** Short human code the seller and customer quote on WhatsApp, e.g. "GB-7K3Q". */
    code: text("code").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    /** Always subtotal + delivery fee: what the customer pays. */
    totalKobo: kobo("total_kobo"),
    /** The items only. Gbam's fee is worked out on this, never on delivery. */
    subtotalKobo: kobo("subtotal_kobo"),
    deliveryFeeKobo: bigint("delivery_fee_kobo", { mode: "number" }).notNull().default(0),
    /*
     * A copy of the delivery choice, taken when the order is placed. If the seller later
     * edits or removes the zone, this order keeps what the customer agreed to.
     * Zone name is null when the shop had no zones; address is null for pickup orders.
     */
    deliveryZoneName: text("delivery_zone_name"),
    deliveryIsPickup: boolean("delivery_is_pickup").notNull().default(false),
    deliveryAddress: text("delivery_address"),
    deliveryLandmark: text("delivery_landmark"),
    /** True when payment arrived after the stock had run out: the seller must refund. */
    stockShortfall: boolean("stock_shortfall").notNull().default(false),
    note: text("note"),
    /**
     * Secret key in the customer's private tracking link (/track/GB-7K3Q?k=…). Long and random,
     * so it can't be guessed; it opens only this order. Made here for every new order.
     */
    trackingKey: text("tracking_key")
      .notNull()
      .$defaultFn(() => randomBytes(32).toString("base64url")),
    /** Optional: the customer asked for an emailed receipt with the tracking link. */
    customerEmail: text("customer_email"),
    /** When the "you haven't paid yet" WhatsApp reminder went out. Set once, so it's sent once. */
    paymentReminderSentAt: timestamp("payment_reminder_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_seller_code_uq").on(t.sellerId, t.code),
    uniqueIndex("orders_tracking_key_uq").on(t.trackingKey),
    // /track looks orders up by code alone (codes repeat across shops, so not unique).
    index("orders_code_idx").on(t.code),
    index("orders_seller_status_idx").on(t.sellerId, t.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    // Snapshot at order time so later product edits don't rewrite history.
    productName: text("product_name").notNull(),
    variantTitle: text("variant_title").notNull().default(""),
    unitPriceKobo: kobo("unit_price_kobo"),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export type PaymentMethod = "checkout" | "bank_transfer" | "ussd";

export type PaymentInstructions =
  | { kind: "bank_transfer"; bankName: string; accountNumber: string; accountName: string }
  | { kind: "ussd"; bank: string; ussdCode: string };

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("paystack"),
    /** Paystack transaction reference. Unique so a replayed webhook is a no-op. */
    reference: text("reference").notNull().unique(),
    amountKobo: kobo("amount_kobo"),
    /** Paystack checkout link we sent the customer. */
    authorizationUrl: text("authorization_url"),
    /** gbam's cut, decided when the payment link was created (see shared/fees.ts). */
    platformFeeKobo: bigint("platform_fee_kobo", { mode: "number" }).notNull().default(0),
    /** Paystack's actual fee, read back from Paystack once paid. null until then. */
    paystackFeeKobo: bigint("paystack_fee_kobo", { mode: "number" }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    /**
     * How the customer is paying: "checkout" = Paystack's pop-up or page (card and the
     * rest); "bank_transfer" / "ussd" = gbam's own pay screens.
     */
    method: text("method").$type<PaymentMethod>().notNull().default("checkout"),
    /**
     * Our own screens: the account or USSD code we showed, so a reload shows the same one.
     * (Paystack's one-off account details, never the customer's own bank account.)
     */
    instructions: jsonb("instructions").$type<PaymentInstructions>(),
    /** When the transfer account or USSD code stops working. null for checkout links. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    raw: jsonb("raw"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

/** Every WhatsApp message we try to send, and what happened to it. */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: id(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    /** Meta's id for the message ("wamid..."). null if Meta rejected the send outright. */
    wamid: text("wamid").unique(),
    template: text("template").notNull(),
    toPhone: text("to_phone").notNull(),
    status: whatsappStatusEnum("status").notNull(),
    errorCode: integer("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("whatsapp_messages_order_idx").on(t.orderId)],
);

/** Append-only audit trail of every status change. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    actor: orderActorEnum("actor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

/**
 * How far a seller got in each guided tour. One row per seller per tour.
 * `outcome` stays null while the tour is in progress; once it is set (completed or
 * skipped) the API never changes it again, so the tour never shows by itself again.
 */
export const sellerTours = pgTable(
  "seller_tours",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    tour: tourNameEnum("tour").notNull(),
    currentStep: integer("current_step").notNull().default(1),
    outcome: tourOutcomeEnum("outcome"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("seller_tours_seller_tour_idx").on(t.sellerId, t.tour)],
);

/** A problem a customer reported from their tracking page. The seller marks it resolved. */
export const orderIssues = pgTable(
  "order_issues",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    reason: issueReasonEnum("reason").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("order_issues_order_idx").on(t.orderId)],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  emailCodes: many(emailCodes),
  seller: one(sellers, { fields: [users.id], references: [sellers.ownerUserId] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const emailCodesRelations = relations(emailCodes, ({ one }) => ({
  user: one(users, { fields: [emailCodes.userId], references: [users.id] }),
}));

export const sellersRelations = relations(sellers, ({ one, many }) => ({
  owner: one(users, { fields: [sellers.ownerUserId], references: [users.id] }),
  deliveryZones: many(deliveryZones),
  customers: many(customers),
  products: many(products),
  orders: many(orders),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  seller: one(sellers, { fields: [customers.sellerId], references: [sellers.id] }),
  orders: many(orders),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(sellers, { fields: [products.sellerId], references: [sellers.id] }),
  options: many(productOptions),
  images: many(productImages),
  variants: many(productVariants),
}));

export const orderIssuesRelations = relations(orderIssues, ({ one }) => ({
  order: one(orders, { fields: [orderIssues.orderId], references: [orders.id] }),
}));

export const productOptionsRelations = relations(productOptions, ({ one }) => ({
  product: one(products, { fields: [productOptions.productId], references: [products.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  seller: one(sellers, { fields: [productImages.sellerId], references: [sellers.id] }),
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  image: one(productImages, { fields: [productVariants.imageId], references: [productImages.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  seller: one(sellers, { fields: [orders.sellerId], references: [sellers.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  payments: many(payments),
  events: many(orderEvents),
  whatsappMessages: many(whatsappMessages),
  issues: many(orderIssues),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  order: one(orders, { fields: [whatsappMessages.orderId], references: [orders.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

// ---- Admin area (see docs/superpowers/specs/2026-10-08-admin-design.md) ----

/** A named set of permissions (e.g. "Support"). Each admin has one role. */
export const adminRoles = pgTable("admin_roles", {
  id: id(),
  name: text("name").notNull().unique(),
  /** Names from ADMIN_PERMISSIONS in packages/shared/src/admin.ts. */
  permissions: text("permissions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Set when deleted: kept 30 days so it can be restored. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A Gbam staff account. Completely separate from seller accounts (users). */
export const adminUsers = pgTable("admin_users", {
  id: id(),
  /** Stored lowercase. */
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** The authenticator app's secret, encrypted with ADMIN_TOTP_KEY. */
  totpSecretEnc: text("totp_secret_enc").notNull(),
  /** The last 30-second step a code was accepted for, so a code can't be used twice. */
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  roleId: uuid("role_id").references(() => adminRoles.id),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** Set when removed: they can't sign in, but the audit log still names them. */
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** An emailed invitation to become an admin. Single use, expires after 48 hours. */
export const adminInvites = pgTable("admin_invites", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  roleId: uuid("role_id").references(() => adminRoles.id),
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  tokenHash: text("token_hash").notNull().unique(),
  /** Made when the invite page is first opened, so the QR code stays the same on reload. */
  totpSecretEnc: text("totp_secret_enc"),
  invitedBy: uuid("invited_by").references(() => adminUsers.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** A signed-in admin. Only a hash of the token is stored. Ends 12 hours after sign-in. */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: id(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_sessions_admin_idx").on(t.adminId)],
);

/** One-time codes for when an admin loses their phone. Only hashes are stored. */
export const adminBackupCodes = pgTable(
  "admin_backup_codes",
  {
    id: id(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("admin_backup_codes_admin_idx").on(t.adminId)],
);

/**
 * Every admin action, newest last. Append-only: nothing in the app updates or deletes these
 * rows, so it can be trusted to say who did what.
 */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: id(),
    adminId: uuid("admin_id").references(() => adminUsers.id),
    /** e.g. "shop.suspend", "admin.sign_in". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    note: text("note"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    /** Shared by every entry from one bulk action. */
    batchId: uuid("batch_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_audit_created_idx").on(t.createdAt),
    index("admin_audit_admin_idx").on(t.adminId),
    index("admin_audit_target_idx").on(t.targetType, t.targetId),
  ],
);

/** A customer paid money that has to go back (order already cancelled, or stock ran out). */
export const refundCases = pgTable("refund_cases", {
  id: id(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** One case per payment: a repeated webhook adds nothing. */
  paymentReference: text("payment_reference").unique(),
  reason: text("reason").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => adminUsers.id),
});

export const adminUsersRelations = relations(adminUsers, ({ one }) => ({
  role: one(adminRoles, { fields: [adminUsers.roleId], references: [adminRoles.id] }),
}));

/**
 * Admin → Settings: one row per key ("settings", "maintenance"), the value as JSON checked
 * by the schemas in packages/shared/src/platform-settings.ts. No row = the defaults apply.
 */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => adminUsers.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Storefront visits per Lagos day, per shop (null = pages not tied to a shop) and kind of page
 * ("storefront", "product", "checkout"). Counted in Redis from the page beacon and copied here
 * every 15 minutes, so history survives Redis. No visitor details are stored, only counts.
 */
export const dailyVisits = pgTable(
  "daily_visits",
  {
    id: id(),
    day: date("day", { mode: "string" }).notNull(),
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    visits: integer("visits").notNull().default(0),
  },
  // One row per day, shop and kind. "Nulls not distinct" makes rows with no shop count as
  // the same shop, so they can't be duplicated either.
  (t) => [
    unique("daily_visits_day_seller_kind_uq").on(t.day, t.sellerId, t.kind).nullsNotDistinct(),
  ],
);

export const ticketStatusEnum = pgEnum("ticket_status", TICKET_STATUSES);
export const ticketPriorityEnum = pgEnum("ticket_priority", TICKET_PRIORITIES);
export const ticketSourceEnum = pgEnum("ticket_source", TICKET_SOURCES);
export const ticketAuthorEnum = pgEnum("ticket_author", ["requester", "admin", "system"]);

/**
 * A request for help: from the contact form, a seller's "Get help", or a customer problem a
 * seller asked Gbam to look at. The conversation is in ticket_messages.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    /** A short number people can say out loud: ticket #1042. Counts up by itself. */
    number: serial("number").notNull().unique(),
    subject: text("subject").notNull(),
    source: ticketSourceEnum("source").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("normal"),
    /** Who asked. For seller tickets, the shop owner's name and email at the time. */
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderIssueId: uuid("order_issue_id").references(() => orderIssues.id, {
      onDelete: "set null",
    }),
    contactMessageId: uuid("contact_message_id").references(() => contactMessages.id, {
      onDelete: "set null",
    }),
    assigneeId: uuid("assignee_id").references(() => adminUsers.id, { onDelete: "set null" }),
    /**
     * Contact-form tickets only: the secret key in the requester's private link
     * (/help/tickets/…?k=…). Long and random, like order tracking keys.
     */
    accessKey: text("access_key").unique(),
    /** Set when it becomes solved; a solved ticket with no reply for 7 days is closed. */
    solvedAt: timestamp("solved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** In the bin (restorable for 30 days). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("support_tickets_status_idx").on(t.status),
    index("support_tickets_seller_idx").on(t.sellerId),
    // One ticket per escalated customer problem.
    uniqueIndex("support_tickets_order_issue_uq").on(t.orderIssueId),
  ],
);

/** One message in a ticket. `internal` ones are admin notes the requester never sees. */
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    author: ticketAuthorEnum("author").notNull(),
    adminId: uuid("admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId)],
);

export const announcementStatusEnum = pgEnum("announcement_status", ANNOUNCEMENT_STATUSES);
export const recipientStatusEnum = pgEnum("recipient_status", ["queued", "sent", "failed"]);
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);
/** Bell only, or also a banner or a modal in the dashboard (see NOTIFICATION_DISPLAYS). */
export const notificationDisplayEnum = pgEnum("notification_display", NOTIFICATION_DISPLAYS);

/** An email to sellers ("news and tips"), written by an admin. */
export const announcements = pgTable("announcements", {
  id: id(),
  subject: text("subject").notNull(),
  /** Simple formatting: paragraphs, **bold**, [links](https://…) and "- " lists. */
  body: text("body").notNull(),
  buttonLabel: text("button_label"),
  buttonUrl: text("button_url"),
  /** Who it goes to (see audienceSchema in @gbam/shared). Worked out again when it's sent. */
  audience: jsonb("audience").notNull(),
  status: announcementStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  /** In the bin (restorable for 30 days). */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * One row per seller an announcement goes to. The row exists before the email is sent, so a
 * send that's interrupted and run again skips everyone already marked "sent".
 */
export const announcementRecipients = pgTable(
  "announcement_recipients",
  {
    id: id(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: recipientStatusEnum("status").notNull().default("queued"),
    /** Why it failed (the provider's message), for the admin page. */
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    unique("announcement_recipients_uq").on(t.announcementId, t.sellerId),
    index("announcement_recipients_status_idx").on(t.announcementId, t.status),
  ],
);

/** A notification an admin sent to many sellers at once (each gets a seller_notifications row). */
export const notificationCampaigns = pgTable("notification_campaigns", {
  id: id(),
  type: notificationTypeEnum("type").notNull(),
  display: notificationDisplayEnum("display").notNull().default("bell"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  audience: jsonb("audience").notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  /** In the bin: its notifications stop showing; restorable for 30 days. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** One notification in one seller's bell. From an admin campaign, or made by Gbam itself. */
export const sellerNotifications = pgTable(
  "seller_notifications",
  {
    id: id(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    /** null = made by Gbam itself (e.g. "Gbam replied to your request"). */
    campaignId: uuid("campaign_id").references(() => notificationCampaigns.id, {
      onDelete: "cascade",
    }),
    type: notificationTypeEnum("type").notNull(),
    display: notificationDisplayEnum("display").notNull().default("bell"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** The seller tapped "Got it" / "I understand": no banner or modal again. */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    /** The seller tapped "Hide" on the banner: it stays away until this time (a day later). */
    hiddenUntil: timestamp("hidden_until", { withTimezone: true }),
    /** In the seller's trash: out of the bell, restorable, deleted for good after 30 days. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("seller_notifications_seller_idx").on(t.sellerId, t.createdAt)],
);

/**
 * A shop's earlier links (slugs). Links already shared on WhatsApp statuses keep working:
 * they redirect to the shop's current link, and no other shop can ever take them.
 */
export const shopSlugHistory = pgTable("shop_slug_history", {
  id: id(),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => sellers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});
