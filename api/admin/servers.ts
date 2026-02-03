import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { servers, userConnections, subscriptions, users, type NewServer, type Server } from "../../src/db/schema.js";
import { encrypt } from "../../src/lib/crypto.js";
import { getXuiClientForServer } from "../../src/services/xui/repository.js";
import {
  requireAdmin,
  requireCsrf,
  methodNotAllowed,
  parsePagination,
  paginatedResponse,
} from "./middleware.js";
import { createLogger } from "../../src/lib/logger.js";

const log = createLogger({ handler: "admin/servers" });

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  // Validate CSRF for mutation methods
  if (!requireCsrf(req, res)) return;

  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "POST":
      return handlePost(req, res);
    case "PATCH":
      return handlePatch(req, res);
    case "DELETE":
      return handleDelete(req, res);
    default:
      return methodNotAllowed(res, ["GET", "POST", "PATCH", "DELETE"]);
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { id, connections } = req.query;

  // List connections for a server
  if (connections === "true" && id && typeof id === "string") {
    return listServerConnections(res, parseInt(id, 10));
  }

  if (id && typeof id === "string") {
    return getServerById(res, parseInt(id, 10));
  }

  return listServers(req, res);
}

async function getServerById(res: VercelResponse, id: number) {
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: "Invalid server ID" });
  }

  try {
    const server = await db.query.servers.findFirst({
      where: eq(servers.id, id),
    });

    if (!server) {
      return res.status(404).json({ success: false, error: "Server not found" });
    }

    // Get connection count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userConnections)
      .where(eq(userConnections.serverId, id));

    // Don't expose encrypted password
    const { xuiPassword, ...safeServer } = server;

    return res.status(200).json({
      success: true,
      data: {
        ...safeServer,
        activeConnections: count,
      },
    });
  } catch (error) {
    log.error("Failed to fetch server", { serverId: id }, error);
    return res.status(500).json({ success: false, error: "Failed to fetch server" });
  }
}

