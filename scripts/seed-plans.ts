/**
 * Seed database with subscription plans
 * Run with: npx tsx scripts/seed-plans.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { plans } from "../src/db/schema.js";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const seedPlans = [
    {
      name: "Weekly",
      durationDays: 7,
      priceStars: 50,
      priceTon: "1.00",
      trafficLimitGb: 50,
      maxDevices: 2,
    },
    {
      name: "Monthly",
      durationDays: 30,
      priceStars: 150,
      priceTon: "3.00",
      trafficLimitGb: null, // unlimited
      maxDevices: 3,
    },
    {
      name: "Quarterly",
      durationDays: 90,
      priceStars: 400,
      priceTon: "8.00",
      trafficLimitGb: null,
      maxDevices: 5,
    },
  ];

  console.log("Seeding plans...");

  for (const plan of seedPlans) {
    const [inserted] = await db.insert(plans).values(plan).returning();
    console.log(`  ✓ ${inserted.name} (${inserted.priceStars} Stars)`);
  }

  console.log("\nDone! Plans added to database.");
}

main().catch(console.error);
