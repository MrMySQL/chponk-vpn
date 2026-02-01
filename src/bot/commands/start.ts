import { InlineKeyboard } from "grammy";
import { AuthContext } from "../middleware/auth.js";

export async function startCommand(ctx: AuthContext): Promise<void> {
  const name = ctx.user.firstName || ctx.user.username || "there";

  const keyboard = new InlineKeyboard()
    .text("📋 View Plans", "show_plans")
    .row()
    .text("👤 My Account", "show_account")
    .row()
    .text("🌍 Server Locations", "show_servers")
    .row()
    .text("❓ Help & Support", "show_support");

  await ctx.reply(
    `Welcome, ${name}! 👋\n\n` +
      `This bot provides fast and secure VPN access using the VLESS Reality protocol.\n\n` +
      `🔒 *Features:*\n` +
      `• Undetectable by censorship systems\n` +
      `• Multiple server locations\n` +
      `• Pay with Telegram Stars or TON\n` +
      `• Up to 3 devices per subscription\n\n` +
      `Use the buttons below to get started:`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
}
