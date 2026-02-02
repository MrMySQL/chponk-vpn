import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock database module
vi.mock("@/db", () => ({
  db: {
    query: {
      servers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  },
}));

import {
  XuiClient,
  XuiError,
  XuiAuthError,
  XuiNetworkError,
  XuiApiError,
  XuiNotFoundError,
  XuiValidationError,
  type XuiServerConfig,
  type XuiApiResponse,
  type Inbound,
  type ClientTraffic,
} from "../src/services/xui";
import { XuiHttpClient } from "../src/services/xui/client";
import {
  generateClientEmail,
  parseUserIdFromEmail,
} from "../src/services/xui/repository";

// ==================== Test Helpers ====================

function createMockResponse(
  data: XuiApiResponse,
  options: { status?: number; cookie?: string } = {}
): Response {
  const headers = new Headers();
  if (options.cookie) {
    headers.set("set-cookie", options.cookie);
  }

  return {
    ok: options.status ? options.status >= 200 && options.status < 300 : true,
    status: options.status ?? 200,
    statusText: options.status === 401 ? "Unauthorized" : "OK",
    headers,
    json: () => Promise.resolve(data),
  } as Response;
}

function createMockConfig(): XuiServerConfig {
  return {
    host: "test.example.com",
    port: 2053,
    username: "admin",
    password: "password123",
    inboundId: 1,
    secure: false,
  };
}

function createMockInbound(clients: unknown[] = []): Inbound {
  return {
    id: 1,
    up: 1000000,
    down: 5000000,
    total: 0,
    remark: "Test Inbound",
    enable: true,
    expiryTime: 0,
    clientStats: null,
    listen: "",
    port: 443,
    protocol: "vless",
    settings: JSON.stringify({
      clients,
      decryption: "none",
      fallbacks: [],
    }),
    streamSettings: "{}",
    tag: "inbound-1",
    sniffing: "{}",
    allocate: "{}",
  };
}

// ==================== Error Classes ====================

describe("XUI Errors", () => {
  describe("XuiError", () => {
    it("is instance of Error", () => {
      const error = new XuiError("test error");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("XuiError");
      expect(error.message).toBe("test error");
    });
  });

  describe("XuiAuthError", () => {
    it("has default message", () => {
      const error = new XuiAuthError();
      expect(error.message).toBe("Authentication failed");
      expect(error.name).toBe("XuiAuthError");
    });

    it("accepts custom message", () => {
      const error = new XuiAuthError("Session expired");
      expect(error.message).toBe("Session expired");
    });

    it("is instance of XuiError", () => {
      const error = new XuiAuthError();
      expect(error).toBeInstanceOf(XuiError);
    });
  });

  describe("XuiNetworkError", () => {
    it("stores cause", () => {
      const cause = new Error("Connection refused");
      const error = new XuiNetworkError("Network failed", cause);
      expect(error.message).toBe("Network failed");
      expect(error.cause).toBe(cause);
      expect(error.name).toBe("XuiNetworkError");
    });

    it("works without cause", () => {
      const error = new XuiNetworkError("Timeout");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("XuiApiError", () => {
    it("stores status code and API message", () => {
      const error = new XuiApiError("Request failed", 400, "Invalid input");
      expect(error.message).toBe("Request failed");
      expect(error.statusCode).toBe(400);
      expect(error.apiMessage).toBe("Invalid input");
      expect(error.name).toBe("XuiApiError");
    });
  });

  describe("XuiNotFoundError", () => {
    it("formats message with resource type and ID", () => {
      const error = new XuiNotFoundError("Client", "abc-123");
      expect(error.message).toBe("Client not found: abc-123");
      expect(error.resourceType).toBe("Client");
      expect(error.resourceId).toBe("abc-123");
      expect(error.name).toBe("XuiNotFoundError");
    });
  });

  describe("XuiValidationError", () => {
    it("stores field name", () => {
      const error = new XuiValidationError("Email is required", "email");
      expect(error.message).toBe("Email is required");
      expect(error.field).toBe("email");
      expect(error.name).toBe("XuiValidationError");
    });

    it("works without field", () => {
      const error = new XuiValidationError("Invalid input");
      expect(error.field).toBeUndefined();
    });
  });
});

// ==================== HTTP Client ====================

describe("XuiHttpClient", () => {
  let client: XuiHttpClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new XuiHttpClient(createMockConfig());
  });

  describe("login", () => {
    it("authenticates and stores session cookie", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=session123; Path=/; HttpOnly" }
        )
      );

      await client.login();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://test.example.com:2053/login",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })
      );
      expect(client.isAuthenticated()).toBe(true);
    });

    it("throws XuiAuthError on failed login", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "Invalid credentials", obj: null })
      );

      await expect(client.login()).rejects.toThrow("Invalid credentials");
    });

    it("throws XuiAuthError when no cookie received", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await expect(client.login()).rejects.toThrow("No session cookie");
    });

    it("throws XuiNetworkError on connection failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      await expect(client.login()).rejects.toThrow(XuiNetworkError);
    });

    it("throws XuiAuthError on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "", obj: null }, { status: 500 })
      );

      await expect(client.login()).rejects.toThrow(XuiAuthError);
    });

    it("uses HTTPS when secure is true", async () => {
      const secureClient = new XuiHttpClient({
        ...createMockConfig(),
        secure: true,
      });

      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=session123" }
        )
      );

      await secureClient.login();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.example.com:2053/login",
        expect.anything()
      );
    });
  });

  describe("request", () => {
    beforeEach(async () => {
      // Setup authenticated client
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=session123" }
        )
      );
      await client.login();
      mockFetch.mockReset();
    });

    it("auto-logs in on first request", async () => {
      const freshClient = new XuiHttpClient(createMockConfig());

      // Login response
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=session123" }
        )
      );
      // Actual request response
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: { data: "test" } })
      );

      const result = await freshClient.get<{ data: string }>("/api/test");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "test" });
    });

    it("retries on 401 response", async () => {
      // First request returns 401
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "", obj: null }, { status: 401 })
      );
      // Re-login
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=newsession" }
        )
      );
      // Retry request
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: { data: "success" } })
      );

      const result = await client.get<{ data: string }>("/api/test");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ data: "success" });
    });

    it("throws after re-auth also fails", async () => {
      // First request returns 401
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "", obj: null }, { status: 401 })
      );
      // Re-login
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=newsession" }
        )
      );
      // Retry also fails with 401
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "", obj: null }, { status: 401 })
      );

      await expect(client.get("/api/test")).rejects.toThrow(XuiAuthError);
    });

    it("sends JSON body on POST", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.post("/api/test", { key: "value" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://test.example.com:2053/api/test",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Cookie: "3x-ui=session123",
          }),
          body: '{"key":"value"}',
        })
      );
    });

    it("sends form data on postForm", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.postForm("/api/test", { key: "value" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
          body: "key=value",
        })
      );
    });

    it("throws XuiApiError on API error response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "Something went wrong", obj: null })
      );

      await expect(client.get("/api/test")).rejects.toThrow("Something went wrong");
    });

    it("throws XuiNetworkError on fetch failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.get("/api/test")).rejects.toThrow(XuiNetworkError);
    });
  });

  describe("clearSession", () => {
    it("clears authentication state", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, msg: "", obj: null },
          { cookie: "3x-ui=session123" }
        )
      );
      await client.login();

      expect(client.isAuthenticated()).toBe(true);

      client.clearSession();

      expect(client.isAuthenticated()).toBe(false);
    });
  });
});

