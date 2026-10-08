import { platformSettings, type DbTransaction } from "@gbam/db";
import type { Maintenance, PlatformSettings } from "@gbam/shared";
import { Injectable } from "@nestjs/common";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

/** Saving Admin → Settings and maintenance mode, each with its audit entry. */
@Injectable()
export class SettingsAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  async current() {
    return { settings: await this.platform.get(), maintenance: await this.platform.maintenance() };
  }

  async updateSettings(input: PlatformSettings, actor: AdminContext, ip: string) {
    const before = await this.platform.get();
    // One transaction: the new settings and their audit entry are saved together.
    await this.db.transaction(async (tx) => {
      await this.save(tx, "settings", input, actor);
      await this.audit.record(
        {
          adminId: actor.id,
          action: "settings.updated",
          targetType: "settings",
          before,
          after: input,
          ip,
        },
        tx,
      );
    });
    // This process sees the change at once; other processes within 30 seconds.
    this.platform.clearCache();
    return { settings: await this.platform.get() };
  }

  async setMaintenance(input: Maintenance, actor: AdminContext, ip: string) {
    const before = await this.platform.maintenance();
    await this.db.transaction(async (tx) => {
      await this.save(tx, "maintenance", input, actor);
      await this.audit.record(
        {
          adminId: actor.id,
          action: "maintenance.changed",
          targetType: "maintenance",
          before,
          after: input,
          ip,
        },
        tx,
      );
    });
    this.platform.clearCache();
    return { maintenance: await this.platform.maintenance() };
  }

  /** Creates or replaces one settings row ("upsert"). */
  private async save(
    tx: DbTransaction,
    name: "settings" | "maintenance",
    value: unknown,
    actor: AdminContext,
  ) {
    const key = this.platform.keyFor(name);
    const now = new Date();
    await tx
      .insert(platformSettings)
      .values({ key, value, updatedBy: actor.id, updatedAt: now })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedBy: actor.id, updatedAt: now },
      });
  }
}
