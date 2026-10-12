/**
 * Prints the pilot's numbers, one row per shop, for the day-30 decision:
 *
 *   pnpm pilot:report              (the last 30 days)
 *   pnpm pilot:report 2026-10-27   (since the pilot started)
 *
 * On the server (e.g. a Railway shell for the API service): node dist/scripts/pilot-report.js
 * Read-only: it changes nothing.
 */
import "reflect-metadata";
import { formatNaira } from "@gbam/shared";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { pilotReport } from "../reports/pilot-report.js";

@Module({ imports: [InfraModule] })
class ScriptModule {}

const DAY_MS = 24 * 60 * 60 * 1000;

let since = new Date(Date.now() - 30 * DAY_MS);
const dateArgument = process.argv[2];
if (dateArgument) {
  since = new Date(`${dateArgument}T00:00:00+01:00`); // midnight in Lagos
  if (Number.isNaN(since.getTime())) {
    console.error("Usage: pilot-report [YYYY-MM-DD]");
    process.exit(1);
  }
}

const app = await NestFactory.createApplicationContext(ScriptModule, { logger: ["error"] });
try {
  const report = await pilotReport(app.get<Db>(DB), since);

  console.log(`Pilot report since ${since.toISOString().slice(0, 10)}\n`);
  const table = [];
  for (const shop of report.shops) {
    let minutesToPay = "-";
    if (shop.medianMinutesToPay !== null) {
      minutesToPay = String(shop.medianMinutesToPay);
    }
    table.push({
      shop: shop.slug,
      from: shop.signupSource ?? "-",
      visits: shop.shopVisits,
      placed: shop.ordersPlaced,
      "asked to pay": shop.paymentRequested,
      paid: shop.ordersPaid,
      "paid %": shop.paidPercent,
      "minutes to pay": minutesToPay,
      "repeat buyers": shop.repeatCustomers,
      "gbam fee": formatNaira(shop.gbamFeeKobo),
    });
  }
  console.table(table);
  console.log(
    `\nShops with 2+ paid orders: ${report.shopsWithRepeatPaidOrders} of ${report.shops.length}` +
      " (the pilot goal: 5 of 10).",
  );
} finally {
  await app.close();
}