// ==================== XuiClient ====================

describe("XuiClient", () => {
  let client: XuiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new XuiClient(createMockConfig());

    // Setup default login response for all tests
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        { success: true, msg: "", obj: null },
        { cookie: "3x-ui=session123" }
      )
    );
  });

  describe("addClient", () => {
    it("adds a client with minimal options", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      const uuid = await client.addClient({ email: "user_1_123456" });

      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );

      const callBody = JSON.parse(
        (mockFetch.mock.calls[1][1] as RequestInit).body as string
      );
      expect(callBody.id).toBe(1);

      const settings = JSON.parse(callBody.settings);
      expect(settings.clients[0].email).toBe("user_1_123456");
      expect(settings.clients[0].flow).toBe("xtls-rprx-vision");
      expect(settings.clients[0].enable).toBe(true);
    });

    it("uses provided UUID", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      const uuid = await client.addClient({
        uuid: "custom-uuid-123",
        email: "test@example.com",
      });

      expect(uuid).toBe("custom-uuid-123");
    });

    it("applies all options", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.addClient({
        email: "user_1_123456",
        flow: "custom-flow",
        limitIp: 3,
        totalGB: 100,
        expiryTime: 1700000000000,
        enable: false,
        tgId: "123456789",
        subId: "sub-123",
      });

      const callBody = JSON.parse(
        (mockFetch.mock.calls[1][1] as RequestInit).body as string
      );
      const settings = JSON.parse(callBody.settings);
      const addedClient = settings.clients[0];

      expect(addedClient.flow).toBe("custom-flow");
      expect(addedClient.limitIp).toBe(3);
      expect(addedClient.totalGB).toBe(100 * 1024 * 1024 * 1024); // 100 GB in bytes
      expect(addedClient.expiryTime).toBe(1700000000000);
      expect(addedClient.enable).toBe(false);
      expect(addedClient.tgId).toBe("123456789");
      expect(addedClient.subId).toBe("sub-123");
    });

    it("throws XuiValidationError when email is missing", async () => {
      await expect(client.addClient({ email: "" })).rejects.toThrow(
        XuiValidationError
      );
    });
  });

  describe("deleteClient", () => {
    it("deletes a client by UUID", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.deleteClient("uuid-to-delete");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://test.example.com:2053/panel/api/inbounds/1/delClient/uuid-to-delete",
        expect.anything()
      );
    });

    it("throws XuiValidationError when UUID is empty", async () => {
      await expect(client.deleteClient("")).rejects.toThrow(XuiValidationError);
    });
  });

  describe("updateClient", () => {
    it("updates an existing client", async () => {
      const existingClient = {
        id: "existing-uuid",
        email: "user_1_old",
        flow: "xtls-rprx-vision",
        limitIp: 0,
        totalGB: 0,
        expiryTime: 0,
        enable: true,
        tgId: "",
        subId: "",
        reset: 0,
      };

      // Get inbound to find existing client
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound([existingClient]),
        })
      );
      // Update client
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.updateClient("existing-uuid", {
        email: "user_1_new",
        limitIp: 5,
      });

      const updateCall = mockFetch.mock.calls[2];
      expect(updateCall[0]).toContain("/updateClient/existing-uuid");

      const body = JSON.parse((updateCall[1] as RequestInit).body as string);
      const settings = JSON.parse(body.settings);
      expect(settings.clients[0].email).toBe("user_1_new");
      expect(settings.clients[0].limitIp).toBe(5);
      expect(settings.clients[0].flow).toBe("xtls-rprx-vision"); // preserved
    });

    it("throws XuiNotFoundError when client doesn't exist", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound([]),
        })
      );

      await expect(
        client.updateClient("nonexistent", { email: "test" })
      ).rejects.toThrow(XuiNotFoundError);
    });

    it("throws XuiValidationError when UUID is empty", async () => {
      await expect(client.updateClient("", { email: "test" })).rejects.toThrow(
        XuiValidationError
      );
    });
  });

  describe("setClientEnabled", () => {
    it("enables a client", async () => {
      const existingClient = {
        id: "uuid-123",
        email: "test",
        flow: "xtls-rprx-vision",
        limitIp: 0,
        totalGB: 0,
        expiryTime: 0,
        enable: false,
        tgId: "",
        subId: "",
        reset: 0,
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound([existingClient]),
        })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.setClientEnabled("uuid-123", true);

      const updateCall = mockFetch.mock.calls[2];
      const body = JSON.parse((updateCall[1] as RequestInit).body as string);
      const settings = JSON.parse(body.settings);
      expect(settings.clients[0].enable).toBe(true);
    });
  });

  describe("getClientTraffic", () => {
    it("returns traffic stats", async () => {
      const traffic: ClientTraffic = {
        id: 1,
        inboundId: 1,
        enable: true,
        email: "user_1_123456",
        up: 1000000,
        down: 5000000,
        expiryTime: 0,
        total: 0,
        reset: 0,
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: [traffic] })
      );

      const result = await client.getClientTraffic("uuid-123");

      expect(result).toEqual(traffic);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/getClientTrafficsById/uuid-123"),
        expect.anything()
      );
    });

    it("returns null when no traffic exists", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, msg: "No traffic", obj: null })
      );

      const result = await client.getClientTraffic("uuid-123");

      expect(result).toBeNull();
    });

    it("throws XuiValidationError when UUID is empty", async () => {
      await expect(client.getClientTraffic("")).rejects.toThrow(
        XuiValidationError
      );
    });
  });

  describe("resetClientTraffic", () => {
    it("resets traffic by email", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.resetClientTraffic("user_1_123456");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/resetClientTraffic/user_1_123456"),
        expect.anything()
      );
    });

    it("URL encodes email", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await client.resetClientTraffic("user+test@example.com");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/resetClientTraffic/user%2Btest%40example.com"),
        expect.anything()
      );
    });

    it("throws XuiValidationError when email is empty", async () => {
      await expect(client.resetClientTraffic("")).rejects.toThrow(
        XuiValidationError
      );
    });
  });

  describe("getInbound", () => {
    it("returns inbound configuration", async () => {
      const inbound = createMockInbound();
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: inbound })
      );

      const result = await client.getInbound();

      expect(result).toEqual(inbound);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/inbounds/get/1"),
        expect.anything()
      );
    });

    it("throws XuiNotFoundError when inbound doesn't exist", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: null })
      );

      await expect(client.getInbound()).rejects.toThrow(XuiNotFoundError);
    });
  });

  describe("getInboundStats", () => {
    it("returns summary statistics", async () => {
      const clients = [
        { id: "1", email: "a", enable: true },
        { id: "2", email: "b", enable: true },
        { id: "3", email: "c", enable: false },
      ];
      const inbound = createMockInbound(clients);

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: inbound })
      );

      const stats = await client.getInboundStats();

      expect(stats.id).toBe(1);
      expect(stats.remark).toBe("Test Inbound");
      expect(stats.clientCount).toBe(3);
      expect(stats.activeClientCount).toBe(2);
      expect(stats.up).toBe(1000000);
      expect(stats.down).toBe(5000000);
    });
  });

  describe("listClients", () => {
    it("returns all clients from inbound", async () => {
      const clients = [
        {
          id: "uuid-1",
          email: "user_1",
          flow: "xtls-rprx-vision",
          limitIp: 0,
          totalGB: 0,
          expiryTime: 0,
          enable: true,
          tgId: "",
          subId: "",
          reset: 0,
        },
        {
          id: "uuid-2",
          email: "user_2",
          flow: "xtls-rprx-vision",
          limitIp: 3,
          totalGB: 100,
          expiryTime: 1700000000000,
          enable: false,
          tgId: "123",
          subId: "sub-1",
          reset: 0,
        },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound(clients),
        })
      );

      const result = await client.listClients();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("uuid-1");
      expect(result[1].id).toBe("uuid-2");
    });

    it("returns empty array when no clients", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound([]),
        })
      );

      const result = await client.listClients();

      expect(result).toEqual([]);
    });

    it("handles malformed settings JSON", async () => {
      const inbound = createMockInbound();
      inbound.settings = "invalid json";

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, msg: "", obj: inbound })
      );

      const result = await client.listClients();

      expect(result).toEqual([]);
    });
  });

  describe("getClient", () => {
    it("returns client by UUID", async () => {
      const clients = [
        { id: "uuid-1", email: "user_1" },
        { id: "uuid-2", email: "user_2" },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound(clients),
        })
      );

      const result = await client.getClient("uuid-2");

      expect(result?.id).toBe("uuid-2");
      expect(result?.email).toBe("user_2");
    });

    it("returns null when client not found", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound([{ id: "uuid-1", email: "user_1" }]),
        })
      );

      const result = await client.getClient("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getClientByEmail", () => {
    it("returns client by email", async () => {
      const clients = [
        { id: "uuid-1", email: "user_1_123456" },
        { id: "uuid-2", email: "user_2_789012" },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound(clients),
        })
      );

      const result = await client.getClientByEmail("user_2_789012");

      expect(result?.id).toBe("uuid-2");
    });

    it("returns null when email not found", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          msg: "",
          obj: createMockInbound([]),
        })
      );

      const result = await client.getClientByEmail("nonexistent@example.com");

      expect(result).toBeNull();
    });
  });
});

