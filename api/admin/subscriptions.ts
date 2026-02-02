import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, desc, and } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { subscriptions, users, plans } from "../../src/db/schema.js";
import {
  requireAdmin,
  requireCsrf,
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

  // Validate CSRF for mutation methods
  if (!requireCsrf(req, res)) return;

  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "PATCH":
      return handlePatch(req, res);
    default:
      return methodNotAllowed(res, ["GET", "PATCH"]);
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (id && typeof id === "string") {
    return getSubscriptionById(res, parseInt(id, 10));
  }

  return listSubscriptions(req, res);
}

async function getSubscriptionById(res: VercelResponse, id: number) {
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: "Invalid subscription ID" });
  }

  try {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, id),
      with: {
        user: true,
        plan: true,
        connections: {
          with: {
            server: true,
          },
        },
      },
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: "Subscription not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...subscription,
        trafficUsedBytes: subscription.trafficUsedBytes.toString(),
        user: {
          ...subscription.user,
          telegramId: subscription.user.telegramId.toString(),
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch subscription:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch subscription" });
  }
}

async function listSubscriptions(req: VercelRequest, res: VercelResponse) {
  const pagination = parsePagination(req);
  const { userId, status } = req.query;

  try {
    // Build where conditions
    const conditions = [];

    if (userId && typeof userId === "string") {
      const userIdNum = parseInt(userId, 10);
      if (!isNaN(userIdNum)) {
        conditions.push(eq(subscriptions.userId, userIdNum));
      }
    }

    if (status && typeof status === "string") {
      if (["active", "expired", "cancelled"].includes(status)) {
        conditions.push(eq(subscriptions.status, status));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(whereClause);

    // Get subscriptions with user and plan info
    const subscriptionList = await db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        planId: subscriptions.planId,
        clientUuid: subscriptions.clientUuid,
        status: subscriptions.status,
        startsAt: subscriptions.startsAt,
        expiresAt: subscriptions.expiresAt,
        trafficUsedBytes: subscriptions.trafficUsedBytes,
        createdAt: subscriptions.createdAt,
        userTelegramId: users.telegramId,
        userUsername: users.username,
        userFirstName: users.firstName,
        planName: plans.name,
        planDurationDays: plans.durationDays,
      })
      .from(subscriptions)
      .leftJoin(users, eq(subscriptions.userId, users.id))
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .where(whereClause)
      .orderBy(desc(subscriptions.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Transform for response
    const data = subscriptionList.map((s) => ({
      id: s.id,
      userId: s.userId,
      planId: s.planId,
      clientUuid: s.clientUuid,
      status: s.status,
      startsAt: s.startsAt,
      expiresAt: s.expiresAt,
      trafficUsedBytes: s.trafficUsedBytes.toString(),
      createdAt: s.createdAt,
      user: s.userTelegramId
        ? {
            telegramId: s.userTelegramId.toString(),
            username: s.userUsername,
            firstName: s.userFirstName,
          }
        : null,
      plan: s.planName
        ? {
            name: s.planName,
            durationDays: s.planDurationDays,
          }
        : null,
    }));

    return res.status(200).json(paginatedResponse(data, count, pagination));
  } catch (error) {
    console.error("Failed to list subscriptions:", error);
    return res.status(500).json({ success: false, error: "Failed to list subscriptions" });
  }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "Subscription ID required" });
  }

  const subscriptionId = parseInt(id, 10);
  if (isNaN(subscriptionId)) {
    return res.status(400).json({ success: false, error: "Invalid subscription ID" });
  }

  const { status, extendDays } = req.body;

  try {
    // Get current subscription
    const current = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    });

    if (!current) {
      return res.status(404).json({ success: false, error: "Subscription not found" });
    }

    const updates: Record<string, unknown> = {};

    // Handle status change
    if (status && typeof status === "string") {
      if (!["active", "expired", "cancelled"].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status. Must be: active, expired, or cancelled",
        });
      }
      updates.status = status;
    }

    // Handle extension
    if (extendDays && typeof extendDays === "number") {
      if (extendDays <= 0 || extendDays > 365) {
        return res.status(400).json({
          success: false,
          error: "extendDays must be between 1 and 365",
        });
      }

      const newExpiresAt = new Date(current.expiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + extendDays);
      updates.expiresAt = newExpiresAt;

      // If extending an expired subscription, reactivate it
      if (current.status === "expired" && !updates.status) {
        updates.status = "active";
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update. Provide status or extendDays.",
      });
    }

    const [updated] = await db
      .update(subscriptions)
      .set(updates)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return res.status(200).json({
      success: true,
      data: {
        ...updated,
        trafficUsedBytes: updated.trafficUsedBytes.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to update subscription:", error);
    return res.status(500).json({ success: false, error: "Failed to update subscription" });
  }
}
