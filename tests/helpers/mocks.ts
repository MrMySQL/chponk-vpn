/**
 * Mock factories for testing services with dependency injection
 *
 * These helpers create type-safe mocks that can be configured per-test
 * without global vi.mock() setup.
 */

import { vi, type Mock } from "vitest";
import type { Bot } from "grammy";
import type {
  Database,
  ServiceDependencies,
  CleanupDependencies,
} from "../../src/services/types";
import type { XuiClient, ClientTraffic } from "../../src/services/xui";
import type { AuthContext } from "../../src/bot/middleware/auth";

/**
 * Creates a mock database with common query patterns
 * Each method returns a chainable mock that can be configured
 */
export function createMockDb(): MockDatabase {
  const mockDb = {
    select: vi.fn(() => createChainableMock()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    query: {
      subscriptions: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      servers: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      users: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      plans: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      userConnections: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      payments: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };

  return mockDb as MockDatabase;
}

/** Type for chainable query mock */
interface ChainableMock {
  from: Mock;
  innerJoin: Mock;
  leftJoin: Mock;
  where: Mock;
}

function createChainableMock(): ChainableMock {
  const mock: ChainableMock = {
    from: vi.fn(() => mock),
    innerJoin: vi.fn(() => mock),
    leftJoin: vi.fn(() => mock),
    where: vi.fn().mockResolvedValue([]),
  };
  return mock;
}

/** Type for mock database */
export interface MockDatabase {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  query: {
    subscriptions: { findFirst: Mock; findMany: Mock };
    servers: { findFirst: Mock; findMany: Mock };
    users: { findFirst: Mock; findMany: Mock };
    plans: { findFirst: Mock; findMany: Mock };
    userConnections: { findFirst: Mock; findMany: Mock };
    payments: { findFirst: Mock; findMany: Mock };
  };
}

/**
 * Creates a mock XuiClient with all methods stubbed
 */
export function createMockXuiClient(): MockXuiClient {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    addClient: vi.fn().mockResolvedValue("mock-uuid"),
    deleteClient: vi.fn().mockResolvedValue(undefined),
    updateClient: vi.fn().mockResolvedValue(undefined),
    setClientEnabled: vi.fn().mockResolvedValue(undefined),
    getClientTraffic: vi.fn().mockResolvedValue(null),
    resetClientTraffic: vi.fn().mockResolvedValue(undefined),
    getAllClientTraffic: vi.fn().mockResolvedValue(new Map()),
    getInbound: vi.fn().mockResolvedValue(null),
    getInboundStats: vi.fn().mockResolvedValue(null),
    listClients: vi.fn().mockResolvedValue([]),
    getClient: vi.fn().mockResolvedValue(null),
    getClientByEmail: vi.fn().mockResolvedValue(null),
  };
}

export type MockXuiClient = {
  [K in keyof XuiClient]: Mock;
};

/**
 * Creates a mock bot instance with api.sendMessage stubbed
 */
export function createMockBot(): MockBot {
  return {
    api: {
      sendMessage: vi.fn().mockResolvedValue({}),
    },
  } as MockBot;
}

export type MockBot = {
  api: {
    sendMessage: Mock;
  };
};

/**
 * Creates mock dependencies for core services
 * Returns both the combined deps object and individual mocks for easy configuration
 */
export function createMockDependencies(): MockDependenciesResult {
  const mockDb = createMockDb();
  const mockXuiClient = createMockXuiClient();
  const getXuiClient = vi.fn().mockResolvedValue(mockXuiClient);

  const deps: ServiceDependencies = {
    db: mockDb as unknown as Database,
    getXuiClient,
  };

  return {
    deps,
    mockDb,
    mockXuiClient,
    getXuiClient,
  };
}

export interface MockDependenciesResult {
  deps: ServiceDependencies;
  mockDb: MockDatabase;
  mockXuiClient: MockXuiClient;
  getXuiClient: Mock;
}

/**
 * Creates mock dependencies for cleanup service (includes bot)
 */
export function createMockCleanupDependencies(): MockCleanupDependenciesResult {
  const { deps, mockDb, mockXuiClient, getXuiClient } = createMockDependencies();
  const mockBot = createMockBot();
  const getBot = vi.fn().mockReturnValue(mockBot);

  const cleanupDeps: CleanupDependencies = {
    ...deps,
    getBot,
  };

  return {
    deps: cleanupDeps,
    mockDb,
    mockXuiClient,
    getXuiClient,
    mockBot,
    getBot,
  };
}

export interface MockCleanupDependenciesResult extends MockDependenciesResult {
  deps: CleanupDependencies;
  mockBot: MockBot;
  getBot: Mock;
}

/**
 * Helper to create mock traffic data
 */
export function createMockTraffic(
  uuid: string,
  overrides: Partial<ClientTraffic> = {}
): ClientTraffic {
  return {
    id: 1,
    inboundId: 1,
    enable: true,
    email: `user_1_${Date.now()}`,
    up: 1000000,
    down: 5000000,
    expiryTime: 0,
    total: 0,
    reset: 0,
    ...overrides,
  };
}

/**
 * Helper to configure mock db.select() chain for traffic sync queries
 */
export function setupSelectChain(
  mockDb: MockDatabase,
  results: unknown[]
): void {
  const chain = createChainableMock();
  chain.where.mockResolvedValue(results);
  mockDb.select.mockReturnValue(chain);
}
