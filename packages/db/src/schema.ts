import { ORDER_STATUSES } from "@gbam/shared";
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The enum values come from @gbam/shared, so the DB and the state machine can't drift.
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const orderActorEnum = pgEnum("order_actor", ["seller", "system"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "success", "failed"]);
/** accepted = Meta took our request; the rest come from the WhatsApp webhook. */
export const whatsappStatusEnum = pgEnum("whatsapp_status", [
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
    description: text("description"),
    priceKobo: kobo("price_kobo"),
    /** null = untracked stock. */
    stock: integer("stock"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_seller_idx").on(t.sellerId)],
);

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
    totalKobo: kobo("total_kobo"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_seller_code_uq").on(t.sellerId, t.code),
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
    // Snapshot at order time so later product edits don't rewrite history.
    productName: text("product_name").notNull(),
    unitPriceKobo: kobo("unit_price_kobo"),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

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

export const sellersRelations = relations(sellers, ({ many }) => ({
  customers: many(customers),
  products: many(products),
  orders: many(orders),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  seller: one(sellers, { fields: [customers.sellerId], references: [sellers.id] }),
  orders: many(orders),
}));

export const productsRelations = relations(products, ({ one }) => ({
  seller: one(sellers, { fields: [products.sellerId], references: [sellers.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  seller: one(sellers, { fields: [orders.sellerId], references: [sellers.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  payments: many(payments),
  events: many(orderEvents),
  whatsappMessages: many(whatsappMessages),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
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
