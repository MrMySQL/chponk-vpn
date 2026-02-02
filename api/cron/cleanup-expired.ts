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

  // Verify cron secret - required for both Vercel cron and manual requests
  // Vercel cron automatically sends Authorization header when CRON_SECRET is set
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return;
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
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
