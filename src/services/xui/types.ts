/**
 * 3x-ui API type definitions
 */

/** Standard API response wrapper from 3x-ui */
export interface XuiApiResponse<T = unknown> {
  success: boolean;
  msg: string;
  obj: T;
}

/** Client configuration as stored in 3x-ui inbound settings */
export interface XuiClient {
  id: string; // UUID
  email: string;
  flow: string; // e.g., "xtls-rprx-vision"
  limitIp: number; // 0 = unlimited
  totalGB: number; // 0 = unlimited
  expiryTime: number; // Unix timestamp in ms, 0 = never
  enable: boolean;
  tgId: string;
  subId: string;
  reset: number;
}

/** Traffic statistics for a client */
export interface ClientTraffic {
  id: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number; // bytes uploaded
  down: number; // bytes downloaded
  expiryTime: number; // Unix timestamp in ms
  total: number; // total traffic limit in bytes
  reset: number;
}

/** Options for creating a new client */
export interface AddClientOptions {
  /** Client UUID - will be generated if not provided */
  uuid?: string;
  /** Email identifier, format: user_{userId}_{timestamp} */
  email: string;
  /** Flow type for VLESS, e.g., "xtls-rprx-vision" */
  flow?: string;
  /** Max concurrent IPs, 0 = unlimited */
  limitIp?: number;
  /** Traffic limit in GB, 0 = unlimited */
  totalGB?: number;
  /** Expiry time as Unix timestamp in ms, 0 = never */
  expiryTime?: number;
  /** Whether client is enabled */
  enable?: boolean;
  /** Telegram user ID for tracking */
  tgId?: string;
  /** Subscription ID for sub links */
  subId?: string;
}

/** Stream settings for an inbound */
export interface StreamSettings {
  network: string;
  security: string;
  realitySettings?: {
    show: boolean;
    xver: number;
    dest: string;
    serverNames: string[];
    privateKey: string;
    minClient: string;
    maxClient: string;
    maxTimediff: number;
    shortIds: string[];
    settings: {
      publicKey: string;
      fingerprint: string;
      serverName: string;
      spiderX: string;
    };
  };
  tcpSettings?: {
    acceptProxyProtocol: boolean;
    header: {
      type: string;
    };
  };
}

/** Full inbound configuration from 3x-ui */
export interface Inbound {
  id: number;
  up: number;
  down: number;
  total: number;
  remark: string;
  enable: boolean;
  expiryTime: number;
  clientStats: ClientTraffic[] | null;
  listen: string;
  port: number;
  protocol: string;
  settings: string; // JSON string containing clients array
  streamSettings: string; // JSON string
  tag: string;
  sniffing: string; // JSON string
  allocate: string; // JSON string
}

/** Parsed inbound settings */
export interface InboundSettings {
  clients: XuiClient[];
  decryption: string;
  fallbacks: unknown[];
}

/** Inbound statistics summary */
export interface InboundStats {
  id: number;
  remark: string;
  enable: boolean;
  up: number;
  down: number;
  total: number;
  clientCount: number;
  activeClientCount: number;
}

/** Server connection configuration */
export interface XuiServerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  inboundId: number;
  /** Use HTTPS for panel connection */
  secure?: boolean;
}
