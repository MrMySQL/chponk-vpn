import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const result = await sql("SELECT id, name, is_active FROM plans");
  console.log("Plans in database:");
  console.log(result);
}

main().catch(console.error);
