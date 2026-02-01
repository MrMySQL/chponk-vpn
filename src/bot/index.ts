import { Bot, type BotConfig } from "grammy";
import { authMiddleware, AuthContext } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { subscribeCommand, handleShowPlans } from "./commands/subscribe.js";
import { accountCommand, handleShowAccount } from "./commands/account.js";
import {
  handleBuyPlan,
  handlePreCheckout,
  handleSuccessfulPayment,
} from "./callbacks/payment.js";

interface BotOptions {
  useTestEnv?: boolean;
}

export function createBot(
  token: string,
  options: BotOptions = {}
): Bot<AuthContext> {
  const config: BotConfig<AuthContext> = {};

  // Use Telegram's test environment if specified
  // Note: Test environment requires a bot created via @BotFather in the test Telegram app
  if (options.useTestEnv) {
    config.client = {
      environment: "test",
    };
  }

  const bot = new Bot<AuthContext>(token, config);

  // Register middleware
  bot.use(authMiddleware);

  // Register commands
  bot.command("start", startCommand);
  bot.command("subscribe", subscribeCommand);
  bot.command("account", accountCommand);

  // Register callback handlers
  bot.callbackQuery("show_plans", handleShowPlans);
  bot.callbackQuery("show_account", handleShowAccount);

  // Placeholder handlers for features to be implemented
  bot.callbackQuery("show_servers", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "Server list coming soon!",
      show_alert: true,
    });
  });

  bot.callbackQuery("show_support", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "❓ *Help & Support*\n\n" +
        "If you have any issues or questions:\n\n" +
        "1. Make sure you're using a compatible VPN client\n" +
        "   • iOS: Streisand, V2Box\n" +
        "   • Android: V2rayNG, NekoBox\n" +
        "   • Windows/Mac: V2rayN, Nekoray\n\n" +
        "2. Try switching to a different server location\n\n" +
        "3. Contact support: @your_support_username",
      { parse_mode: "Markdown" }
    );
  });

  bot.callbackQuery("get_connection", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "Connection link generation coming soon!",
      show_alert: true,
    });
  });

  // Handle plan purchase callbacks
  bot.callbackQuery(/^buy_(\d+)$/, handleBuyPlan);

  // Handle Telegram Stars payment flow
  bot.on("pre_checkout_query", handlePreCheckout);
  bot.on("message:successful_payment", handleSuccessfulPayment);

  // Handle unknown callbacks
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "Unknown action",
    });
  });

  return bot;
}

// Singleton instance for serverless
let botInstance: Bot<AuthContext> | null = null;
let initPromise: Promise<void> | null = null;

export function getBot(): Bot<AuthContext> {
  if (!botInstance) {
    const useTestEnv = process.env.TELEGRAM_TEST_ENV === "true";

    // Use test token if available and in development, otherwise use production token
    const token =
      process.env.NODE_ENV !== "production" && process.env.TEST_BOT_TOKEN
        ? process.env.TEST_BOT_TOKEN
        : process.env.BOT_TOKEN;

    if (!token) {
      throw new Error(
        "BOT_TOKEN (or TEST_BOT_TOKEN in development) environment variable is not set"
      );
    }
    botInstance = createBot(token, { useTestEnv });
  }
  return botInstance;
}

export async function initBot(): Promise<Bot<AuthContext>> {
  const bot = getBot();
  if (!initPromise) {
    initPromise = bot.init();
  }
  await initPromise;
  return bot;
}
