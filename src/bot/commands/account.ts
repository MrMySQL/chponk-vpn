import { InlineKeyboard } from "grammy";
import { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { subscriptions, plans } from "../../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import {
  getAggregatedTraffic,
  formatBytes,
  formatTimeAgo,
} from "../../services/traffic-sync.js";

export async function accountCommand(ctx: AuthContext): Promise<void> {
  // Get active subscriptions
  const activeSubscriptions = await db
    .select({
      subscription: subscriptions,
      plan: plans,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.userId, ctx.user.id),
        eq(subscriptions.status, "active"),
        gt(subscriptions.expiresAt, new Date())
      )
    );

  let message = "👤 *My Account*\n\n";
  message += `Telegram ID: \`${ctx.user.telegramId}\`\n`;

  if (ctx.user.username) {
    message += `Username: @${ctx.user.username}\n`;
  }

  message += "\n";

  const keyboard = new InlineKeyboard();

  if (activeSubscriptions.length === 0) {
    message +=
      "📭 *No active subscription*\n\n" +
      "You don't have an active subscription. " +
      "Purchase a plan to get started!";

    keyboard.text("📋 View Plans", "show_plans");
  } else {
    message += "📦 *Active Subscriptions:*\n\n";

    for (const { subscription, plan } of activeSubscriptions) {
      const expiresAt = subscription.expiresAt;
      const daysLeft = Math.ceil(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      // Get aggregated traffic from all servers
      const traffic = await getAggregatedTraffic(subscription.id);
      const totalTrafficGb = Number(traffic.total) / 1e9;
      const trafficLimit =
        plan.trafficLimitGb === null ? "∞" : `${plan.trafficLimitGb}`;

      // Calculate percentage if there's a limit
      let percentageStr = "";
      if (plan.trafficLimitGb !== null && plan.trafficLimitGb > 0) {
        const percentage = Math.min(
          100,
          (totalTrafficGb / plan.trafficLimitGb) * 100
        );
        percentageStr = ` (${percentage.toFixed(0)}%)`;
      }

      message +=
        `*${plan.name}*\n` +
        `├ Status: ✅ Active\n` +
        `├ Expires: ${expiresAt.toLocaleDateString()} (${daysLeft} days)\n` +
        `├ Devices: ${plan.maxDevices}\n` +
        `│\n` +
        `├ 📊 *Traffic Usage:*\n` +
        `│  ↑ Upload: ${formatBytes(traffic.totalUp)}\n` +
        `│  ↓ Download: ${formatBytes(traffic.totalDown)}\n` +
        `│  📦 Total: ${totalTrafficGb.toFixed(2)} / ${trafficLimit} GB${percentageStr}\n` +
        `└  🔄 Updated ${formatTimeAgo(traffic.lastSyncedAt)}\n\n`;
    }

    // Add refresh button for each subscription
    if (activeSubscriptions.length > 0) {
      keyboard.text(
        "🔄 Refresh Traffic",
        `refresh_traffic_${activeSubscriptions[0].subscription.id}`
      );
      keyboard.row();
    }

    keyboard
      .text("🔗 Get Connection Link", "get_connection")
      .row()
      .text("📋 View Plans", "show_plans");
  }

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleShowAccount(ctx: AuthContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await accountCommand(ctx);
}
