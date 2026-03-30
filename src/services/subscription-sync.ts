/**
 * Subscription Sync Service
 *
 * Syncs subscription changes (expiry, limits) to 3x-ui servers.
 * Designed to run in the background via Vercel's waitUntil.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { userConnections, plans } from "../db/schema.js";
import { getXuiClientForServer } from "./xui/repository.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger({ service: "subscription-sync" });

export interface SyncExpiryParams {
  subscriptionId: number;
  clientUuid: string;
  planId: number;
  newExpiresAt: Date;
}

export async function syncSubscriptionToServers(
  params: SyncExpiryParams
): Promise<void> {
  const { subscriptionId, clientUuid, planId, newExpiresAt } = params;

  const [connections, plan] = await Promise.all([
    db.query.userConnections.findMany({
      where: eq(userConnections.subscriptionId, subscriptionId),
    }),
    db.query.plans.findFirst({
      where: eq(plans.id, planId),
    }),
  ]);

  if (connections.length === 0) {
    log.info("No connections to sync", { subscriptionId });
    return;
  }

  const results = await Promise.allSettled(
    connections.map(async (connection) => {
      const xuiClient = await getXuiClientForServer(connection.serverId);
      await xuiClient.updateClient(clientUuid, {
        expiryTime: newExpiresAt.getTime(),
        ...(plan && {
          totalGB: plan.trafficLimitGb ?? 0,
          limitIp: plan.maxDevices,
        }),
      });
      return connection.serverId;
    })
  );

  const syncedServers = results.filter((r) => r.status === "fulfilled").length;
  const failedServers = results.filter((r) => r.status === "rejected").length;

  for (const result of results) {
    if (result.status === "rejected") {
      log.error("Failed to sync to 3x-ui server", {
        subscriptionId,
        clientUuid,
      }, result.reason);
    }
  }

  log.info("Subscription synced to servers", {
    subscriptionId,
    newExpiresAt: newExpiresAt.toISOString(),
    syncedServers,
    failedServers,
    totalConnections: connections.length,
  });
}
