/**
 * Traffic synchronization service
 * Syncs traffic data from 3x-ui servers and stores it per-connection
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  userConnections,
  subscriptions,
  servers,
  type UserConnection,
} from "../db/schema.js";
import { getXuiClientForServer } from "./xui/repository.js";

export interface TrafficSyncResult {
  serversProcessed: number;
  connectionsUpdated: number;
  totalBytesUp: bigint;
  totalBytesDown: bigint;
  errors: string[];
}

export interface AggregatedTraffic {
  totalUp: bigint;
  totalDown: bigint;
  total: bigint;
  lastSyncedAt: Date | null;
}

/**
 * Sync traffic data from all 3x-ui servers for all active connections
 */
export async function syncTrafficFromAllServers(): Promise<TrafficSyncResult> {
  const result: TrafficSyncResult = {
    serversProcessed: 0,
    connectionsUpdated: 0,
    totalBytesUp: BigInt(0),
    totalBytesDown: BigInt(0),
    errors: [],
  };

  // Get all active connections with their subscriptions
  const connections = await db
    .select({
      connection: userConnections,
      subscription: subscriptions,
      server: servers,
    })
    .from(userConnections)
    .innerJoin(
      subscriptions,
      eq(userConnections.subscriptionId, subscriptions.id)
    )
    .innerJoin(servers, eq(userConnections.serverId, servers.id))
    .where(
      and(eq(subscriptions.status, "active"), eq(servers.isActive, true))
    );

  // Group connections by server to minimize API calls
  const connectionsByServer = new Map<number, typeof connections>();
  for (const conn of connections) {
    const existing = connectionsByServer.get(conn.server.id) || [];
    existing.push(conn);
    connectionsByServer.set(conn.server.id, existing);
  }

  // Process all servers in parallel
  const serverResults = await Promise.allSettled(
    [...connectionsByServer.entries()].map(
      async ([serverId, serverConnections]) => {
        const partialResult = {
          connectionsUpdated: 0,
          totalBytesUp: BigInt(0),
          totalBytesDown: BigInt(0),
          errors: [] as string[],
        };

        const xuiClient = await getXuiClientForServer(serverId);

        // Fetch all client traffic in one API call
        const trafficMap = await xuiClient.getAllClientTraffic();

        // Update each connection using the cached traffic data
        for (const { connection, subscription } of serverConnections) {
          try {
            const traffic = trafficMap.get(subscription.clientUuid);

            if (traffic) {
              const trafficUp = BigInt(traffic.up);
              const trafficDown = BigInt(traffic.down);

              // Update connection with traffic data
              await db
                .update(userConnections)
                .set({
                  trafficUp,
                  trafficDown,
                  lastSyncedAt: new Date(),
                })
                .where(eq(userConnections.id, connection.id));

              partialResult.connectionsUpdated++;
              partialResult.totalBytesUp += trafficUp;
              partialResult.totalBytesDown += trafficDown;
            }
          } catch (error) {
            const errMsg = `Failed to sync traffic for connection ${connection.id}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(errMsg);
            partialResult.errors.push(errMsg);
          }
        }

        return { serverId, ...partialResult };
      }
    )
  );

  // Aggregate results from all servers
  for (const serverResult of serverResults) {
    if (serverResult.status === "fulfilled") {
      result.serversProcessed++;
      result.connectionsUpdated += serverResult.value.connectionsUpdated;
      result.totalBytesUp += serverResult.value.totalBytesUp;
      result.totalBytesDown += serverResult.value.totalBytesDown;
      result.errors.push(...serverResult.value.errors);
    } else {
      const errMsg = `Failed to connect to server: ${serverResult.reason instanceof Error ? serverResult.reason.message : String(serverResult.reason)}`;
      console.error(errMsg);
      result.errors.push(errMsg);
    }
  }

  return result;
}

/**
 * Sync traffic for a specific user's active subscriptions
 * Used for on-demand refresh
 */
export async function syncUserTraffic(
  userId: number
): Promise<TrafficSyncResult> {
  const result: TrafficSyncResult = {
    serversProcessed: 0,
    connectionsUpdated: 0,
    totalBytesUp: BigInt(0),
    totalBytesDown: BigInt(0),
    errors: [],
  };

  // Get user's active connections
  const connections = await db
    .select({
      connection: userConnections,
      subscription: subscriptions,
      server: servers,
    })
    .from(userConnections)
    .innerJoin(
      subscriptions,
      eq(userConnections.subscriptionId, subscriptions.id)
    )
    .innerJoin(servers, eq(userConnections.serverId, servers.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        eq(servers.isActive, true)
      )
    );

  // Group connections by server to minimize API calls
  const connectionsByServer = new Map<
    number,
    { connection: typeof connections[0]["connection"]; subscription: typeof connections[0]["subscription"] }[]
  >();
  for (const conn of connections) {
    const existing = connectionsByServer.get(conn.server.id) || [];
    existing.push({ connection: conn.connection, subscription: conn.subscription });
    connectionsByServer.set(conn.server.id, existing);
  }

  // Process all servers in parallel
  const serverResults = await Promise.allSettled(
    [...connectionsByServer.entries()].map(
      async ([serverId, serverConnections]) => {
        const partialResult = {
          connectionsUpdated: 0,
          totalBytesUp: BigInt(0),
          totalBytesDown: BigInt(0),
          errors: [] as string[],
        };

        const xuiClient = await getXuiClientForServer(serverId);

        // Fetch all client traffic in one API call
        const trafficMap = await xuiClient.getAllClientTraffic();

        // Update each connection using the cached traffic data
        for (const { connection, subscription } of serverConnections) {
          try {
            const traffic = trafficMap.get(subscription.clientUuid);

            if (traffic) {
              const trafficUp = BigInt(traffic.up);
              const trafficDown = BigInt(traffic.down);

              await db
                .update(userConnections)
                .set({
                  trafficUp,
                  trafficDown,
                  lastSyncedAt: new Date(),
                })
                .where(eq(userConnections.id, connection.id));

              partialResult.connectionsUpdated++;
              partialResult.totalBytesUp += trafficUp;
              partialResult.totalBytesDown += trafficDown;
            }
          } catch (error) {
            const errMsg = `Failed to sync traffic for connection ${connection.id}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(errMsg);
            partialResult.errors.push(errMsg);
          }
        }

        return { serverId, ...partialResult };
      }
    )
  );

  // Aggregate results from all servers
  for (const serverResult of serverResults) {
    if (serverResult.status === "fulfilled") {
      result.serversProcessed++;
      result.connectionsUpdated += serverResult.value.connectionsUpdated;
      result.totalBytesUp += serverResult.value.totalBytesUp;
      result.totalBytesDown += serverResult.value.totalBytesDown;
      result.errors.push(...serverResult.value.errors);
    } else {
      const errMsg = `Failed to connect to server: ${serverResult.reason instanceof Error ? serverResult.reason.message : String(serverResult.reason)}`;
      console.error(errMsg);
      result.errors.push(errMsg);
    }
  }

  return result;
}