async function listServers(req: VercelRequest, res: VercelResponse) {
  const pagination = parsePagination(req);

  try {
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(servers);

    // Get servers with connection counts using LEFT JOIN
    const serverList = await db
      .select({
        id: servers.id,
        name: servers.name,
        location: servers.location,
        flagEmoji: servers.flagEmoji,
        host: servers.host,
        domain: servers.domain,
        isActive: servers.isActive,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        connectionCount: sql<number>`count(${userConnections.id})::int`,
      })
      .from(servers)
      .leftJoin(userConnections, eq(servers.id, userConnections.serverId))
      .groupBy(servers.id)
      .orderBy(desc(servers.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return res.status(200).json(paginatedResponse(serverList, count, pagination));
  } catch (error) {
    log.error("Failed to list servers", {}, error);
    return res.status(500).json({ success: false, error: "Failed to list servers" });
  }
}

async function listServerConnections(res: VercelResponse, serverId: number) {
  if (isNaN(serverId)) {
    return res.status(400).json({ success: false, error: "Invalid serverId" });
  }

  try {
    const connectionsList = await db
      .select({
        id: userConnections.id,
        xuiClientEmail: userConnections.xuiClientEmail,
        trafficUp: userConnections.trafficUp,
        trafficDown: userConnections.trafficDown,
        lastSyncedAt: userConnections.lastSyncedAt,
        createdAt: userConnections.createdAt,
        subscriptionId: subscriptions.id,
        subscriptionStatus: subscriptions.status,
        subscriptionExpiresAt: subscriptions.expiresAt,
        userId: users.id,
        userTelegramId: users.telegramId,
        userUsername: users.username,
        userFirstName: users.firstName,
      })
      .from(userConnections)
      .innerJoin(subscriptions, eq(userConnections.subscriptionId, subscriptions.id))
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(eq(userConnections.serverId, serverId))
      .orderBy(desc(userConnections.createdAt));

    const data = connectionsList.map((c) => ({
      id: c.id,
      xuiClientEmail: c.xuiClientEmail,
      trafficUp: c.trafficUp.toString(),
      trafficDown: c.trafficDown.toString(),
      lastSyncedAt: c.lastSyncedAt,
      createdAt: c.createdAt,
      subscription: {
        id: c.subscriptionId,
        status: c.subscriptionStatus,
        expiresAt: c.subscriptionExpiresAt,
      },
      user: {
        id: c.userId,
        telegramId: c.userTelegramId.toString(),
        username: c.userUsername,
        firstName: c.userFirstName,
      },
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error("Failed to list connections", { serverId }, error);
    return res.status(500).json({ success: false, error: "Failed to list connections" });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const {
    name,
    location,
    flagEmoji,
    host,
    domain,
    xuiPort,
    xuiBasePath,
    xuiUsername,
    xuiPassword,
    inboundId,
    realityPort,
    realityDest,
    realitySni,
    realityPublicKey,
    realityShortId,
  } = req.body;

  // Validate required fields
  if (!name || !location || !host || !domain || !xuiUsername || !xuiPassword || !realityDest || !realitySni) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: name, location, host, domain, xuiUsername, xuiPassword, realityDest, realitySni",
    });
  }

  try {
    const encryptedPassword = encrypt(xuiPassword);

    const serverData: NewServer = {
      name,
      location,
      flagEmoji: flagEmoji || null,
      host,
      domain,
      xuiPort: xuiPort || 2053,
      xuiBasePath: xuiBasePath || null,
      xuiUsername,
      xuiPassword: encryptedPassword,
      inboundId: inboundId || 1,
      realityPort: realityPort || 443,
      realityDest,
      realitySni,
      realityPublicKey: realityPublicKey || null,
      realityShortId: realityShortId || null,
    };

    const [server] = await db
      .insert(servers)
      .values(serverData)
      .returning({
        id: servers.id,
        name: servers.name,
        location: servers.location,
        domain: servers.domain,
        isActive: servers.isActive,
        createdAt: servers.createdAt,
      });

    log.info("Server created", {
      serverId: server.id,
      name: server.name,
      domain: server.domain,
    });

    return res.status(201).json({
      success: true,
      data: server,
    });
  } catch (error) {
    log.error("Failed to create server", { name, domain }, error);

    if (error instanceof Error && error.message.includes("unique constraint")) {
      return res.status(409).json({
        success: false,
        error: "A server with this domain already exists",
      });
    }

    return res.status(500).json({ success: false, error: "Failed to create server" });
  }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "Server ID required" });
  }

  const serverId = parseInt(id, 10);
  if (isNaN(serverId)) {
    return res.status(400).json({ success: false, error: "Invalid server ID" });
  }

  const {
    name,
    location,
    flagEmoji,
    host,
    xuiPort,
    xuiBasePath,
    xuiUsername,
    xuiPassword,
    inboundId,
    realityPort,
    realityDest,
    realitySni,
    realityPublicKey,
    realityShortId,
    isActive,
  } = req.body;

  try {
    const updates: Partial<Server> = { updatedAt: new Date() };

    if (name !== undefined) updates.name = name;
    if (location !== undefined) updates.location = location;
    if (flagEmoji !== undefined) updates.flagEmoji = flagEmoji;
    if (host !== undefined) updates.host = host;
    if (xuiPort !== undefined) updates.xuiPort = xuiPort;
    if (xuiBasePath !== undefined) updates.xuiBasePath = xuiBasePath;
    if (xuiUsername !== undefined) updates.xuiUsername = xuiUsername;
    if (xuiPassword !== undefined) updates.xuiPassword = encrypt(xuiPassword);
    if (inboundId !== undefined) updates.inboundId = inboundId;
    if (realityPort !== undefined) updates.realityPort = realityPort;
    if (realityDest !== undefined) updates.realityDest = realityDest;
    if (realitySni !== undefined) updates.realitySni = realitySni;
    if (realityPublicKey !== undefined) updates.realityPublicKey = realityPublicKey;
    if (realityShortId !== undefined) updates.realityShortId = realityShortId;
    if (typeof isActive === "boolean") updates.isActive = isActive;

    const [updated] = await db
      .update(servers)
      .set(updates)
      .where(eq(servers.id, serverId))
      .returning({
        id: servers.id,
        name: servers.name,
        location: servers.location,
        domain: servers.domain,
        isActive: servers.isActive,
        updatedAt: servers.updatedAt,
      });

    if (!updated) {
      return res.status(404).json({ success: false, error: "Server not found" });
    }

    log.info("Server updated", {
      serverId,
      isActive: updates.isActive,
    });

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    log.error("Failed to update server", { serverId }, error);
    return res.status(500).json({ success: false, error: "Failed to update server" });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { id, connectionId } = req.query;

  // Delete a connection
  if (connectionId && typeof connectionId === "string") {
    return deleteConnection(res, parseInt(connectionId, 10));
  }

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "Server ID required" });
  }

  const serverId = parseInt(id, 10);
  if (isNaN(serverId)) {
    return res.status(400).json({ success: false, error: "Invalid server ID" });
  }

  try {
    // Check for active connections
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userConnections)
      .where(eq(userConnections.serverId, serverId));

    if (count > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete server with ${count} active connections. Deactivate it instead.`,
      });
    }

    const [deleted] = await db
      .delete(servers)
      .where(eq(servers.id, serverId))
      .returning({ id: servers.id });

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Server not found" });
    }

    log.info("Server deleted", { serverId });

    return res.status(200).json({
      success: true,
      message: "Server deleted",
    });
  } catch (error) {
    log.error("Failed to delete server", { serverId }, error);
    return res.status(500).json({ success: false, error: "Failed to delete server" });
  }
}

async function deleteConnection(res: VercelResponse, connectionId: number) {
  if (isNaN(connectionId)) {
    return res.status(400).json({ success: false, error: "Invalid connection ID" });
  }

  try {
    // Get connection details with subscription UUID
    const connection = await db
      .select({
        id: userConnections.id,
        serverId: userConnections.serverId,
        clientUuid: subscriptions.clientUuid,
      })
      .from(userConnections)
      .innerJoin(subscriptions, eq(userConnections.subscriptionId, subscriptions.id))
      .where(eq(userConnections.id, connectionId))
      .limit(1);

    if (connection.length === 0) {
      return res.status(404).json({ success: false, error: "Connection not found" });
    }

    const { serverId, clientUuid } = connection[0];

    // Delete from X-UI panel
    try {
      const xuiClient = await getXuiClientForServer(serverId);
      await xuiClient.deleteClient(clientUuid);
      log.info("Deleted client from X-UI", {
        connectionId,
        serverId,
        clientUuid,
      });
    } catch (xuiError) {
      log.warn("Failed to delete client from X-UI (continuing anyway)", {
        connectionId,
        serverId,
        clientUuid,
      }, xuiError);
      // Continue with database deletion even if X-UI fails
      // The client might already be deleted or server might be unreachable
    }

    // Delete from database
    const [deleted] = await db
      .delete(userConnections)
      .where(eq(userConnections.id, connectionId))
      .returning({ id: userConnections.id });

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Connection not found" });
    }

    log.info("Connection deleted from database", { connectionId });

    return res.status(200).json({
      success: true,
      message: "Connection deleted",
    });
  } catch (error) {
    log.error("Failed to delete connection", { connectionId }, error);
    return res.status(500).json({ success: false, error: "Failed to delete connection" });
  }
}
