/**
 * Telegram Stars payment handlers
 */

import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Context } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { plans, subscriptions, payments, servers } from "../../db/schema.js";
import {
  getXuiClientForServer,
  generateClientEmail,
} from "../../services/xui/repository.js";

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

    // Check if there's an active server available
    const activeServer = await db.query.servers.findFirst({
      where: eq(servers.isActive, true),
    });

    if (!activeServer) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: "No servers available at the moment",
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
 * Handle successful payment - activate subscription
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
          "Use /account to view your subscription details."
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

    // Get an active server (for now, just pick the first one)
    const server = await db.query.servers.findFirst({
      where: eq(servers.isActive, true),
    });

    if (!server) {
      await ctx.reply(
        "Payment received but no servers available. Please contact support for a refund."
      );
      return;
    }

    // Generate client UUID
    const clientUuid = randomUUID();
    const clientEmail = generateClientEmail(userId);

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

    // Add client to 3x-ui panel
    try {
      const xuiClient = await getXuiClientForServer(server.id);

      // Calculate traffic limit in bytes (0 = unlimited)
      const totalGB = plan.trafficLimitGb ?? 0;

      await xuiClient.addClient({
        uuid: clientUuid,
        email: clientEmail,
        totalGB,
        expiryTime: expiresAt.getTime(),
        limitIp: plan.maxDevices,
      });
    } catch (xuiError) {
      console.error("Failed to add client to 3x-ui:", xuiError);
      // Don't fail the whole flow - subscription is created, can be fixed manually
    }

    // Send success message
    const traffic =
      plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

    await ctx.reply(
      `✅ *Payment Successful!*\n\n` +
        `Your *${plan.name}* subscription is now active.\n\n` +
        `📅 Valid until: ${expiresAt.toLocaleDateString()}\n` +
        `📊 Traffic: ${traffic}\n` +
        `📱 Devices: ${plan.maxDevices}\n\n` +
        `Use /account to view your subscription and get your connection link.`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Failed to process successful payment:", error);
    await ctx.reply(
      "Payment received but there was an error activating your subscription. " +
        "Please contact support with your payment details."
    );
  }
}
