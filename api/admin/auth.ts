import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { serialize as serializeCookie } from "cookie";
import { db } from "../../src/db/index.js";
import { users } from "../../src/db/schema.js";
import { signJWT, validateTelegramAuth, generateCsrfToken } from "../../src/lib/jwt.js";
import { methodNotAllowed } from "./middleware.js";
import { createLogger } from "../../src/lib/logger.js";

const log = createLogger({ handler: "admin/auth" });

interface TelegramAuthData {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ success: false, error: "BOT_TOKEN not configured" });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ success: false, error: "JWT_SECRET not configured" });
  }

  // Validate request body
  const authData = req.body as TelegramAuthData;

  if (!authData.id || !authData.auth_date || !authData.hash) {
    return res.status(400).json({
      success: false,
      error: "Missing required Telegram auth fields",
    });
  }

  // Validate Telegram auth hash
  const authRecord: Record<string, string> = {
    id: authData.id,
    auth_date: authData.auth_date,
    hash: authData.hash,
  };

  if (authData.first_name) authRecord.first_name = authData.first_name;
  if (authData.last_name) authRecord.last_name = authData.last_name;
  if (authData.username) authRecord.username = authData.username;
  if (authData.photo_url) authRecord.photo_url = authData.photo_url;

  if (!validateTelegramAuth(authRecord, botToken)) {
    log.warn("Invalid Telegram authentication attempt", {
      telegramId: authData.id,
      username: authData.username,
    });
    return res.status(401).json({
      success: false,
      error: "Invalid Telegram authentication",
    });
  }

  try {
    // Find user in database
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, BigInt(authData.id)),
    });

    if (!user) {
      log.warn("Admin login attempt by unknown user", {
        telegramId: authData.id,
      });
      return res.status(403).json({
        success: false,
        error: "User not found. Please start the bot first.",
      });
    }

    if (!user.isAdmin) {
      log.warn("Admin login attempt by non-admin user", {
        userId: user.id,
        telegramId: authData.id,
        username: user.username,
      });
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
    }

    if (user.isBanned) {
      log.warn("Admin login attempt by banned user", {
        userId: user.id,
        telegramId: authData.id,
      });
      return res.status(403).json({
        success: false,
        error: "Your account has been banned.",
      });
    }

    // Generate JWT token
    const token = signJWT({
      sub: user.id,
      telegramId: String(authData.id),
      isAdmin: true,
    });

    // Generate CSRF token
    const csrfToken = generateCsrfToken();

    // Set CSRF token cookie
    res.setHeader(
      "Set-Cookie",
      serializeCookie("csrf_token", csrfToken, {
        httpOnly: false, // Must be readable by JS for double-submit pattern
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/admin",
        maxAge: 24 * 60 * 60, // 24 hours (matches JWT expiry)
      })
    );

    log.info("Admin login successful", {
      userId: user.id,
      telegramId: authData.id,
      username: user.username,
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        csrfToken,
        user: {
          id: user.id,
          telegramId: authData.id,
          username: user.username,
          firstName: user.firstName,
        },
      },
    });
  } catch (error) {
    log.error("Admin authentication failed", {
      telegramId: authData.id,
    }, error);
    return res.status(500).json({ success: false, error: "Authentication failed" });
  }
}
