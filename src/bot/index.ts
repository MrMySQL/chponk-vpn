import { Bot } from "grammy";
import { authMiddleware, AuthContext } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { subscribeCommand, handleShowPlans } from "./commands/subscribe.js";
import { accountCommand, handleShowAccount } from "./commands/account.js";

export function createBot(token: string): Bot<AuthContext> {
  const bot = new Bot<AuthContext>(token);

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
  bot.callbackQuery(/^buy_(\d+)$/, async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery({
      text: `Payment for plan ${planId} coming soon!`,
      show_alert: true,
    });
  });

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
    const token = process.env.BOT_TOKEN;
    if (!token) {
      throw new Error("BOT_TOKEN environment variable is not set");
    }
    botInstance = createBot(token);
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
