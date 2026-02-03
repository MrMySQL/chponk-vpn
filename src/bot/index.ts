import { Bot, type BotConfig } from "grammy";
import { authMiddleware, AuthContext } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { subscribeCommand, handleShowPlans } from "./commands/subscribe.js";
import { accountCommand, handleShowAccount } from "./commands/account.js";
import {
  serversCommand,
  connectCommand,
  handleShowServers,
} from "./commands/servers.js";
import {
  handleBuyPlan,
  handlePreCheckout,
  handleSuccessfulPayment,
} from "./callbacks/payment.js";
import {
  handleServerConnect,
  handleGetConnection,
} from "./callbacks/server-connect.js";
import { handleRefreshTraffic } from "./callbacks/account.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger({ module: "bot" });

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

  log.info("Creating bot instance", {
    useTestEnv: options.useTestEnv ?? false,
  });

  const bot = new Bot<AuthContext>(token, config);

  // Register middleware
  bot.use(authMiddleware);

  // Register commands
  bot.command("start", startCommand);
  bot.command("subscribe", subscribeCommand);
  bot.command("account", accountCommand);
  bot.command("servers", serversCommand);
  bot.command("connect", connectCommand);

  // Register callback handlers
  bot.callbackQuery("show_plans", handleShowPlans);
  bot.callbackQuery("show_account", handleShowAccount);
  bot.callbackQuery("show_servers", handleShowServers);
  bot.callbackQuery("get_connection", handleGetConnection);

  // Handle server connection callbacks (connect_{serverId})
  bot.callbackQuery(/^connect_(\d+)$/, handleServerConnect);

  // Handle traffic refresh callbacks (refresh_traffic_{subscriptionId})
  bot.callbackQuery(/^refresh_traffic_(\d+)$/, handleRefreshTraffic);

  // Support handler
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

  // Handle plan purchase callbacks
  bot.callbackQuery(/^buy_(\d+)$/, handleBuyPlan);

  // Handle Telegram Stars payment flow
  bot.on("pre_checkout_query", handlePreCheckout);
  bot.on("message:successful_payment", handleSuccessfulPayment);

  // Handle unknown callbacks
  bot.on("callback_query:data", async (ctx) => {
    log.warn("Unknown callback query", {
      data: ctx.callbackQuery.data,
      userId: ctx.from?.id,
    });
    await ctx.answerCallbackQuery({
      text: "Unknown action",
    });
  });

  log.info("Bot created and handlers registered");

  return bot;
}

// Singleton instance for serverless
let botInstance: Bot<AuthContext> | null = null;
let initPromise: Promise<void> | null = null;

export function getBot(): Bot<AuthContext> {
  if (!botInstance) {
    const useTestEnv = process.env.TELEGRAM_TEST_ENV === "true";

    // Use test token when test environment is enabled, otherwise use production token
    const token = useTestEnv
      ? process.env.TEST_BOT_TOKEN
      : process.env.BOT_TOKEN;

    if (!token) {
      log.error("Bot token not configured", { useTestEnv });
      throw new Error(
        useTestEnv
          ? "TEST_BOT_TOKEN environment variable is not set (required when TELEGRAM_TEST_ENV=true)"
          : "BOT_TOKEN environment variable is not set"
      );
    }

    log.info("Creating bot singleton", { useTestEnv });
    botInstance = createBot(token, { useTestEnv });
  }
  return botInstance;
}

export async function initBot(): Promise<Bot<AuthContext>> {
  const bot = getBot();
  if (!initPromise) {
    log.info("Initializing bot");
    initPromise = bot.init();
  }
  await initPromise;
  log.debug("Bot initialized");
  return bot;
}
