/**
 * Service dependency types for dependency injection
 *
 * These types enable services to be tested without heavy mocking by accepting
 * dependencies as optional parameters with default production values.
 */

import type { Bot } from "grammy";
import type { db } from "../db/index.js";
import type { XuiClient } from "./xui/index.js";
import type { AuthContext } from "../bot/middleware/auth.js";

/** Type alias for the Drizzle database instance - uses typeof to preserve full schema types */
export type Database = typeof db;

/** Factory function to get an XuiClient for a server by ID */
export type XuiClientFactory = (serverId: number) => Promise<XuiClient>;

/** Factory function to get the Telegram bot instance */
export type BotFactory = () => Bot<AuthContext>;

/**
 * Core service dependencies shared by most services
 */
export interface ServiceDependencies {
  db: Database;
  getXuiClient: XuiClientFactory;
}

/**
 * Extended dependencies for cleanup service that also needs the bot
 */
export interface CleanupDependencies extends ServiceDependencies {
  getBot: BotFactory;
}
