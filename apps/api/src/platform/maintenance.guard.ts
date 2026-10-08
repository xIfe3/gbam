import type { Maintenance } from "@gbam/shared";
import {
  Injectable,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";

/** Always allowed, whatever the level: the admin area, payment/WhatsApp webhooks, health checks. */
const ALWAYS_OPEN = ["/admin", "/webhooks", "/health", "/platform/public"];

function startsWithAny(path: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Does maintenance mode refuse this request?
 * - "full": everything except the always-open paths.
 * - "pause": placing orders, paying, seller sign-in/sign-up, and any seller dashboard call
 *   (a request carrying a seller's Authorization header). Shops and tracking stay visible.
 * Webhooks are never refused, so a payment made just before still gets recorded.
 */
export function maintenanceBlocks(
  level: Maintenance["level"],
  method: string,
  url: string,
  hasSellerSession: boolean,
): boolean {
  if (level === "off") {
    return false;
  }
  // "/admin/shops?q=ada" → "/admin/shops"
  const path = url.split("?")[0] ?? url;
  if (startsWithAny(path, ALWAYS_OPEN)) {
    return false;
  }
  if (level === "full") {
    return true;
  }

  // "pause"
  if (hasSellerSession) {
    return true;
  }
  if (startsWithAny(path, ["/auth"])) {
    return true;
  }
  const isPost = method.toUpperCase() === "POST";
  // POST /storefront/{slug}/orders: placing an order.
  if (isPost && /^\/storefront\/[^/]+\/orders$/.test(path)) {
    return true;
  }
  // POST /track/{code}/pay: starting a payment.
  if (isPost && /^\/track\/[^/]+\/pay$/.test(path)) {
    return true;
  }
  return false;
}

/**
 * Runs before every API request (registered as a global guard in AppModule) and answers 503
 * while maintenance mode blocks the request. The level is cached for 10 seconds.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly platform: PlatformSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const maintenance = await this.platform.maintenance();
    const authorization = request.headers.authorization;
    const hasSellerSession = typeof authorization === "string" && authorization !== "";
    if (maintenanceBlocks(maintenance.level, request.method, request.url, hasSellerSession)) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "MAINTENANCE",
        level: maintenance.level,
        message: maintenance.message,
        backBy: maintenance.backBy,
      });
    }
    return true;
  }
}
