/**
 * 3x-ui Panel API Client
 *
 * High-level client for managing VPN clients on 3x-ui panel.
 */

import { randomUUID } from "crypto";
import { XuiHttpClient } from "./client.js";
import {
  XuiNotFoundError,
  XuiValidationError,
  XuiError,
  XuiAuthError,
  XuiNetworkError,
  XuiApiError,
} from "./errors.js";
import type {
  XuiServerConfig,
  XuiClient as XuiClientType,
  ClientTraffic,
  AddClientOptions,
  Inbound,
  InboundSettings,
  InboundStats,
} from "./types.js";

// Re-export types and errors
export * from "./types.js";
export * from "./errors.js";

export class XuiClient {
  private readonly http: XuiHttpClient;
  private readonly inboundId: number;

  constructor(config: XuiServerConfig) {
    this.http = new XuiHttpClient(config);
    this.inboundId = config.inboundId;
  }

  /**
   * Explicitly authenticate with the panel
   * Usually not needed as requests auto-authenticate
   */
  async login(): Promise<void> {
    await this.http.login();
  }

  // ==================== Client Management ====================

  /**
   * Add a new client to the inbound
   */
  async addClient(options: AddClientOptions): Promise<string> {
    if (!options.email) {
      throw new XuiValidationError("Email is required", "email");
    }

    const uuid = options.uuid || randomUUID();

    const totalGB = options.totalGB ?? 0;
    // Convert GB to bytes - totalGB field in 3x-ui is actually in bytes despite the name
    const totalBytes = totalGB > 0 ? totalGB * 1024 * 1024 * 1024 : 0;

    const client: Record<string, unknown> = {
      id: uuid,
      email: options.email,
      flow: options.flow || "xtls-rprx-vision",
      limitIp: options.limitIp ?? 0,
      totalGB: totalBytes,
      expiryTime: options.expiryTime ?? 0,
      enable: options.enable ?? true,
      tgId: options.tgId || "",
      subId: options.subId || "",
      reset: 0,
    };

    await this.http.post(`/panel/api/inbounds/addClient`, {
      id: this.inboundId,
      settings: JSON.stringify({ clients: [client] }),
    });

    return uuid;
  }

  /**
   * Delete a client by UUID
   */
  async deleteClient(uuid: string): Promise<void> {
    if (!uuid) {
      throw new XuiValidationError("UUID is required", "uuid");
    }

    await this.http.post(
      `/panel/api/inbounds/${this.inboundId}/delClient/${uuid}`
    );
  }

  /**
   * Update an existing client
   */
  async updateClient(
    uuid: string,
    updates: Partial<Omit<AddClientOptions, "uuid">>
  ): Promise<void> {
    if (!uuid) {
      throw new XuiValidationError("UUID is required", "uuid");
    }

    // First get the current client
    const clients = await this.listClients();
    const existing = clients.find((c) => c.id === uuid);

    if (!existing) {
      throw new XuiNotFoundError("Client", uuid);
    }

    // Merge updates - convert GB to bytes for totalGB field
    const totalGB = updates.totalGB ?? existing.totalGB ?? 0;
    const totalBytes = totalGB > 0 ? totalGB * 1024 * 1024 * 1024 : 0;

    const updated: Record<string, unknown> = {
      ...existing,
      email: updates.email ?? existing.email,
      flow: updates.flow ?? existing.flow,
      limitIp: updates.limitIp ?? existing.limitIp,
      totalGB: totalBytes,
      expiryTime: updates.expiryTime ?? existing.expiryTime,
      enable: updates.enable ?? existing.enable,
      tgId: updates.tgId ?? existing.tgId,
      subId: updates.subId ?? existing.subId,
    };

    await this.http.post(`/panel/api/inbounds/updateClient/${uuid}`, {
      id: this.inboundId,
      settings: JSON.stringify({ clients: [updated] }),
    });
  }

  /**
   * Enable or disable a client
   */
  async setClientEnabled(uuid: string, enable: boolean): Promise<void> {
    await this.updateClient(uuid, { enable });
  }

  // ==================== Traffic ====================

  /**
   * Get traffic statistics for a client by UUID
   * Returns null if client has no traffic records yet
   */
  async getClientTraffic(uuid: string): Promise<ClientTraffic | null> {
    if (!uuid) {
      throw new XuiValidationError("UUID is required", "uuid");
    }

    try {
      // API returns an array of traffic records (one per inbound the client exists in)
      const trafficList = await this.http.get<ClientTraffic[]>(
        `/panel/api/inbounds/getClientTrafficsById/${uuid}`
      );
      // Find the record for this client's inbound
      return trafficList?.find((t) => t.inboundId === this.inboundId) ?? null;
    } catch (error) {
      // 3x-ui returns error if no traffic exists
      if (error instanceof XuiApiError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reset traffic statistics for a client by email
   */
  async resetClientTraffic(email: string): Promise<void> {
    if (!email) {
      throw new XuiValidationError("Email is required", "email");
    }

    await this.http.post(
      `/panel/api/inbounds/${this.inboundId}/resetClientTraffic/${encodeURIComponent(email)}`
    );
  }

  // ==================== Inbound ====================

  /**
   * Get full inbound configuration
   */
  async getInbound(): Promise<Inbound> {
    const inbound = await this.http.get<Inbound>(
      `/panel/api/inbounds/get/${this.inboundId}`
    );

    if (!inbound) {
      throw new XuiNotFoundError("Inbound", String(this.inboundId));
    }

    return inbound;
  }

  /**
   * Get inbound statistics summary
   */
  async getInboundStats(): Promise<InboundStats> {
    const inbound = await this.getInbound();
    const clients = this.parseClients(inbound);

    return {
      id: inbound.id,
      remark: inbound.remark,
      enable: inbound.enable,
      up: inbound.up,
      down: inbound.down,
      total: inbound.total,
      clientCount: clients.length,
      activeClientCount: clients.filter((c) => c.enable).length,
    };
  }

  /**
   * List all clients in the inbound
   */
  async listClients(): Promise<XuiClientType[]> {
    const inbound = await this.getInbound();
    return this.parseClients(inbound);
  }

  /**
   * Get a single client by UUID
   */
  async getClient(uuid: string): Promise<XuiClientType | null> {
    const clients = await this.listClients();
    return clients.find((c) => c.id === uuid) || null;
  }

  /**
   * Get a single client by email
   */
  async getClientByEmail(email: string): Promise<XuiClientType | null> {
    const clients = await this.listClients();
    return clients.find((c) => c.email === email) || null;
  }

  // ==================== Helpers ====================

  private parseClients(inbound: Inbound): XuiClientType[] {
    try {
      const settings = JSON.parse(inbound.settings) as InboundSettings;
      return settings.clients || [];
    } catch {
      return [];
    }
  }
}

/**
 * Create a XuiClient from server configuration
 */
export function createXuiClient(config: XuiServerConfig): XuiClient {
  return new XuiClient(config);
}
