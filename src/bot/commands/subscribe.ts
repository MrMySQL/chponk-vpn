import { InlineKeyboard } from "grammy";
import { AuthContext } from "../middleware/auth.js";
import { db } from "../../db/index.js";
import { plans } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger({ module: "bot-subscribe" });

export async function subscribeCommand(ctx: AuthContext): Promise<void> {
  log.debug("User viewing subscription plans", { userId: ctx.user.id });

  let activePlans;
  try {
    activePlans = await db
      .select()
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(plans.durationDays);
  } catch (error) {
    log.error("Failed to fetch plans", { userId: ctx.user.id }, error);
    await ctx.reply("Failed to load plans. Please try again later.");
    return;
  }

  if (activePlans.length === 0) {
    log.warn("No active plans found in database");
    await ctx.reply(
      "No subscription plans are currently available. Please check back later."
    );
    return;
  }

  let message = "📋 *Available Plans*\n\n";

  const keyboard = new InlineKeyboard();

  for (const plan of activePlans) {
    const traffic =
      plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

    message +=
      `*${plan.name}*\n` +
      `├ Duration: ${plan.durationDays} days\n` +
      `├ Traffic: ${traffic}\n` +
      `├ Devices: ${plan.maxDevices}\n` +
      `└ Price: ⭐ ${plan.priceStars} Stars | 💎 ${plan.priceTon} TON\n\n`;

    keyboard.text(`${plan.name} - ⭐${plan.priceStars}`, `buy_${plan.id}`).row();
  }

  message += "_Select a plan to purchase:_";

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleShowPlans(ctx: AuthContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await subscribeCommand(ctx);
}
