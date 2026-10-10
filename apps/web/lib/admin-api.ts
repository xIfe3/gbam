import "server-only";
import type {
  AdminPermission,
  Maintenance,
  OrderStatus,
  PlatformSettings,
  TicketBulkInput,
  TicketPriority,
  TicketSource,
  TicketStatus,
  TicketUpdateInput,
  AnnouncementStatus,
  Audience,
  ContentDraft,
  ContentStatus,
  NotificationType,
} from "@gbam/shared";
import { redirect } from "next/navigation";
import type { ActiveCounts } from "@/components/admin/active-now";
import type { ReportRange } from "@/components/admin/range";
import { getAdminToken } from "./admin-session";
import { ApiError, apiUrl, visitorIp, type OrderDetail, type OrderDelivery } from "./api";

/**
 * Talks to the API's /admin endpoints, server-side only, sending the admin's token in the
 * `x-admin-token` header. Errors are the same ApiError as lib/api.ts, so the shared form
 * helpers (failureMessage, apiFieldError) work here too.
 */

type AdminRequestOptions = {
  method?: string;
  body?: unknown;
  /** false for the sign-in and invite calls, which happen before there's a session. */
  signedIn?: boolean;
};

async function adminRequest<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const headers = new Headers();
  let body: string | FormData | undefined = undefined;
  if (options.body instanceof FormData) {
    // A file upload: fetch sets the multipart content-type (with its boundary) itself.
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  const signedIn = options.signedIn !== false;
  if (signedIn) {
    const token = await getAdminToken();
    if (!token) {
      redirect("/admin/login");
    }
    headers.set("x-admin-token", token);
  }
  // Lets the API rate-limit by the visitor's IP (see lib/api.ts).
  const ip = await visitorIp();
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (ip && internalSecret) {
    headers.set("x-client-ip", ip);
    headers.set("x-internal-secret", internalSecret);
  }

  const res = await fetch(`${apiUrl()}${path}`, {
    method: options.method,
    body,
    headers,
    cache: "no-store",
  });
  let json: unknown = null;
  if (res.status !== 204) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }
  // Session ended (expired, signed out elsewhere, or removed): back to sign-in.
  if (res.status === 401 && signedIn) {
    redirect("/admin/login");
  }
  // Loading a page their role doesn't allow (e.g. an old bookmark): back to the overview,
  // which explains. A refused change (POST, PATCH...) is left to the form to show instead.
  const isPageLoad = options.method === undefined || options.method === "GET";
  if (res.status === 403 && signedIn && isPageLoad) {
    redirect("/admin?denied=1");
  }
  if (!res.ok) {
    throw new ApiError(res.status, json);
  }
  return json as T;
}

/** Builds "?a=1&b=2" from the values that are set. */
function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  if (text === "") {
    return "";
  }
  return `?${text}`;
}

/** "?bin=1" to list deleted roles (the bin) instead of live ones. */
function binQuery(bin: boolean): string {
  if (bin) {
    return "?bin=1";
  }
  return "";
}

// ---- Shapes ----

export type AdminMe = {
  id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
  role: { id: string; name: string } | null;
  permissions: AdminPermission[];
};

export type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number };
export type BulkResult = { done: string[]; skipped: { id: string; why: string }[] };

export type ShopStatus = "active" | "suspended" | "closed";
export type AdminShopRow = {
  id: string;
  slug: string;
  businessName: string;
  ownerEmail: string | null;
  status: ShopStatus;
  hasBank: boolean;
  productCount: number;
  createdAt: string;
};
export type AdminShopDetail = {
  shop: {
    id: string;
    slug: string;
    businessName: string;
    whatsappPhone: string;
    status: ShopStatus;
    suspendedAt: string | null;
    suspendedReason: string | null;
    closedAt: string | null;
    feeWaivedUntil: string | null;
    createdAt: string;
    productCount: number;
  };
  owner: {
    id: string;
    email: string;
    emailVerified: boolean;
    lockedUntil: string | null;
    createdAt: string;
  } | null;
  payoutAccount: { bankName: string; accountLast4: string; bankAccountName: string | null } | null;
  recentOrders: {
    id: string;
    code: string;
    status: OrderStatus;
    totalKobo: number;
    createdAt: string;
  }[];
};

