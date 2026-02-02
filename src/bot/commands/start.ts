import { InlineKeyboard } from "grammy";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { plans, subscriptions, users } from "../../db/schema.js";

export async function startCommand(ctx: AuthContext): Promise<void> {
  const name = ctx.user.firstName || ctx.user.username || "there";

  // Auto-activate free trial for new users
  let trialActivated = false;
  if (!ctx.user.freeTrialClaimedAt) {
    const trialPlan = await db.query.plans.findFirst({
      where: eq(plans.name, "Free Trial"),
    });

    if (trialPlan) {
      const clientUuid = randomUUID();
      const startsAt = new Date();
      const expiresAt = new Date(startsAt);
      expiresAt.setDate(expiresAt.getDate() + trialPlan.durationDays);

      await db.insert(subscriptions).values({
        userId: ctx.user.id,
        planId: trialPlan.id,
        clientUuid,
        status: "active",
        startsAt,
        expiresAt,
      });

      await db
        .update(users)
        .set({ freeTrialClaimedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));

      trialActivated = true;
    }
  }

  const keyboard = new InlineKeyboard()
    .text("📋 View Plans", "show_plans")
    .row()
    .text("👤 My Account", "show_account")
    .row()
    .text("🌍 Server Locations", "show_servers")
    .row()
    .text("❓ Help & Support", "show_support");

  const welcomeMessage = trialActivated
    ? `Welcome, ${name}! 👋\n\n` +
      `🎉 *Your 7-day free trial is now active!*\n\n` +
      `You have access to:\n` +
      `• All server locations\n` +
      `• Up to 5 devices\n` +
      `• Unlimited traffic\n\n` +
      `Tap "Server Locations" below to connect and start using your VPN!`
    : `Welcome, ${name}! 👋\n\n` +
      `This bot provides fast and secure VPN access using the VLESS Reality protocol.\n\n` +
      `🔒 *Features:*\n` +
      `• Undetectable by censorship systems\n` +
      `• Multiple server locations\n` +
      `• Pay with Telegram Stars or TON\n` +
      `• Up to 3 devices per subscription\n\n` +
      `Use the buttons below to get started:`;

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
