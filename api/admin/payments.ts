import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { payments, users } from "../../src/db/schema.js";
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
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const pagination = parsePagination(req);
  const { userId, status, currency, from, to } = req.query;

  try {
    // Build where conditions
    const conditions = [];

    if (userId && typeof userId === "string") {
      const userIdNum = parseInt(userId, 10);
      if (!isNaN(userIdNum)) {
        conditions.push(eq(payments.userId, userIdNum));
      }
    }

    if (status && typeof status === "string") {
      if (["pending", "completed", "failed", "refunded"].includes(status)) {
        conditions.push(eq(payments.status, status));
      }
    }

    if (currency && typeof currency === "string") {
      if (["stars", "ton"].includes(currency)) {
        conditions.push(eq(payments.currency, currency));
      }
    }

    if (from && typeof from === "string") {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(payments.createdAt, fromDate));
      }
    }

    if (to && typeof to === "string") {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(payments.createdAt, toDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(whereClause);

    // Get payments with user info
    const paymentList = await db
      .select({
        id: payments.id,
        userId: payments.userId,
        subscriptionId: payments.subscriptionId,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        providerId: payments.providerId,
        createdAt: payments.createdAt,
        userTelegramId: users.telegramId,
        userUsername: users.username,
        userFirstName: users.firstName,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(whereClause)
      .orderBy(desc(payments.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Transform for response
    const data = paymentList.map((p) => ({
      id: p.id,
      userId: p.userId,
      subscriptionId: p.subscriptionId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      providerId: p.providerId,
      createdAt: p.createdAt,
      user: p.userTelegramId
        ? {
            telegramId: p.userTelegramId.toString(),
            username: p.userUsername,
            firstName: p.userFirstName,
          }
        : null,
    }));

    return res.status(200).json(paginatedResponse(data, count, pagination));
  } catch (error) {
    console.error("Failed to list payments:", error);
    return res.status(500).json({ success: false, error: "Failed to list payments" });
  }
}
