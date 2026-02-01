import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cleanupExpiredSubscriptions } from "../../src/services/subscription-cleanup.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Only allow GET requests (Vercel cron uses GET)
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Verify cron secret for manual testing (Vercel crons are protected by default)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, require it for non-Vercel requests
  // Vercel cron requests don't include custom auth headers
  if (cronSecret && authHeader) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
    console.log("Starting subscription cleanup cron job");
    const result = await cleanupExpiredSubscriptions();

    console.log("Cleanup complete:", result.stats);

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
