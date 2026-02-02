import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { servers, userConnections, type NewServer, type Server } from "../../src/db/schema.js";
import { encrypt } from "../../src/lib/crypto.js";
import {
  requireAdmin,
  methodNotAllowed,
  parsePagination,
  paginatedResponse,
} from "./middleware.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

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
  const { id } = req.query;

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
    console.error("Failed to fetch server:", error);
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

    // Get servers with connection counts
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
        connectionCount: sql<number>`(
          select count(*)::int from user_connections
          where user_connections.server_id = ${servers.id}
        )`,
      })
      .from(servers)
      .orderBy(desc(servers.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return res.status(200).json(paginatedResponse(serverList, count, pagination));
  } catch (error) {
    console.error("Failed to list servers:", error);
    return res.status(500).json({ success: false, error: "Failed to list servers" });
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

    return res.status(201).json({
      success: true,
      data: server,
    });
  } catch (error) {
    console.error("Failed to create server:", error);

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

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Failed to update server:", error);
    return res.status(500).json({ success: false, error: "Failed to update server" });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

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

    return res.status(200).json({
      success: true,
      message: "Server deleted",
    });
  } catch (error) {
    console.error("Failed to delete server:", error);
    return res.status(500).json({ success: false, error: "Failed to delete server" });
  }
}
