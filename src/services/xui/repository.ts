/**
 * Database integration helpers for 3x-ui client management
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { servers, type Server } from "../../db/schema.js";
import { decrypt } from "../../lib/crypto.js";
import { XuiClient, type XuiServerConfig } from "./index.js";
import { XuiNotFoundError } from "./errors.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger({ service: "xui-repository" });

/** In-memory cache of XuiClient instances per server */
const clientCache = new Map<number, XuiClient>();

/**
 * Get or create a XuiClient for a server from the database
 * Caches clients per serverless invocation
 */
export async function getXuiClientForServer(
  serverId: number
): Promise<XuiClient> {
  // Check cache first
  const cached = clientCache.get(serverId);
  if (cached) {
    log.debug("Using cached XUI client", { serverId });
    return cached;
  }

  log.debug("Loading server from database", { serverId });

  // Load server from database
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (!server) {
    log.error("Server not found", { serverId });
    throw new XuiNotFoundError("Server", String(serverId));
  }

  if (!server.isActive) {
    log.warn("Attempted to get client for inactive server", { serverId });
    throw new Error(`Server ${serverId} is not active`);
  }

  // Create client from server config
  const client = createClientFromServer(server);

  // Cache for reuse
  clientCache.set(serverId, client);

  log.info("Created and cached XUI client", {
    serverId,
    domain: server.domain,
  });

  return client;
}

/**
 * Create a XuiClient from a Server database record
 */
export function createClientFromServer(server: Server): XuiClient {
  const config: XuiServerConfig = {
    host: server.domain,
    port: server.xuiPort,
    username: server.xuiUsername,
    password: decrypt(server.xuiPassword),
    inboundId: server.inboundId,
    secure: true, // Assume HTTPS for panel
    basePath: server.xuiBasePath || undefined,
  };

  return new XuiClient(config);
}

/**
 * Get XuiClient for all active servers
 */
export async function getXuiClientsForAllServers(): Promise<
  Map<number, XuiClient>
> {
  log.debug("Loading all active servers");

  const activeServers = await db.query.servers.findMany({
    where: eq(servers.isActive, true),
  });

  log.info("Found active servers", { count: activeServers.length });

  const clients = new Map<number, XuiClient>();

  for (const server of activeServers) {
    const client = createClientFromServer(server);
    clients.set(server.id, client);
    clientCache.set(server.id, client);
  }

  return clients;
}

/**
 * Clear the client cache
 * Useful for testing or after server config changes
 */
export function clearXuiClientCache(): void {
  log.info("Clearing XUI client cache", { size: clientCache.size });
  clientCache.clear();
}

/**
 * Generate a client email identifier
 * Format: user_{userId}_{timestamp}
 */
export function generateClientEmail(userId: number): string {
  return `user_${userId}_${Date.now()}`;
}

/**
 * Parse user ID from client email
 * Returns null if email doesn't match expected format
 */
export function parseUserIdFromEmail(email: string): number | null {
  const match = email.match(/^user_(\d+)_\d+$/);
  if (!match) {
    return null;
  }
  return parseInt(match[1], 10);
}
