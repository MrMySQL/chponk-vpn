import { Context, NextFunction } from "grammy";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger.js";

const log = createLogger({ module: "bot-auth" });

export interface AuthContext extends Context {
  user: {
    id: number;
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    languageCode: string;
    isAdmin: boolean;
    isBanned: boolean;
    freeTrialClaimedAt: Date | null;
  };
}

export async function authMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  if (!ctx.from) {
    log.debug("No 'from' field in context, skipping auth");
    return;
  }

  const telegramId = BigInt(ctx.from.id);

  // Find or create user
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (!user) {
    // Create new user
    log.info("Creating new user", {
      telegramId: telegramId.toString(),
      username: ctx.from.username,
    });
    [user] = await db
      .insert(users)
      .values({
        telegramId,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        languageCode: ctx.from.language_code ?? "en",
      })
      .returning();
  } else {
    // Update user info if changed
    const needsUpdate =
      user.username !== (ctx.from.username ?? null) ||
      user.firstName !== (ctx.from.first_name ?? null);

    if (needsUpdate) {
      await db
        .update(users)
        .set({
          username: ctx.from.username ?? null,
          firstName: ctx.from.first_name ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }
  }

  // Check if banned
  if (user.isBanned) {
    log.warn("Banned user attempted to use bot", {
      userId: user.id,
      telegramId: telegramId.toString(),
    });
    await ctx.reply("Your account has been suspended.");
    return;
  }

  // Attach user to context
  (ctx as AuthContext).user = {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    languageCode: user.languageCode,
    isAdmin: user.isAdmin,
    isBanned: user.isBanned,
    freeTrialClaimedAt: user.freeTrialClaimedAt,
  };

  await next();
}
