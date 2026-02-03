import type { VercelRequest, VercelResponse } from "@vercel/node";
import { syncTrafficFromAllServers } from "../../src/services/traffic-sync.js";
import { verifyJWT } from "../../src/lib/jwt.js";
import { createLogger } from "../../src/lib/logger.js";

const log = createLogger({ handler: "cron/sync-traffic" });

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Allow GET (Vercel cron) and POST (admin panel)
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Verify authorization - accept either CRON_SECRET or admin JWT
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  let isAuthorized = false;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Check if it's the cron secret
    if (cronSecret && token === cronSecret) {
      isAuthorized = true;
      log.info("Traffic sync authorized via cron secret");
    } else {
      // Try to verify as admin JWT
      const payload = verifyJWT(token);
      if (payload?.isAdmin) {
        isAuthorized = true;
        log.info("Traffic sync triggered by admin", {
          adminId: payload.sub,
          telegramId: payload.telegramId,
        });
      }
    }
  }

  if (!isAuthorized) {
    log.warn("Unauthorized traffic sync attempt");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    log.info("Starting traffic sync cron job");
    const result = await syncTrafficFromAllServers();

    log.info("Traffic sync cron job completed", {
      serversProcessed: result.serversProcessed,
      connectionsUpdated: result.connectionsUpdated,
      totalBytesUp: result.totalBytesUp.toString(),
      totalBytesDown: result.totalBytesDown.toString(),
      errorCount: result.errors.length,
    });

    res.status(200).json({
      ok: true,
      stats: {
        serversProcessed: result.serversProcessed,
        connectionsUpdated: result.connectionsUpdated,
        totalBytesUp: result.totalBytesUp.toString(),
        totalBytesDown: result.totalBytesDown.toString(),
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    log.error("Traffic sync cron job failed", {}, error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
