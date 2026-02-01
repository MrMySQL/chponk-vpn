/**
 * /servers and /connect commands - list servers and get connection configs
 */

import { InlineKeyboard } from "grammy";
import { eq, and, gt } from "drizzle-orm";
import { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { servers, subscriptions } from "../../db/schema.js";

/**
 * Get user's active subscription
 */
async function getActiveSubscription(userId: number) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active"),
      gt(subscriptions.expiresAt, new Date())
    ),
    with: {
      plan: true,
    },
  });
}

/**
 * /servers command - list all available servers
 */
export async function serversCommand(ctx: AuthContext): Promise<void> {
  // Check for active subscription
  const subscription = await getActiveSubscription(ctx.user.id);

  if (!subscription) {
    await ctx.reply(
      "❌ *No Active Subscription*\n\n" +
        "You need an active subscription to connect to servers.\n\n" +
        "Use /subscribe to purchase a plan.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Get all active servers
  const activeServers = await db.query.servers.findMany({
    where: eq(servers.isActive, true),
    orderBy: (servers, { asc }) => [asc(servers.location)],
  });

  if (activeServers.length === 0) {
    await ctx.reply(
      "⚠️ *No Servers Available*\n\n" +
        "There are no servers available at the moment. Please try again later.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Build server list with inline keyboard
  let message = "🌍 *Available Servers*\n\n";
  message += "Select a server to get your connection link:\n\n";

  const keyboard = new InlineKeyboard();

  for (const server of activeServers) {
    const flag = server.flagEmoji || "🌐";
    message += `${flag} *${server.name}* - ${server.location}\n`;
    keyboard.text(`${flag} ${server.name}`, `connect_${server.id}`).row();
  }

  message += "\n_Tap a server to get your VLESS config._";

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * /connect command - alias for /servers
 */
export async function connectCommand(ctx: AuthContext): Promise<void> {
  await serversCommand(ctx);
}

/**
 * Callback handler for showing servers list
 */
export async function handleShowServers(ctx: AuthContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await serversCommand(ctx);
}