export type AdminOrderRow = {
  id: string;
  code: string;
  status: OrderStatus;
  totalKobo: number;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  shopId: string;
  shopName: string;
  openIssues: number;
};
export type AdminOrderDetail = {
  order: OrderDetail & OrderDelivery;
  shop: { id: string; slug: string; businessName: string };
};
export type RefundCase = {
  id: string;
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatus;
  shopName: string;
  paymentReference: string | null;
  reason: string;
  amountKobo: number;
  createdAt: string;
  resolvedAt: string | null;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "new" | "handled";
  handledNote: string | null;
  handledAt: string | null;
  createdAt: string;
};
export type ProblemReport = {
  id: string;
  reason: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  orderId: string;
  orderCode: string;
  shopName: string;
};

export type AuditRow = {
  id: string;
  adminId: string | null;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  note: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  batchId: string | null;
  createdAt: string;
};

export type TeamAdmin = {
  id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
  roleId: string | null;
  roleName: string | null;
  lockedUntil: string | null;
  removedAt: string | null;
  createdAt: string;
};
export type TeamInvite = {
  id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
  roleId: string | null;
  expiresAt: string;
  createdAt: string;
};
export type AdminRole = {
  id: string;
  name: string;
  permissions: AdminPermission[];
  deletedAt: string | null;
  adminCount: number;
};
export type AdminSessionRow = {
  id: string;
  adminId: string;
  adminName: string;
  roleName: string | null;
  isSuperadmin: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  isCurrent: boolean;
};
export type SellerSessionRow = {
  id: string;
  shopName: string;
  slug: string;
  email: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type MoneyOverview = {
  totals: {
    salesKobo: number;
    itemsKobo: number;
    deliveryKobo: number;
    gbamFeesKobo: number;
    paystackFeesKobo: number;
    refundsKobo: number;
    paidOrders: number;
  };
  byDay: { day: string; salesKobo: number; paidOrders: number }[];
  byShop: {
    shopId: string;
    shopName: string;
    salesKobo: number;
    paidOrders: number;
    gbamFeesKobo: number;
  }[];
};
export type AnalyticsOverview = {
  funnel: {
    week: string;
    signedUp: number;
    verified: number;
    firstProduct: number;
    bankAccount: number;
    firstPaidOrder: number;
  }[];
  activeShops: { last7: number; last30: number };
  orders: {
    placed: number;
    paid: number;
    expired: number;
    cancelled: number;
    paidRate: number;
    averageOrderKobo: number;
  };
  topShops: { shopId: string; shopName: string; paidOrders: number }[];
  visits: { day: string; storefront: number; product: number; checkout: number }[];
  visitFunnel: { visits: number; orders: number; paid: number };
};

export type SystemOverview = {
  status: {
    database: { ok: boolean; ms: number };
    redis: { ok: boolean; ms: number };
    worker: { state: "ok" | "late" | "missing"; lastBeatAt: string | null };
  };
  /** counts is null when Redis couldn't be reached. */
  queues: {
    name: string;
    counts: { waiting: number; active: number; failed: number; delayed: number } | null;
  }[];
  errors:
    | { state: "not_configured" }
    | { state: "unavailable" }
    | {
        state: "ok";
        issues: {
          id: string;
          title: string;
          culprit: string;
          count: number;
          lastSeen: string;
          link: string;
        }[];
      };
  uptime:
    | { state: "not_configured" }
    | { state: "unavailable" }
    | {
        state: "ok";
        monitors: {
          name: string;
          status: "up" | "down" | "paused" | "unknown";
          uptime30d: number | null;
        }[];
      };
};
/** A failed background job. Never its data (that can hold codes and emails). */
export type FailedJob = {
  id: string;
  name: string;
  error: string;
  attempts: number;
  failedAt: string;
};

export type AdminTicketRow = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  requesterName: string;
  shopName: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AdminTicketDetail = {
  ticket: {
    id: string;
    number: number;
    subject: string;
    source: TicketSource;
    status: TicketStatus;
    priority: TicketPriority;
    requesterName: string;
    requesterEmail: string;
    assigneeId: string | null;
    deletedAt: string | null;
    createdAt: string;
  };
  shop: { id: string; slug: string; businessName: string } | null;
  order: { id: string; code: string } | null;
  assigneeName: string | null;
  messages: {
    id: string;
    author: "requester" | "admin" | "system";
    adminName: string | null;
    body: string;
    internal: boolean;
    createdAt: string;
  }[];
};

export type AnnouncementRow = {
  id: string;
  subject: string;
  status: AnnouncementStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};
export type AnnouncementDetail = {
  announcement: {
    id: string;
    subject: string;
    body: string;
    buttonLabel: string | null;
    buttonUrl: string | null;
    audience: Audience;
    status: AnnouncementStatus;
    scheduledAt: string | null;
    sentAt: string | null;
    deletedAt: string | null;
    createdAt: string;
  };
  counts: { queued: number; sent: number; failed: number };
  /** How many sellers it would go to right now. */
  audienceCount: number;
};
export type AnnouncementBody = {
  subject: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  audience: Audience;
};
export type NotificationCampaign = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  endsAt: string | null;
  recipientCount: number;
  readCount: number;
  createdAt: string;
};
export type NotificationBody = {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  endsAt?: string;
  audience: Audience;
  confirmCount: number;
};

