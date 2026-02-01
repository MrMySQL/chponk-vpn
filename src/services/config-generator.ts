/**
 * VLESS Reality configuration URL generator
 */

import type { Server } from "../db/schema";

/** Error class for config generation failures */
export class ConfigGeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigGeneratorError";
  }
}

export interface VlessRealityConfig {
  uuid: string;
  domain: string;
  port: number;
  sni: string;
  publicKey: string;
  shortId: string;
  serverName: string;
  fingerprint?: "chrome" | "firefox" | "safari" | "edge";
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a VLESS Reality subscription URL from config
 *
 * Format:
 * vless://{uuid}@{domain}:{port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni={sni}&fp={fingerprint}&pbk={publicKey}&sid={shortId}&type=tcp#{serverName}
 */
export function generateVlessRealityUrl(config: VlessRealityConfig): string {
  // Validate UUID format
  if (!UUID_REGEX.test(config.uuid)) {
    throw new ConfigGeneratorError(
      `Invalid UUID format: ${config.uuid}. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
    );
  }

  // Validate domain
  if (!config.domain || config.domain.trim() === "") {
    throw new ConfigGeneratorError("Domain is required");
  }

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    throw new ConfigGeneratorError(
      `Invalid port: ${config.port}. Must be between 1 and 65535`
    );
  }

  // Validate required fields
  if (!config.sni || config.sni.trim() === "") {
    throw new ConfigGeneratorError("SNI is required");
  }

  if (!config.publicKey || config.publicKey.trim() === "") {
    throw new ConfigGeneratorError("Public key is required");
  }

  if (!config.shortId || config.shortId.trim() === "") {
    throw new ConfigGeneratorError("Short ID is required");
  }

  const fingerprint = config.fingerprint ?? "chrome";

  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: config.sni,
    fp: fingerprint,
    pbk: config.publicKey,
    sid: config.shortId,
    type: "tcp",
  });

  const fragment = encodeURIComponent(config.serverName);

  return `vless://${config.uuid}@${config.domain}:${config.port}?${params.toString()}#${fragment}`;
}

/**
 * Generates a VLESS Reality URL for a server database record
 */
export function generateVlessUrlForServer(server: Server, uuid: string): string {
  if (!server.realityPublicKey) {
    throw new ConfigGeneratorError(
      `Server "${server.name}" is missing realityPublicKey`
    );
  }

  if (!server.realityShortId) {
    throw new ConfigGeneratorError(
      `Server "${server.name}" is missing realityShortId`
    );
  }

  return generateVlessRealityUrl({
    uuid,
    domain: server.domain,
    port: server.realityPort,
    sni: server.realitySni,
    publicKey: server.realityPublicKey,
    shortId: server.realityShortId,
    serverName: `${server.name} ${server.flagEmoji || ""}`.trim(),
  });
}