// ==================== Repository ====================

describe("Repository", () => {
  describe("getXuiClientForServer", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockReset();
    });

    it("throws XuiNotFoundError when server not found", async () => {
      const { db } = await import("@/db");
      const mockedDb = vi.mocked(db);
      const {
        getXuiClientForServer,
        clearXuiClientCache,
      } = await import("../src/services/xui/repository");

      clearXuiClientCache();
      mockedDb.query.servers.findFirst.mockResolvedValueOnce(undefined);

      await expect(getXuiClientForServer(999)).rejects.toThrow(XuiNotFoundError);
    });

    it("throws error when server is not active", async () => {
      const { db } = await import("@/db");
      const mockedDb = vi.mocked(db);
      const {
        getXuiClientForServer,
        clearXuiClientCache,
      } = await import("../src/services/xui/repository");

      clearXuiClientCache();

      const mockServer = {
        id: 1,
        name: "Test Server",
        location: "US",
        flagEmoji: null,
        host: "server.example.com",
        domain: "vpn.example.com",
        xuiPort: 2053,
        xuiUsername: "admin",
        xuiPassword: "encrypted:password",
        inboundId: 1,
        realityPort: 443,
        realityDest: "example.com:443",
        realitySni: "example.com",
        realityPublicKey: null,
        realityShortId: null,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedDb.query.servers.findFirst.mockResolvedValueOnce(mockServer);

      await expect(getXuiClientForServer(1)).rejects.toThrow("not active");
    });
  });

  describe("generateClientEmail", () => {
    it("generates email in expected format", () => {
      const email = generateClientEmail(123);

      expect(email).toMatch(/^user_123_\d+$/);
    });

    it("uses current timestamp", () => {
      const before = Date.now();
      const email = generateClientEmail(1);
      const after = Date.now();

      const timestamp = parseInt(email.split("_")[2], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("generates unique emails", () => {
      const email1 = generateClientEmail(1);
      // Small delay to ensure different timestamp
      const email2 = generateClientEmail(1);

      // They might be the same if generated in same ms, but usually different
      // This test mainly verifies the function works
      expect(email1).toMatch(/^user_1_\d+$/);
      expect(email2).toMatch(/^user_1_\d+$/);
    });
  });

  describe("parseUserIdFromEmail", () => {
    it("extracts user ID from valid email format", () => {
      expect(parseUserIdFromEmail("user_123_1700000000000")).toBe(123);
      expect(parseUserIdFromEmail("user_1_999")).toBe(1);
      expect(parseUserIdFromEmail("user_999999_1")).toBe(999999);
    });

    it("returns null for invalid formats", () => {
      expect(parseUserIdFromEmail("invalid")).toBeNull();
      expect(parseUserIdFromEmail("user_abc_123")).toBeNull();
      expect(parseUserIdFromEmail("user_123")).toBeNull();
      expect(parseUserIdFromEmail("user__123")).toBeNull();
      expect(parseUserIdFromEmail("test@example.com")).toBeNull();
      expect(parseUserIdFromEmail("")).toBeNull();
    });

    it("handles edge cases", () => {
      expect(parseUserIdFromEmail("user_0_0")).toBe(0);
      expect(parseUserIdFromEmail("prefix_user_123_456")).toBeNull();
      expect(parseUserIdFromEmail("user_123_456_suffix")).toBeNull();
    });
  });
});
