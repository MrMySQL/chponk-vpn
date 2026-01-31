import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Mock the database
vi.mock("../src/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}));

// Mock crypto to avoid env var issues in tests
vi.mock("../src/lib/crypto", () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace("encrypted:", "")),
}));

describe("POST /api/servers/register", () => {
  const VALID_TOKEN = "test-api-token";
  const ENCRYPTION_KEY = "12345678901234567890123456789012";

  const validBody = {
    name: "Test Server",
    location: "Test, US",
    host: "192.168.1.1",
    domain: "test.example.com",
    xuiUsername: "admin",
    xuiPassword: "password123",
    realityDest: "cloudflare.com:443",
    realitySni: "cloudflare.com",
  };

  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let statusCode: number;
  let responseBody: unknown;

  beforeEach(() => {
    vi.stubEnv("API_TOKEN", VALID_TOKEN);
    vi.stubEnv("ENCRYPTION_KEY", ENCRYPTION_KEY);

    statusCode = 0;
    responseBody = null;

    mockRes = {
      status: vi.fn((code: number) => {
        statusCode = code;
        return mockRes as VercelResponse;
      }),
      json: vi.fn((body: unknown) => {
        responseBody = body;
        return mockRes as VercelResponse;
      }),
    };

    mockReq = {
      method: "POST",
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: validBody,
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("HTTP method validation", () => {
    it("rejects GET requests", async () => {
      mockReq.method = "GET";

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseBody).toEqual({ error: "Method not allowed" });
    });

    it("rejects PUT requests", async () => {
      mockReq.method = "PUT";

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });

    it("rejects DELETE requests", async () => {
      mockReq.method = "DELETE";

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });

    it("rejects PATCH requests", async () => {
      mockReq.method = "PATCH";

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });
  });

  describe("authentication", () => {
    it("rejects missing authorization header", async () => {
      mockReq.headers = {};

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseBody).toEqual({ error: "Unauthorized" });
    });

    it("rejects invalid token", async () => {
      mockReq.headers = { authorization: "Bearer wrong-token" };

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseBody).toEqual({ error: "Unauthorized" });
    });

    it("rejects malformed authorization header", async () => {
      mockReq.headers = { authorization: VALID_TOKEN }; // Missing "Bearer "

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
    });

    it("rejects Basic auth", async () => {
      mockReq.headers = { authorization: `Basic ${VALID_TOKEN}` };

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
    });

    it("returns 500 when API_TOKEN not configured", async () => {
      vi.stubEnv("API_TOKEN", "");
      vi.resetModules();

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(500);
      expect(responseBody).toEqual({ error: "API_TOKEN not configured" });
    });
  });

  describe("input validation", () => {
    it("rejects empty body", async () => {
      mockReq.body = {};

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody).toHaveProperty("error", "Validation failed");
      expect(responseBody).toHaveProperty("details");
    });

    it("rejects missing required fields", async () => {
      mockReq.body = { name: "Test" };

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody).toHaveProperty("error", "Validation failed");
    });

    it("rejects invalid IP address", async () => {
      mockReq.body = { ...validBody, host: "not-an-ip" };

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it("rejects invalid port", async () => {
      mockReq.body = { ...validBody, xuiPort: 99999 };

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it("returns detailed validation errors", async () => {
      mockReq.body = {
        ...validBody,
        name: "",
        host: "invalid",
        xuiPort: -1,
      };

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody).toHaveProperty("details");
      const details = (responseBody as { details: { fieldErrors: Record<string, unknown> } }).details;
      expect(details).toHaveProperty("fieldErrors");
    });
  });

  describe("successful registration", () => {
    it("returns 201 with server data on success", async () => {
      const mockServer = {
        id: 1,
        name: "Test Server",
        domain: "test.example.com",
        location: "Test, US",
      };

      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockServer]),
        }),
      } as never);

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(201);
      expect(responseBody).toEqual({
        success: true,
        server: mockServer,
      });
    });

    it("encrypts password before storage", async () => {
      const mockServer = { id: 1, name: "Test", domain: "test.com", location: "US" };

      let capturedValues: Record<string, unknown> | undefined;
      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn((vals: Record<string, unknown>) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([mockServer]),
          };
        }),
      } as never);

      const { encrypt } = await import("../src/lib/crypto");

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(encrypt).toHaveBeenCalledWith("password123");
      expect(capturedValues?.xuiPassword).toBe("encrypted:password123");
    });

    it("includes all fields in database insert", async () => {
      const fullBody = {
        ...validBody,
        flagEmoji: "🇺🇸",
        xuiPort: 8080,
        inboundId: 5,
        realityPort: 8443,
        realityPublicKey: "pubkey123",
        realityShortId: "short123",
      };
      mockReq.body = fullBody;

      let capturedValues: Record<string, unknown> | undefined;
      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn((vals: Record<string, unknown>) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          };
        }),
      } as never);

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(capturedValues).toMatchObject({
        name: "Test Server",
        location: "Test, US",
        flagEmoji: "🇺🇸",
        host: "192.168.1.1",
        domain: "test.example.com",
        xuiPort: 8080,
        xuiUsername: "admin",
        inboundId: 5,
        realityPort: 8443,
        realityDest: "cloudflare.com:443",
        realitySni: "cloudflare.com",
        realityPublicKey: "pubkey123",
        realityShortId: "short123",
      });
    });
  });

  describe("error handling", () => {
    it("returns 409 for duplicate domain", async () => {
      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(
            new Error("unique constraint violation on domain")
          ),
        }),
      } as never);

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(409);
      expect(responseBody).toEqual({
        error: "A server with this domain already exists",
      });
    });

    it("returns 500 for generic database errors", async () => {
      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("Connection failed")),
        }),
      } as never);

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(500);
      expect(responseBody).toEqual({ error: "Failed to register server" });
    });

    it("logs errors to console", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const testError = new Error("Test error");

      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(testError),
        }),
      } as never);

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to register server:",
        testError
      );

      consoleSpy.mockRestore();
    });
  });

  describe("response format", () => {
    it("only returns safe fields (no password)", async () => {
      const mockServer = {
        id: 1,
        name: "Test Server",
        domain: "test.example.com",
        location: "Test, US",
      };

      const { db } = await import("../src/db");
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockServer]),
        }),
      } as never);

      const { default: handler } = await import("../api/servers/register");
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      const response = responseBody as { server: Record<string, unknown> };
      expect(response.server).not.toHaveProperty("xuiPassword");
      expect(response.server).not.toHaveProperty("host");
      expect(response.server).toHaveProperty("id");
      expect(response.server).toHaveProperty("name");
      expect(response.server).toHaveProperty("domain");
      expect(response.server).toHaveProperty("location");
    });
  });
});
