/**
 * Subscription cleanup service
 * Handles automatic expiration of subscriptions and 3x-ui client cleanup
 */

import { and, eq, lt } from "drizzle-orm";
import { subscriptions, userConnections } from "../db/schema.js";
import { XuiNotFoundError, XuiError } from "./xui/errors.js";
import { defaultCleanupDependencies } from "./dependencies.js";
import type { CleanupDependencies } from "./types.js";

export interface CleanupStats {
  processed: number;
  failed: number;
  clientsDeleted: number;
  notificationsSent: number;
}

export interface CleanupResult {
  success: boolean;
  stats: CleanupStats;
  errors: string[];
}

/**
 * Find and process all expired subscriptions
 * - Deletes 3x-ui clients from all connected servers
 * - Updates subscription status to 'expired'
 * - Sends expiry notification to users via Telegram
 *
 * @param deps - Optional dependencies for testing
 */
export async function cleanupExpiredSubscriptions(
  deps: CleanupDependencies = defaultCleanupDependencies
): Promise<CleanupResult> {
  const { db, getXuiClient, getBot } = deps;

  const stats: CleanupStats = {
    processed: 0,
    failed: 0,
    clientsDeleted: 0,
    notificationsSent: 0,
  };
  const errors: string[] = [];

  // Find all expired active subscriptions
  const expiredSubscriptions = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, "active"),
      lt(subscriptions.expiresAt, new Date())
    ),
    with: {
      user: true,
      connections: {
        with: { server: true },
      },
    },
  });

  console.log(`Found ${expiredSubscriptions.length} expired subscriptions`);

  for (const subscription of expiredSubscriptions) {
    try {
      // Delete clients from all connected servers
      for (const connection of subscription.connections) {
        try {
          const xuiClient = await getXuiClient(connection.serverId);
          await xuiClient.deleteClient(subscription.clientUuid);
          stats.clientsDeleted++;
          console.log(
            `Deleted client ${subscription.clientUuid} from server ${connection.serverId}`
          );
        } catch (error) {
          // Client may not exist on server (already deleted manually, etc.)
          if (error instanceof XuiNotFoundError) {
            console.log(
              `Client ${subscription.clientUuid} not found on server ${connection.serverId} (already deleted?)`
            );
          } else if (error instanceof XuiError) {
            const msg = `Failed to delete client from server ${connection.serverId}: ${error.message}`;
            console.error(msg);
            errors.push(msg);
            // Continue with other servers
          } else {
            throw error;
          }
        }
      }

      // Delete userConnections records
      if (subscription.connections.length > 0) {
        await db
          .delete(userConnections)
          .where(eq(userConnections.subscriptionId, subscription.id));
        console.log(
          `Deleted ${subscription.connections.length} connection records for subscription ${subscription.id}`
        );
      }

      // Update subscription status to expired
      await db
        .update(subscriptions)
        .set({ status: "expired" })
        .where(eq(subscriptions.id, subscription.id));

      // Send notification to user
      try {
        const bot = getBot();
        await bot.api.sendMessage(
          subscription.user.telegramId.toString(),
          "⚠️ Your VPN subscription has expired.\n\n" +
            "Your access to all servers has been deactivated.\n\n" +
            "Use /subscribe to renew your subscription and continue using the VPN."
        );
        stats.notificationsSent++;
      } catch (error) {
        // User may have blocked the bot or deleted their account
        const msg = `Failed to notify user ${subscription.user.telegramId}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(msg);
        errors.push(msg);
        // Don't fail the whole process for notification errors
      }

      stats.processed++;
      console.log(
        `Successfully processed subscription ${subscription.id} for user ${subscription.user.telegramId}`
      );
    } catch (error) {
      stats.failed++;
      const msg = `Failed to process subscription ${subscription.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(msg);
      errors.push(msg);
      // Continue processing other subscriptions
    }
  }

  return {
    success: stats.failed === 0,
    stats,
    errors,
  };
}
