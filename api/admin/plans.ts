import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { plans, subscriptions, type NewPlan, type Plan } from "../../src/db/schema.js";
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
    return getPlanById(res, parseInt(id, 10));
  }

  return listPlans(req, res);
}

async function getPlanById(res: VercelResponse, id: number) {
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: "Invalid plan ID" });
  }

  try {
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, id),
    });

    if (!plan) {
      return res.status(404).json({ success: false, error: "Plan not found" });
    }

    // Get subscription counts
    const [stats] = await db
      .select({
        totalSubscriptions: sql<number>`count(*)::int`,
        activeSubscriptions: sql<number>`count(*) filter (where ${subscriptions.status} = 'active')::int`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.planId, id));

    return res.status(200).json({
      success: true,
      data: {
        ...plan,
        totalSubscriptions: stats.totalSubscriptions,
        activeSubscriptions: stats.activeSubscriptions,
      },
    });
  } catch (error) {
    console.error("Failed to fetch plan:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch plan" });
  }
}

async function listPlans(req: VercelRequest, res: VercelResponse) {
  const pagination = parsePagination(req);

  try {
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(plans);

    // Get plans with subscription counts
    const planList = await db
      .select({
        id: plans.id,
        name: plans.name,
        durationDays: plans.durationDays,
        priceStars: plans.priceStars,
        priceTon: plans.priceTon,
        trafficLimitGb: plans.trafficLimitGb,
        maxDevices: plans.maxDevices,
        isActive: plans.isActive,
        createdAt: plans.createdAt,
        activeSubscriptions: sql<number>`(
          select count(*)::int from subscriptions
          where subscriptions.plan_id = ${plans.id}
          and subscriptions.status = 'active'
        )`,
      })
      .from(plans)
      .orderBy(desc(plans.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return res.status(200).json(paginatedResponse(planList, count, pagination));
  } catch (error) {
    console.error("Failed to list plans:", error);
    return res.status(500).json({ success: false, error: "Failed to list plans" });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const {
    name,
    durationDays,
    priceStars,
    priceTon,
    trafficLimitGb,
    maxDevices,
  } = req.body;

  // Validate required fields
  if (!name || !durationDays || priceStars === undefined || !priceTon) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: name, durationDays, priceStars, priceTon",
    });
  }

  if (typeof durationDays !== "number" || durationDays <= 0) {
    return res.status(400).json({
      success: false,
      error: "durationDays must be a positive number",
    });
  }

  if (typeof priceStars !== "number" || priceStars < 0) {
    return res.status(400).json({
      success: false,
      error: "priceStars must be a non-negative number",
    });
  }

  try {
    const planData: NewPlan = {
      name,
      durationDays,
      priceStars,
      priceTon: String(priceTon),
      trafficLimitGb: trafficLimitGb || null,
      maxDevices: maxDevices || 3,
    };

    const [plan] = await db
      .insert(plans)
      .values(planData)
      .returning();

    return res.status(201).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("Failed to create plan:", error);
    return res.status(500).json({ success: false, error: "Failed to create plan" });
  }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "Plan ID required" });
  }

  const planId = parseInt(id, 10);
  if (isNaN(planId)) {
    return res.status(400).json({ success: false, error: "Invalid plan ID" });
  }

  const {
    name,
    durationDays,
    priceStars,
    priceTon,
    trafficLimitGb,
    maxDevices,
    isActive,
  } = req.body;

  try {
    const updates: Partial<Plan> = {};

    if (name !== undefined) updates.name = name;
    if (durationDays !== undefined) {
      if (typeof durationDays !== "number" || durationDays <= 0) {
        return res.status(400).json({
          success: false,
          error: "durationDays must be a positive number",
        });
      }
      updates.durationDays = durationDays;
    }
    if (priceStars !== undefined) {
      if (typeof priceStars !== "number" || priceStars < 0) {
        return res.status(400).json({
          success: false,
          error: "priceStars must be a non-negative number",
        });
      }
      updates.priceStars = priceStars;
    }
    if (priceTon !== undefined) updates.priceTon = String(priceTon);
    if (trafficLimitGb !== undefined) updates.trafficLimitGb = trafficLimitGb;
    if (maxDevices !== undefined) updates.maxDevices = maxDevices;
    if (typeof isActive === "boolean") updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    const [updated] = await db
      .update(plans)
      .set(updates)
      .where(eq(plans.id, planId))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: "Plan not found" });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Failed to update plan:", error);
    return res.status(500).json({ success: false, error: "Failed to update plan" });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ success: false, error: "Plan ID required" });
  }

  const planId = parseInt(id, 10);
  if (isNaN(planId)) {
    return res.status(400).json({ success: false, error: "Invalid plan ID" });
  }

  try {
    // Check for active subscriptions
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.planId, planId));

    if (count > 0) {
      // Soft delete - just deactivate
      const [updated] = await db
        .update(plans)
        .set({ isActive: false })
        .where(eq(plans.id, planId))
        .returning();

      if (!updated) {
        return res.status(404).json({ success: false, error: "Plan not found" });
      }

      return res.status(200).json({
        success: true,
        message: `Plan deactivated (${count} subscriptions exist)`,
        data: updated,
      });
    }

    // Hard delete if no subscriptions
    const [deleted] = await db
      .delete(plans)
      .where(eq(plans.id, planId))
      .returning({ id: plans.id });

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Plan not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Plan deleted",
    });
  } catch (error) {
    console.error("Failed to delete plan:", error);
    return res.status(500).json({ success: false, error: "Failed to delete plan" });
  }
}
