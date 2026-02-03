import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, desc, or, ilike, and } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { users, subscriptions, plans, type User, type NewSubscription } from "../../src/db/schema.js";
import {
  requireAdmin,
  requireCsrf,
  methodNotAllowed,
  parsePagination,
  paginatedResponse,
} from "./middleware.js";
import { createLogger } from "../../src/lib/logger.js";

const log = createLogger({ handler: "admin/users" });

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  // Validate CSRF for mutation methods
  if (!requireCsrf(req, res)) return;

  // Route based on method
  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "PATCH":
      return handlePatch(req, res);
    case "POST":
      return handlePost(req, res);
    default:
      return methodNotAllowed(res, ["GET", "PATCH", "POST"]);
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  // If ID provided, get single user
  if (id && typeof id === "string") {
    return getUserById(res, parseInt(id, 10));
  }

  // Otherwise, list users
  return listUsers(req, res);
}

async function getUserById(res: VercelResponse, id: number) {
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: "Invalid user ID" });
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        subscriptions: {
          with: {
            plan: true,
          },
          orderBy: desc(subscriptions.createdAt),
        },
        payments: {
          orderBy: desc(subscriptions.createdAt),
          limit: 10,
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...user,
        telegramId: user.telegramId.toString(),
      },
    });
  } catch (error) {
    log.error("Failed to fetch user", { userId: id }, error);
    return res.status(500).json({ success: false, error: "Failed to fetch user" });
  }
}

async function listUsers(req: VercelRequest, res: VercelResponse) {
  const pagination = parsePagination(req);
  const search = req.query.search as string | undefined;
  const filter = req.query.filter as string | undefined;

  try {
    // Build where conditions
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(users.username, `%${search}%`),
          ilike(users.firstName, `%${search}%`),
          sql`${users.telegramId}::text like ${`%${search}%`}`
        )
      );
    }

    if (filter === "admin") {
      conditions.push(eq(users.isAdmin, true));
    } else if (filter === "banned") {
      conditions.push(eq(users.isBanned, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);

    // Get users with active subscription info
    const userList = await db.query.users.findMany({
      where: whereClause,
      with: {
        subscriptions: {
          where: eq(subscriptions.status, "active"),
          limit: 1,
        },
      },
      orderBy: desc(users.createdAt),
      limit: pagination.limit,
      offset: pagination.offset,
    });

    // Transform for response
    const data = userList.map((user) => ({
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      isAdmin: user.isAdmin,
      isBanned: user.isBanned,
      hasActiveSubscription: user.subscriptions.length > 0,
      createdAt: user.createdAt,
    }));

    return res.status(200).json(paginatedResponse(data, count, pagination));
  } catch (error) {
    log.error("Failed to list users", {}, error);
    return res.status(500).json({ success: false, error: "Failed to list users" });
  }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "User ID required" });
  }

  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, error: "Invalid user ID" });
  }

  const { isAdmin, isBanned } = req.body;

  // Validate at least one field provided
  if (isAdmin === undefined && isBanned === undefined) {
    return res.status(400).json({
      success: false,
      error: "At least one field (isAdmin, isBanned) is required",
    });
  }

  try {
    const updates: Partial<User> = {
      updatedAt: new Date(),
    };

    if (typeof isAdmin === "boolean") updates.isAdmin = isAdmin;
    if (typeof isBanned === "boolean") updates.isBanned = isBanned;

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    log.info("User updated", {
      userId,
      isAdmin: updates.isAdmin,
      isBanned: updates.isBanned,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...updated,
        telegramId: updated.telegramId.toString(),
      },
    });
  } catch (error) {
    log.error("Failed to update user", { userId }, error);
    return res.status(500).json({ success: false, error: "Failed to update user" });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  // Handle gift subscription days
  const { id, action } = req.query;

  if (action !== "gift") {
    return res.status(400).json({ success: false, error: "Invalid action" });
  }

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "User ID required" });
  }

  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, error: "Invalid user ID" });
  }

  const { days } = req.body;

  if (typeof days !== "number" || days <= 0 || days > 365) {
    return res.status(400).json({
      success: false,
      error: "Days must be a number between 1 and 365",
    });
  }

  try {
    // Check user exists
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Find active subscription
    const activeSubscription = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      ),
      with: { plan: true },
    });

    if (activeSubscription) {
      // Extend existing subscription
      const newExpiresAt = new Date(activeSubscription.expiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + days);

      const [updated] = await db
        .update(subscriptions)
        .set({ expiresAt: newExpiresAt })
        .where(eq(subscriptions.id, activeSubscription.id))
        .returning();

      log.info("Extended subscription", {
        userId,
        subscriptionId: updated.id,
        days,
        previousExpiry: activeSubscription.expiresAt.toISOString(),
        newExpiry: updated.expiresAt.toISOString(),
      });

      return res.status(200).json({
        success: true,
        message: `Extended subscription by ${days} days`,
        data: {
          subscriptionId: updated.id,
          previousExpiry: activeSubscription.expiresAt,
          newExpiry: updated.expiresAt,
        },
      });
    } else {
      // Create new subscription with default plan
      const defaultPlan = await db.query.plans.findFirst({
        where: eq(plans.isActive, true),
        orderBy: desc(plans.durationDays),
      });

      if (!defaultPlan) {
        return res.status(400).json({
          success: false,
          error: "No active plans available",
        });
      }

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + days);

      const subscriptionData: NewSubscription = {
        userId,
        planId: defaultPlan.id,
        clientUuid: crypto.randomUUID(),
        status: "active",
        startsAt: now,
        expiresAt,
      };

      const [newSubscription] = await db
        .insert(subscriptions)
        .values(subscriptionData)
        .returning();

      log.info("Created gift subscription", {
        userId,
        subscriptionId: newSubscription.id,
        planId: defaultPlan.id,
        days,
        expiresAt: newSubscription.expiresAt.toISOString(),
      });

      return res.status(201).json({
        success: true,
        message: `Created new ${days}-day subscription`,
        data: {
          subscriptionId: newSubscription.id,
          planId: defaultPlan.id,
          planName: defaultPlan.name,
          expiresAt: newSubscription.expiresAt,
        },
      });
    }
  } catch (error) {
    log.error("Failed to gift subscription", { userId }, error);
    return res.status(500).json({ success: false, error: "Failed to gift subscription" });
  }
}
