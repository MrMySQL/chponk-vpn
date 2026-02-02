/**
 * Account-related callback handlers
 */

import { eq, and, gt } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { subscriptions } from "../../db/schema.js";
import { syncUserTraffic } from "../../services/traffic-sync.js";

// Rate limit: track last refresh per user (in memory, resets on cold start)
const lastRefreshByUser = new Map<number, number>();
const REFRESH_COOLDOWN_MS = 60 * 1000; // 1 minute

/**
 * Handle "Refresh Traffic" button click
 * Syncs traffic data on-demand for the user's subscriptions
 */
export async function handleRefreshTraffic(ctx: AuthContext): Promise<void> {
  const match = ctx.callbackQuery?.data?.match(/^refresh_traffic_(\d+)$/);
  if (!match) {
    await ctx.answerCallbackQuery({ text: "Invalid action" });
    return;
  }

  const subscriptionId = parseInt(match[1], 10);

  // Verify the subscription belongs to this user
  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.id, subscriptionId),
      eq(subscriptions.userId, ctx.user.id),
      eq(subscriptions.status, "active"),
      gt(subscriptions.expiresAt, new Date())
    ),
  });

  if (!subscription) {
    await ctx.answerCallbackQuery({
      text: "Subscription not found or expired.",
      show_alert: true,
    });
    return;
  }

  // Check rate limit
  const now = Date.now();
  const lastRefresh = lastRefreshByUser.get(ctx.user.id);
  if (lastRefresh && now - lastRefresh < REFRESH_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil(
      (REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 1000
    );
    await ctx.answerCallbackQuery({
      text: `Please wait ${remainingSeconds}s before refreshing again.`,
      show_alert: true,
    });
    return;
  }

  // Show refreshing status
  await ctx.answerCallbackQuery({ text: "Refreshing traffic data..." });

  try {
    // Update rate limit
    lastRefreshByUser.set(ctx.user.id, now);

    // Sync traffic for this user
    const result = await syncUserTraffic(ctx.user.id);

    // Re-display the account page with updated data
    const { accountCommand } = await import("../commands/account.js");
    await accountCommand(ctx);

    // Show success notification if there were updates
    if (result.connectionsUpdated > 0) {
      console.log(
        `Traffic refreshed for user ${ctx.user.id}: ${result.connectionsUpdated} connections updated`
      );
    }
  } catch (error) {
    console.error("Failed to refresh traffic:", error);
    await ctx.reply(
      "❌ Failed to refresh traffic data. Please try again later."
    );
  }
}
