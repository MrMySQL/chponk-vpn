import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql, and, gte } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { users, subscriptions, payments, servers, plans } from "../../src/db/schema.js";
import { requireAdmin, methodNotAllowed } from "./middleware.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    // Run all queries in parallel
    const [
      userStats,
      subscriptionStats,
      revenueStats,
      serverStats,
      planStats,
      recentUsers,
      recentPayments,
    ] = await Promise.all([
      // User stats
      db
        .select({
          total: sql<number>`count(*)::int`,
          admins: sql<number>`count(*) filter (where ${users.isAdmin})::int`,
          banned: sql<number>`count(*) filter (where ${users.isBanned})::int`,
        })
        .from(users),

      // Subscription stats
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${subscriptions.status} = 'active')::int`,
          expired: sql<number>`count(*) filter (where ${subscriptions.status} = 'expired')::int`,
          cancelled: sql<number>`count(*) filter (where ${subscriptions.status} = 'cancelled')::int`,
        })
        .from(subscriptions),

      // Revenue stats (completed payments)
      db
        .select({
          stars: sql<string>`coalesce(sum(${payments.amount}::numeric) filter (where ${payments.currency} = 'stars' and ${payments.status} = 'completed'), 0)::text`,
          ton: sql<string>`coalesce(sum(${payments.amount}::numeric) filter (where ${payments.currency} = 'ton' and ${payments.status} = 'completed'), 0)::text`,
          totalPayments: sql<number>`count(*) filter (where ${payments.status} = 'completed')::int`,
        })
        .from(payments),

      // Server stats
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${servers.isActive})::int`,
        })
        .from(servers),

      // Plan stats
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${plans.isActive})::int`,
        })
        .from(plans),

      // Recent users (last 7 days)
      db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(users)
        .where(gte(users.createdAt, sql`now() - interval '7 days'`)),

      // Recent payments (last 7 days)
      db
        .select({
          count: sql<number>`count(*)::int`,
          stars: sql<string>`coalesce(sum(${payments.amount}::numeric) filter (where ${payments.currency} = 'stars'), 0)::text`,
          ton: sql<string>`coalesce(sum(${payments.amount}::numeric) filter (where ${payments.currency} = 'ton'), 0)::text`,
        })
        .from(payments)
        .where(
          and(
            gte(payments.createdAt, sql`now() - interval '7 days'`),
            eq(payments.status, "completed")
          )
        ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        users: {
          total: userStats[0].total,
          admins: userStats[0].admins,
          banned: userStats[0].banned,
          newThisWeek: recentUsers[0].count,
        },
        subscriptions: {
          total: subscriptionStats[0].total,
          active: subscriptionStats[0].active,
          expired: subscriptionStats[0].expired,
          cancelled: subscriptionStats[0].cancelled,
        },
        revenue: {
          totalStars: revenueStats[0].stars,
          totalTon: revenueStats[0].ton,
          totalPayments: revenueStats[0].totalPayments,
          thisWeek: {
            payments: recentPayments[0].count,
            stars: recentPayments[0].stars,
            ton: recentPayments[0].ton,
          },
        },
        servers: {
          total: serverStats[0].total,
          active: serverStats[0].active,
        },
        plans: {
          total: planStats[0].total,
          active: planStats[0].active,
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch statistics" });
  }
}
