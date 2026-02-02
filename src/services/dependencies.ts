/**
 * Default production dependencies for services
 *
 * This module provides the default implementations used at runtime.
 * Services accept these as optional parameters, defaulting to these values.
 */

import { db } from "../db/index.js";
import { getXuiClientForServer } from "./xui/repository.js";
import { getBot } from "../bot/index.js";
import type { ServiceDependencies, CleanupDependencies } from "./types.js";

/**
 * Default dependencies for core services (traffic-sync, subscription-upgrade)
 */
export const defaultDependencies: ServiceDependencies = {
  db,
  getXuiClient: getXuiClientForServer,
};

/**
 * Default dependencies for cleanup service (includes bot)
 */
export const defaultCleanupDependencies: CleanupDependencies = {
  db,
  getXuiClient: getXuiClientForServer,
  getBot,
};
