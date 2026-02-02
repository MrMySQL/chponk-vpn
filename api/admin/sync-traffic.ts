import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin, methodNotAllowed } from "./middleware.js";
import { syncTrafficFromAllServers } from "../../src/services/traffic-sync.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    console.log(`Traffic sync triggered by admin ${admin.telegramId}`);
    const result = await syncTrafficFromAllServers();

    console.log("Traffic sync complete:", {
      serversProcessed: result.serversProcessed,
      connectionsUpdated: result.connectionsUpdated,
      totalBytesUp: result.totalBytesUp.toString(),
      totalBytesDown: result.totalBytesDown.toString(),
      errorCount: result.errors.length,
    });

    res.status(200).json({
      success: true,
      data: {
        serversProcessed: result.serversProcessed,
        connectionsUpdated: result.connectionsUpdated,
        totalBytesUp: result.totalBytesUp.toString(),
        totalBytesDown: result.totalBytesDown.toString(),
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("Traffic sync error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