/**
 * Get aggregated traffic for a subscription across all servers
 */
export async function getAggregatedTraffic(
  subscriptionId: number
): Promise<AggregatedTraffic> {
  const connections = await db
    .select({
      trafficUp: userConnections.trafficUp,
      trafficDown: userConnections.trafficDown,
      lastSyncedAt: userConnections.lastSyncedAt,
    })
    .from(userConnections)
    .where(eq(userConnections.subscriptionId, subscriptionId));

  let totalUp = BigInt(0);
  let totalDown = BigInt(0);
  let lastSyncedAt: Date | null = null;

  for (const conn of connections) {
    totalUp += conn.trafficUp;
    totalDown += conn.trafficDown;

    // Track the most recent sync time
    if (conn.lastSyncedAt) {
      if (!lastSyncedAt || conn.lastSyncedAt > lastSyncedAt) {
        lastSyncedAt = conn.lastSyncedAt;
      }
    }
  }

  return {
    totalUp,
    totalDown,
    total: totalUp + totalDown,
    lastSyncedAt,
  };
}

/**
 * Format bytes to human-readable string (e.g., "2.54 GB")
 */
export function formatBytes(bytes: bigint | number): string {
  const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes;

  if (numBytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(numBytes) / Math.log(k));

  return `${(numBytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format time ago (e.g., "5h ago", "2d ago")
 */
export function formatTimeAgo(date: Date | null): string {
  if (!date) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
