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

import { eq, and, gt, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  subscriptions,
  userConnections,
  payments,
  plans,
  type Subscription,
  type Plan,
  type UserConnection,
} from "../db/schema.js";
import { getXuiClientForServer } from "./xui/repository.js";

export interface UpgradeResult {
  newSubscription: Subscription;
  transferredConnections: number;
  updatedServers: number;
  failedServers: number;
}

interface ExistingSubscriptionWithConnections extends Subscription {
  plan: Plan;
  connections: UserConnection[];
}

/**
 * Upgrade an existing subscription to a new plan.
 * Preserves the clientUuid so VPN configs continue working.
 */
export async function upgradeSubscription(
  userId: number,
  newPlanId: number,
  paymentChargeId: string,
  paymentAmount: string
): Promise<UpgradeResult> {
  // Find existing active subscription with connections
  const existingSubscription =
    (await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        gt(subscriptions.expiresAt, new Date())
      ),
      with: {
        plan: true,
        connections: true,
      },
      orderBy: [desc(subscriptions.createdAt)],
    })) as ExistingSubscriptionWithConnections | undefined;

  if (!existingSubscription) {
    throw new Error("No active subscription found to upgrade");
  }

  // Get the new plan
  const newPlan = await db.query.plans.findFirst({
    where: eq(plans.id, newPlanId),
  });

  if (!newPlan) {
    throw new Error("New plan not found");
  }

  // Calculate new expiry - extend from current expiry to reward early upgraders
  const newExpiresAt = new Date(existingSubscription.expiresAt);
  newExpiresAt.setDate(newExpiresAt.getDate() + newPlan.durationDays);

  // Create new subscription with SAME clientUuid
  const [newSubscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: newPlanId,
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
      const xuiClient = await getXuiClientForServer(connection.serverId);

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
 */
export async function hasUpgradeableSubscription(
  userId: number
): Promise<boolean> {
  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active"),
      gt(subscriptions.expiresAt, new Date())
    ),
  });

  return subscription !== null;
}
