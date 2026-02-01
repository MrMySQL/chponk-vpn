import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { plans } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  console.log("Testing drizzle query...");
  const result = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true));

  console.log("Result:", result);
  console.log("Count:", result.length);
}

main().catch(console.error);
