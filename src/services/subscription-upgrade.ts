/**
 * Subscription Upgrade Service
 *
 * Handles upgrading existing subscriptions while preserving VPN connections.
 * When a user upgrades, we:
 * 1. Reuse the same clientUuid so existing VPN configs continue working
 * 2. Transfer connections from old subscription to new one
 * 3. Update 3x-ui clients on all servers with new limits
 * 4. Cancel the old subscription
 */

import { eq, and, gt } from "drizzle-orm";
import {
  subscriptions,
  userConnections,
  payments,
  type Subscription,
  type Plan,
  type UserConnection,
} from "../db/schema.js";
import { defaultDependencies } from "./dependencies.js";
import type { ServiceDependencies } from "./types.js";

export interface UpgradeResult {
  newSubscription: Subscription;
  transferredConnections: number;
  updatedServers: number;
  failedServers: number;
}

export interface ExistingSubscriptionWithConnections extends Subscription {
  plan: Plan;
  connections: UserConnection[];
}

/**
 * Upgrade an existing subscription to a new plan.
 * Preserves the clientUuid so VPN configs continue working.
 *
 * @param userId - The user's ID
 * @param newPlan - The new plan to upgrade to (pre-fetched to avoid duplicate query)
 * @param existingSubscription - The existing subscription with connections (pre-fetched)
 * @param paymentChargeId - Telegram payment charge ID
 * @param paymentAmount - Payment amount in stars
 * @param deps - Optional dependencies for testing
 */
export async function upgradeSubscription(
  userId: number,
  newPlan: Plan,
  existingSubscription: ExistingSubscriptionWithConnections,
  paymentChargeId: string,
  paymentAmount: string,
  deps: ServiceDependencies = defaultDependencies
): Promise<UpgradeResult> {
  const { db, getXuiClient } = deps;

  // Calculate new expiry - extend from current expiry to reward early upgraders
  const newExpiresAt = new Date(existingSubscription.expiresAt);
  newExpiresAt.setDate(newExpiresAt.getDate() + newPlan.durationDays);

  // Create new subscription with SAME clientUuid
  const [newSubscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: newPlan.id,
      clientUuid: existingSubscription.clientUuid, // Preserve UUID!
      status: "active",
      startsAt: new Date(),
      expiresAt: newExpiresAt,
      trafficUsedBytes: BigInt(0), // Reset traffic for new plan
    })
    .returning();

  // Record payment for new subscription
  await db.insert(payments).values({
    userId,
    subscriptionId: newSubscription.id,
    amount: paymentAmount,
    currency: "stars",
    status: "completed",
    providerId: paymentChargeId,
  });

  // Transfer connections from old subscription to new subscription
  const connections = existingSubscription.connections;
  if (connections.length > 0) {
    await db
      .update(userConnections)
      .set({ subscriptionId: newSubscription.id })
      .where(eq(userConnections.subscriptionId, existingSubscription.id));
  }

  // Update 3x-ui clients on all servers with new limits
  let updatedServers = 0;
  let failedServers = 0;

  for (const connection of connections) {
    try {
      const xuiClient = await getXuiClient(connection.serverId);

      await xuiClient.updateClient(existingSubscription.clientUuid, {
        totalGB: newPlan.trafficLimitGb ?? 0,
        expiryTime: newExpiresAt.getTime(),
        limitIp: newPlan.maxDevices,
      });

      updatedServers++;
    } catch (error) {
      console.error(
        `Failed to update 3x-ui client on server ${connection.serverId}:`,
        error
      );
      failedServers++;
      // Continue with other servers - connection still works (UUID unchanged)
    }
  }

  // Cancel old subscription
  await db
    .update(subscriptions)
    .set({ status: "cancelled" })
    .where(eq(subscriptions.id, existingSubscription.id));

  return {
    newSubscription,
    transferredConnections: connections.length,
    updatedServers,
    failedServers,
  };
}

/**
 * Check if a user has an active subscription that can be upgraded
 *
 * @param userId - The user's ID
 * @param deps - Optional dependencies for testing
 */
export async function hasUpgradeableSubscription(
  userId: number,
  deps: Pick<ServiceDependencies, "db"> = defaultDependencies
): Promise<boolean> {
  const { db } = deps;

  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active"),
      gt(subscriptions.expiresAt, new Date())
    ),
  });

  return subscription !== null;
}
