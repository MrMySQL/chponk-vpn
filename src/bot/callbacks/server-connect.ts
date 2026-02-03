/**
 * Server connection callback handlers
 * Handles on-demand 3x-ui client creation when user selects a server
 */

import { eq, and, gt } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import {
  servers,
  subscriptions,
  userConnections,
  plans,
} from "../../db/schema.js";
import {
  getXuiClientForServer,
  generateClientEmail,
} from "../../services/xui/repository.js";
import { generateVlessUrlForServer } from "../../services/config-generator.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger({ module: "bot-server-connect" });

/**
 * Handle server selection - create 3x-ui client if needed and return config
 */
export async function handleServerConnect(ctx: AuthContext): Promise<void> {
  const match = ctx.callbackQuery?.data?.match(/^connect_(\d+)$/);
  if (!match) {
    await ctx.answerCallbackQuery({ text: "Invalid action" });
    return;
  }

  const serverId = parseInt(match[1], 10);

  log.info("User connecting to server", {
    userId: ctx.user.id,
    serverId,
  });

  // Get user's active subscription with plan
  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, ctx.user.id),
      eq(subscriptions.status, "active"),
      gt(subscriptions.expiresAt, new Date())
    ),
    with: {
      plan: true,
    },
  });

  if (!subscription) {
    log.info("User has no active subscription", {
      userId: ctx.user.id,
    });
    await ctx.answerCallbackQuery({
      text: "No active subscription. Use /subscribe to purchase a plan.",
      show_alert: true,
    });
    return;
  }

  // Get the server
  const server = await db.query.servers.findFirst({
    where: and(eq(servers.id, serverId), eq(servers.isActive, true)),
  });

  if (!server) {
    await ctx.answerCallbackQuery({
      text: "This server is no longer available.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Generating your connection..." });

  try {
    // Check if user already has a connection to this server
    let connection = await db.query.userConnections.findFirst({
      where: and(
        eq(userConnections.subscriptionId, subscription.id),
        eq(userConnections.serverId, serverId)
      ),
    });

    // If no existing connection, create client in 3x-ui and save connection
    if (!connection) {
      log.info("Creating new 3x-ui client for server", {
        userId: ctx.user.id,
        serverId,
        subscriptionId: subscription.id,
        clientUuid: subscription.clientUuid,
      });

      const clientEmail = generateClientEmail(ctx.user.id);

      // Add client to 3x-ui panel
      const xuiClient = await getXuiClientForServer(serverId);

      // Calculate traffic limit in bytes (0 = unlimited)
      const totalGB = subscription.plan.trafficLimitGb ?? 0;

      await xuiClient.addClient({
        uuid: subscription.clientUuid,
        email: clientEmail,
        totalGB,
        expiryTime: subscription.expiresAt.getTime(),
        limitIp: subscription.plan.maxDevices,
      });

      // Save connection to database
      const [newConnection] = await db
        .insert(userConnections)
        .values({
          subscriptionId: subscription.id,
          serverId: serverId,
          xuiClientEmail: clientEmail,
        })
        .returning();

      connection = newConnection;

      log.info("3x-ui client created and connection saved", {
        userId: ctx.user.id,
        serverId,
        connectionId: connection.id,
      });
    } else {
      log.debug("Using existing connection", {
        userId: ctx.user.id,
        serverId,
        connectionId: connection.id,
      });
    }

    // Generate VLESS URL
    const vlessUrl = generateVlessUrlForServer(server, subscription.clientUuid);

    // Format expiry date
    const expiresAt = subscription.expiresAt;
    const daysLeft = Math.ceil(
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Send connection details
    const flag = server.flagEmoji || "🌐";
    const message =
      `${flag} *${server.name}*\n\n` +
      `📍 Location: ${server.location}\n` +
      `📅 Expires: ${expiresAt.toLocaleDateString()} (${daysLeft} days)\n\n` +
      `*Your VLESS Config:*\n` +
      `\`\`\`\n${vlessUrl}\n\`\`\`\n\n` +
      `*How to connect:*\n` +
      `1. Copy the config above\n` +
      `2. Open your VPN app:\n` +
      `   • iOS: Streisand, V2Box\n` +
      `   • Android: V2rayNG, NekoBox\n` +
      `   • Windows/Mac: V2rayN, Nekoray\n` +
      `3. Add config from clipboard\n` +
      `4. Connect!\n\n` +
      `_Use /servers to switch to a different location._`;

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    log.error("Failed to generate connection", {
      userId: ctx.user.id,
      serverId,
      subscriptionId: subscription?.id,
    }, error);
    await ctx.reply(
      "❌ Failed to generate your connection. Please try again or contact support."
    );
  }
}

/**
 * Handle "Get Connection Link" button from account page
 * Shows server list for users with active subscription
 */
export async function handleGetConnection(ctx: AuthContext): Promise<void> {
  await ctx.answerCallbackQuery();

  // Import dynamically to avoid circular dependency
  const { serversCommand } = await import("../commands/servers.js");
  await serversCommand(ctx);
}
