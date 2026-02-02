/**
 * Telegram Stars payment handlers
 */

import { eq, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Context } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { plans, subscriptions, payments } from "../../db/schema.js";
import {
  upgradeSubscription,
  type ExistingSubscriptionWithConnections,
} from "../../services/subscription-upgrade.js";

/**
 * Handle plan purchase button click - send invoice
 */
export async function handleBuyPlan(ctx: AuthContext): Promise<void> {
  const match = ctx.callbackQuery?.data?.match(/^buy_(\d+)$/);
  if (!match) {
    await ctx.answerCallbackQuery({ text: "Invalid action" });
    return;
  }

  const planId = parseInt(match[1], 10);

  // Fetch the plan
  const plan = await db.query.plans.findFirst({
    where: and(eq(plans.id, planId), eq(plans.isActive, true)),
  });

  if (!plan) {
    await ctx.answerCallbackQuery({
      text: "This plan is no longer available",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();

  // Build invoice description
  const traffic =
    plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

  const description =
    `${plan.durationDays} days of VPN access\n` +
    `Traffic: ${traffic}\n` +
    `Devices: ${plan.maxDevices}`;

  // Send Telegram Stars invoice
  await ctx.replyWithInvoice(
    `${plan.name} VPN Subscription`, // title
    description, // description
    JSON.stringify({ planId: plan.id }), // payload - we'll parse this later
    "XTR", // currency - XTR is Telegram Stars
    [{ label: plan.name, amount: plan.priceStars }] // prices
  );
}

/**
 * Handle pre-checkout query - validate before payment
 */
export async function handlePreCheckout(ctx: Context): Promise<void> {
  const query = ctx.preCheckoutQuery;
  if (!query) return;

  try {
    // Parse payload
    const payload = JSON.parse(query.invoice_payload) as { planId: number };

    // Verify plan still exists and is active
    const plan = await db.query.plans.findFirst({
      where: and(eq(plans.id, payload.planId), eq(plans.isActive, true)),
    });

    if (!plan) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "This plan is no longer available",
      });
      return;
    }

    // Verify price matches
    if (query.total_amount !== plan.priceStars) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "Price has changed, please try again",
      });
      return;
    }

    // All good - approve the payment
    await ctx.answerPreCheckoutQuery(true);
  } catch {
    await ctx.answerPreCheckoutQuery(false, {
      error_message: "Payment validation failed",
    });
  }
}

/**
 * Handle successful payment - activate subscription or upgrade existing one
 * Note: 3x-ui client is NOT created here for new subscriptions.
 * It's created on-demand when user selects a server via /servers or /connect command.
 * For upgrades, existing 3x-ui clients are updated with new limits.
 */
export async function handleSuccessfulPayment(ctx: AuthContext): Promise<void> {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;

  const userId = ctx.user.id;
  const chargeId = payment.telegram_payment_charge_id;

  try {
    // Idempotency check - prevent duplicate processing from Telegram retries
    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.providerId, chargeId),
    });

    if (existingPayment) {
      // Already processed this payment, just acknowledge
      await ctx.reply(
        "✅ Your subscription is already active!\n\n" +
          "Use /servers to connect to a VPN server."
      );
      return;
    }

    // Parse payload
    const payload = JSON.parse(payment.invoice_payload) as { planId: number };

    // Get plan
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, payload.planId),
    });

    if (!plan) {
      await ctx.reply(
        "Payment received but plan not found. Please contact support."
      );
      return;
    }

    // Check for existing active subscription to determine upgrade vs new purchase
    // Include connections for the upgrade path to avoid a second query
    const existingSubscription =
      (await db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
          gt(subscriptions.expiresAt, new Date())
        ),
        with: { plan: true, connections: true },
      })) as ExistingSubscriptionWithConnections | undefined;

    if (existingSubscription) {
      // UPGRADE PATH - reuse clientUuid, update limits on servers
      // Pass pre-fetched plan and subscription to avoid duplicate queries
      const result = await upgradeSubscription(
        userId,
        plan,
        existingSubscription,
        chargeId,
        String(payment.total_amount)
      );

      const traffic =
        plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

      let upgradeMessage =
        `✅ *Subscription Upgraded!*\n\n` +
        `You've upgraded from *${existingSubscription.plan.name}* to *${plan.name}*.\n\n` +
        `📅 Valid until: ${result.newSubscription.expiresAt.toLocaleDateString()}\n` +
        `📊 Traffic: ${traffic}\n` +
        `📱 Devices: ${plan.maxDevices}\n\n`;

      if (result.transferredConnections > 0) {
        upgradeMessage += `🔗 Your existing VPN connections have been preserved.\n`;
        upgradeMessage += `✨ ${result.updatedServers} server(s) updated with new limits.\n\n`;
      }

      upgradeMessage += `🌍 Use /servers to connect or switch servers.`;

      await ctx.reply(upgradeMessage, { parse_mode: "Markdown" });
    } else {
      // NEW PURCHASE PATH - create new subscription with new clientUuid
      const clientUuid = randomUUID();

      // Calculate expiry
      const startsAt = new Date();
      const expiresAt = new Date(startsAt);
      expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

      // Create subscription in database
      const [subscription] = await db
        .insert(subscriptions)
        .values({
          userId,
          planId: plan.id,
          clientUuid,
          status: "active",
          startsAt,
          expiresAt,
        })
        .returning();

      // Record payment
      await db.insert(payments).values({
        userId,
        subscriptionId: subscription.id,
        amount: String(payment.total_amount),
        currency: "stars",
        status: "completed",
        providerId: payment.telegram_payment_charge_id,
      });

      // Send success message
      const traffic =
        plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

      await ctx.reply(
        `✅ *Payment Successful!*\n\n` +
          `Your *${plan.name}* subscription is now active.\n\n` +
          `📅 Valid until: ${expiresAt.toLocaleDateString()}\n` +
          `📊 Traffic: ${traffic}\n` +
          `📱 Devices: ${plan.maxDevices}\n\n` +
          `🌍 Use /servers to choose a server and get your connection link.`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Failed to process successful payment:", error);
    await ctx.reply(
      "Payment received but there was an error activating your subscription. " +
        "Please contact support with your payment details."
    );
  }
}