export type ContentRow = {
  id: string;
  type: string;
  slug: string;
  title: string;
  category: string | null;
  status: ContentStatus;
  /** Saved changes that aren't published yet. */
  hasDraft: boolean;
  updatedAt: string;
};
export type ContentEntryDetail = {
  entry: ContentDraft & {
    id: string;
    type: string;
    slug: string;
    publishedAt: string | null;
    deletedAt: string | null;
    status: ContentStatus;
    draft: ContentDraft | null;
  };
  versions: { id: string; version: number; createdAt: string; publishedByName: string | null }[];
};
export type ContentVersion = ContentDraft & { id: string; version: number; createdAt: string };

// ---- Calls ----

export const adminApi = {
  // Sign-in and invites (before there's a session)
  login: (body: { email: string; password: string }) =>
    adminRequest<{ challengeToken: string }>("/admin/auth/login", {
      method: "POST",
      body,
      signedIn: false,
    }),
  verify: (body: { challengeToken: string; code: string }) =>
    adminRequest<{ sessionToken: string }>("/admin/auth/verify", {
      method: "POST",
      body,
      signedIn: false,
    }),
  viewInvite: (token: string) =>
    adminRequest<{ email: string; name: string; secret: string; otpauthUrl: string }>(
      `/admin/invites/${encodeURIComponent(token)}`,
      { signedIn: false },
    ),
  acceptInvite: (token: string, body: { password: string; code: string }) =>
    adminRequest<{ sessionToken: string; backupCodes: string[] }>(
      `/admin/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST", body, signedIn: false },
    ),

  // Signed in
  me: () => adminRequest<AdminMe>("/admin/me"),
  logout: () => adminRequest<{ ok: true }>("/admin/auth/logout", { method: "POST" }),

  shops: (query: Record<string, string | number | undefined>) =>
    adminRequest<Paged<AdminShopRow>>(`/admin/shops${queryString(query)}`),
  shop: (id: string) => adminRequest<AdminShopDetail>(`/admin/shops/${id}`),
  suspendShop: (id: string, reason: string) =>
    adminRequest(`/admin/shops/${id}/suspend`, { method: "POST", body: { reason } }),
  reopenShop: (id: string, reason: string) =>
    adminRequest(`/admin/shops/${id}/reopen`, { method: "POST", body: { reason } }),
  bulkShops: (action: "suspend" | "reopen", ids: string[], note: string) =>
    adminRequest<BulkResult>(`/admin/shops/bulk/${action}`, {
      method: "POST",
      body: { ids, note },
    }),
  unlockSeller: (id: string) =>
    adminRequest(`/admin/shops/${id}/unlock-seller`, { method: "POST" }),
  resendVerification: (id: string) =>
    adminRequest(`/admin/shops/${id}/resend-verification`, { method: "POST" }),
  setFeeWaiver: (id: string, until: string | null) =>
    adminRequest(`/admin/shops/${id}/fee-waiver`, { method: "PUT", body: { until } }),

  orders: (query: Record<string, string | number | undefined>) =>
    adminRequest<Paged<AdminOrderRow>>(`/admin/orders${queryString(query)}`),
  order: (id: string) => adminRequest<AdminOrderDetail>(`/admin/orders/${id}`),
  refunds: (status: "open" | "resolved") =>
    adminRequest<RefundCase[]>(`/admin/refunds${queryString({ status })}`),
  resolveRefund: (id: string, reason: string) =>
    adminRequest(`/admin/refunds/${id}/resolve`, { method: "POST", body: { reason } }),

  messages: (status: "new" | "handled", q?: string) =>
    adminRequest<ContactMessage[]>(`/admin/support/messages${queryString({ status, q })}`),
  issues: (status: "open" | "resolved") =>
    adminRequest<ProblemReport[]>(`/admin/support/issues${queryString({ status })}`),
  handleMessage: (id: string, reason: string) =>
    adminRequest(`/admin/support/messages/${id}/handle`, { method: "POST", body: { reason } }),
  bulkHandleMessages: (ids: string[], note: string) =>
    adminRequest<BulkResult>("/admin/support/messages/bulk/handle", {
      method: "POST",
      body: { ids, note },
    }),
  resolveIssue: (id: string, reason: string) =>
    adminRequest(`/admin/support/issues/${id}/resolve`, { method: "POST", body: { reason } }),

  audit: (query: Record<string, string | number | undefined>) =>
    adminRequest<Paged<AuditRow>>(`/admin/audit${queryString(query)}`),

  team: () => adminRequest<{ admins: TeamAdmin[]; invites: TeamInvite[] }>("/admin/team"),
  inviteAdmin: (body: {
    name: string;
    email: string;
    roleId: string | null;
    isSuperadmin: boolean;
  }) => adminRequest("/admin/team", { method: "POST", body }),
  updateAdmin: (id: string, body: { roleId: string | null; isSuperadmin: boolean }) =>
    adminRequest(`/admin/team/${id}`, { method: "PATCH", body }),
  resetAuthenticator: (id: string) =>
    adminRequest(`/admin/team/${id}/reset-authenticator`, { method: "POST" }),
  removeAdmin: (id: string) => adminRequest(`/admin/team/${id}/remove`, { method: "POST" }),

  roles: (bin: boolean) => adminRequest<AdminRole[]>(`/admin/roles${binQuery(bin)}`),
  createRole: (body: { name: string; permissions: AdminPermission[] }) =>
    adminRequest("/admin/roles", { method: "POST", body }),
  updateRole: (id: string, body: { name: string; permissions: AdminPermission[] }) =>
    adminRequest(`/admin/roles/${id}`, { method: "PATCH", body }),
  deleteRole: (id: string) => adminRequest(`/admin/roles/${id}`, { method: "DELETE" }),
  restoreRole: (id: string) => adminRequest(`/admin/roles/${id}/restore`, { method: "POST" }),

  settings: () =>
    adminRequest<{ settings: PlatformSettings; maintenance: Maintenance }>("/admin/settings"),
  saveSettings: (body: PlatformSettings) =>
    adminRequest("/admin/settings", { method: "PATCH", body }),
  setMaintenance: (body: Maintenance) =>
    adminRequest("/admin/maintenance", { method: "PUT", body }),

  adminSessions: () => adminRequest<AdminSessionRow[]>("/admin/sessions/admins"),
  sellerSessions: (q?: string) =>
    adminRequest<SellerSessionRow[]>(`/admin/sessions/sellers${queryString({ q })}`),
  endAdminSession: (id: string) =>
    adminRequest(`/admin/sessions/admins/${id}/end`, { method: "POST" }),
  endAllAdminSessions: (adminId: string) =>
    adminRequest(`/admin/sessions/admins/by-admin/${adminId}/end-all`, { method: "POST" }),
  endSellerSession: (id: string, reason: string) =>
    adminRequest(`/admin/sessions/sellers/${id}/end`, { method: "POST", body: { reason } }),

  money: (range: ReportRange) => adminRequest<MoneyOverview>(`/admin/money${queryString(range)}`),
  analytics: (range: ReportRange) =>
    adminRequest<AnalyticsOverview>(`/admin/analytics${queryString(range)}`),
  active: () => adminRequest<ActiveCounts>("/admin/active"),

  tickets: (query: Record<string, string | number | undefined>) =>
    adminRequest<Paged<AdminTicketRow>>(`/admin/tickets${queryString(query)}`),
  ticket: (id: string) => adminRequest<AdminTicketDetail>(`/admin/tickets/${id}`),
  ticketAssignees: () => adminRequest<{ id: string; name: string }[]>("/admin/tickets/assignees"),
  replyTicket: (id: string, message: string) =>
    adminRequest(`/admin/tickets/${id}/reply`, { method: "POST", body: { message } }),
  noteTicket: (id: string, message: string) =>
    adminRequest(`/admin/tickets/${id}/notes`, { method: "POST", body: { message } }),
  updateTicket: (id: string, body: TicketUpdateInput) =>
    adminRequest(`/admin/tickets/${id}`, { method: "PATCH", body }),
  deleteTicket: (id: string, reason: string) =>
    adminRequest(`/admin/tickets/${id}/delete`, { method: "POST", body: { reason } }),
  restoreTicket: (id: string) => adminRequest(`/admin/tickets/${id}/restore`, { method: "POST" }),
  bulkTickets: (body: TicketBulkInput) =>
    adminRequest<BulkResult>("/admin/tickets/bulk", { method: "POST", body }),

  announcements: (bin: boolean) =>
    adminRequest<AnnouncementRow[]>(`/admin/announcements${binQuery(bin)}`),
  announcement: (id: string) => adminRequest<AnnouncementDetail>(`/admin/announcements/${id}`),
  previewAnnouncement: (body: AnnouncementBody) =>
    adminRequest<{ subject: string; html: string; recipients: number }>(
      "/admin/announcements/preview",
      { method: "POST", body },
    ),
  createAnnouncement: (body: AnnouncementBody) =>
    adminRequest<{ id: string }>("/admin/announcements", { method: "POST", body }),
  updateAnnouncement: (id: string, body: AnnouncementBody) =>
    adminRequest(`/admin/announcements/${id}`, { method: "PATCH", body }),
  testAnnouncement: (id: string) =>
    adminRequest(`/admin/announcements/${id}/test`, { method: "POST" }),
  sendAnnouncement: (id: string, body: { confirmCount: number; scheduledAt?: string }) =>
    adminRequest<{ ok: true; recipients: number }>(`/admin/announcements/${id}/send`, {
      method: "POST",
      body,
    }),
  cancelAnnouncement: (id: string) =>
    adminRequest(`/admin/announcements/${id}/cancel`, { method: "POST" }),
  deleteAnnouncement: (id: string) =>
    adminRequest(`/admin/announcements/${id}/delete`, { method: "POST" }),
  restoreAnnouncement: (id: string) =>
    adminRequest(`/admin/announcements/${id}/restore`, { method: "POST" }),

  notifications: (bin: boolean) =>
    adminRequest<NotificationCampaign[]>(`/admin/notifications${binQuery(bin)}`),
  countNotification: (audience: Audience) =>
    adminRequest<{ recipients: number }>("/admin/notifications/count", {
      method: "POST",
      body: { audience },
    }),
  sendNotification: (body: NotificationBody) =>
    adminRequest<{ id: string }>("/admin/notifications", { method: "POST", body }),
  deleteNotification: (id: string) =>
    adminRequest(`/admin/notifications/${id}/delete`, { method: "POST" }),
  restoreNotification: (id: string) =>
    adminRequest(`/admin/notifications/${id}/restore`, { method: "POST" }),

  contentList: (query: Record<string, string | number | undefined>) =>
    adminRequest<ContentRow[]>(`/admin/content${queryString(query)}`),
  contentEntry: (id: string) => adminRequest<ContentEntryDetail>(`/admin/content/${id}`),
  createContent: (body: ContentDraft & { type: string; slug: string }) =>
    adminRequest<{ id: string }>("/admin/content", { method: "POST", body }),
  saveContentDraft: (id: string, body: ContentDraft) =>
    adminRequest(`/admin/content/${id}/draft`, { method: "PATCH", body }),
  publishContent: (id: string, body: { at?: string }) =>
    adminRequest(`/admin/content/${id}/publish`, { method: "POST", body }),
  unpublishContent: (id: string) =>
    adminRequest(`/admin/content/${id}/unpublish`, { method: "POST" }),
  contentVersion: (id: string, versionId: string) =>
    adminRequest<ContentVersion>(`/admin/content/${id}/versions/${versionId}`),
  restoreContentVersion: (id: string, versionId: string) =>
    adminRequest(`/admin/content/${id}/versions/${versionId}/restore`, { method: "POST" }),
  deleteContent: (id: string) => adminRequest(`/admin/content/${id}/delete`, { method: "POST" }),
  restoreContent: (id: string) => adminRequest(`/admin/content/${id}/restore`, { method: "POST" }),
  uploadContentImage: (image: File) => {
    const form = new FormData();
    form.set("image", image);
    return adminRequest<{ url: string }>("/admin/content/images", { method: "POST", body: form });
  },

  system: () => adminRequest<SystemOverview>("/admin/system"),
  failedJobs: (queue: string) =>
    adminRequest<FailedJob[]>(`/admin/system/queues/${encodeURIComponent(queue)}/failed`),
  retryJob: (queue: string, id: string) =>
    adminRequest(
      `/admin/system/queues/${encodeURIComponent(queue)}/jobs/${encodeURIComponent(id)}/retry`,
      { method: "POST" },
    ),
};
