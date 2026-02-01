import { describe, it, expect } from "vitest";
import {
  generateVlessRealityUrl,
  generateVlessUrlForServer,
  ConfigGeneratorError,
  type VlessRealityConfig,
} from "../src/services/config-generator";
import type { Server } from "../src/db/schema";

describe("generateVlessRealityUrl", () => {
  const validConfig: VlessRealityConfig = {
    uuid: "550e8400-e29b-41d4-a716-446655440000",
    domain: "vpn.example.com",
    port: 443,
    sni: "www.microsoft.com",
    publicKey: "abc123publickey",
    shortId: "deadbeef",
    serverName: "US West",
  };

  describe("valid configurations", () => {
    it("generates valid URL with all params", () => {
      const url = generateVlessRealityUrl(validConfig);

      expect(url).toContain("vless://");
      expect(url).toContain(validConfig.uuid);
      expect(url).toContain(`@${validConfig.domain}:${validConfig.port}`);
      expect(url).toContain("encryption=none");
      expect(url).toContain("flow=xtls-rprx-vision");
      expect(url).toContain("security=reality");
      expect(url).toContain(`sni=${validConfig.sni}`);
      expect(url).toContain(`pbk=${validConfig.publicKey}`);
      expect(url).toContain(`sid=${validConfig.shortId}`);
      expect(url).toContain("type=tcp");
    });

    it("URL is properly encoded", () => {
      const configWithSpecialChars: VlessRealityConfig = {
        ...validConfig,
        serverName: "US West & East",
      };

      const url = generateVlessRealityUrl(configWithSpecialChars);

      // Fragment should be URL encoded
      expect(url).toContain("#US%20West%20%26%20East");
      expect(url).not.toContain("US West & East");
    });

    it("server name with emoji in fragment", () => {
      const configWithEmoji: VlessRealityConfig = {
        ...validConfig,
        serverName: "US West 🇺🇸",
      };

      const url = generateVlessRealityUrl(configWithEmoji);

      // Emoji should be URL encoded in fragment
      expect(url).toContain("#US%20West%20");
      // The URL should end with the encoded fragment
      expect(url.includes("#")).toBe(true);
    });

    it("default fingerprint is chrome", () => {
      const url = generateVlessRealityUrl(validConfig);
      expect(url).toContain("fp=chrome");
    });

    it("custom fingerprint works", () => {
      const fingerprints = ["chrome", "firefox", "safari", "edge"] as const;

      fingerprints.forEach((fp) => {
        const config: VlessRealityConfig = {
          ...validConfig,
          fingerprint: fp,
        };
        const url = generateVlessRealityUrl(config);
        expect(url).toContain(`fp=${fp}`);
      });
    });

    it("accepts valid UUID formats", () => {
      const validUuids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        "00000000-0000-0000-0000-000000000000",
      ];

      validUuids.forEach((uuid) => {
        const config: VlessRealityConfig = { ...validConfig, uuid };
        expect(() => generateVlessRealityUrl(config)).not.toThrow();
      });
    });

    it("accepts port boundary values", () => {
      expect(() =>
        generateVlessRealityUrl({ ...validConfig, port: 1 })
      ).not.toThrow();

      expect(() =>
        generateVlessRealityUrl({ ...validConfig, port: 65535 })
      ).not.toThrow();
    });
  });

  describe("validation errors", () => {
    it("invalid UUID throws error", () => {
      const invalidUuids = [
        "not-a-uuid",
        "550e8400e29b41d4a716446655440000", // missing hyphens
        "550e8400-e29b-41d4-a716-44665544000", // too short
        "550e8400-e29b-41d4-a716-4466554400000", // too long
        "550e8400-e29b-41d4-a716-44665544000g", // invalid character
        "",
      ];

      invalidUuids.forEach((uuid) => {
        const config: VlessRealityConfig = { ...validConfig, uuid };
        expect(() => generateVlessRealityUrl(config)).toThrow(
          ConfigGeneratorError
        );
      });
    });

    it("missing publicKey throws error", () => {
      const config = { ...validConfig, publicKey: "" };
      expect(() => generateVlessRealityUrl(config)).toThrow(
        ConfigGeneratorError
      );
      expect(() => generateVlessRealityUrl(config)).toThrow(
        "Public key is required"
      );
    });

    it("missing shortId throws error", () => {
      const config = { ...validConfig, shortId: "" };
      expect(() => generateVlessRealityUrl(config)).toThrow(
        ConfigGeneratorError
      );
      expect(() => generateVlessRealityUrl(config)).toThrow(
        "Short ID is required"
      );
    });

    it("missing domain throws error", () => {
      const config = { ...validConfig, domain: "" };
      expect(() => generateVlessRealityUrl(config)).toThrow(
        ConfigGeneratorError
      );
      expect(() => generateVlessRealityUrl(config)).toThrow(
        "Domain is required"
      );
    });

    it("missing sni throws error", () => {
      const config = { ...validConfig, sni: "" };
      expect(() => generateVlessRealityUrl(config)).toThrow(
        ConfigGeneratorError
      );
      expect(() => generateVlessRealityUrl(config)).toThrow("SNI is required");
    });

    it("invalid port throws error", () => {
      const invalidPorts = [0, -1, 65536, 100000];

      invalidPorts.forEach((port) => {
        const config = { ...validConfig, port };
        expect(() => generateVlessRealityUrl(config)).toThrow(
          ConfigGeneratorError
        );
      });
    });
  });
});

describe("generateVlessUrlForServer", () => {
  const createMockServer = (
    overrides: Partial<Server> = {}
  ): Server => ({
    id: 1,
    name: "US West",
    location: "Los Angeles, US",
    flagEmoji: "🇺🇸",
    host: "192.168.1.1",
    domain: "vpn.example.com",
    xuiPort: 2053,
    xuiBasePath: null,
    xuiUsername: "admin",
    xuiPassword: "encrypted-password",
    inboundId: 1,
    realityPort: 443,
    realityDest: "www.microsoft.com:443",
    realitySni: "www.microsoft.com",
    realityPublicKey: "abc123publickey",
    realityShortId: "deadbeef",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  it("generates URL from server record", () => {
    const server = createMockServer();
    const url = generateVlessUrlForServer(server, validUuid);

    expect(url).toContain(`vless://${validUuid}`);
    expect(url).toContain(`@${server.domain}:${server.realityPort}`);
    expect(url).toContain(`sni=${server.realitySni}`);
    expect(url).toContain(`pbk=${server.realityPublicKey}`);
    expect(url).toContain(`sid=${server.realityShortId}`);
  });

  it("includes server name and flag emoji in fragment", () => {
    const server = createMockServer();
    const url = generateVlessUrlForServer(server, validUuid);

    // Fragment should contain "US West" and emoji (URL encoded)
    expect(url).toContain("#US%20West%20");
  });

  it("handles server without flag emoji", () => {
    const server = createMockServer({ flagEmoji: null });
    const url = generateVlessUrlForServer(server, validUuid);

    // Should just have server name without trailing space
    expect(url).toContain("#US%20West");
    expect(url).not.toContain("#US%20West%20");
  });

  it("throws error when publicKey is missing", () => {
    const server = createMockServer({ realityPublicKey: null });

    expect(() => generateVlessUrlForServer(server, validUuid)).toThrow(
      ConfigGeneratorError
    );
    expect(() => generateVlessUrlForServer(server, validUuid)).toThrow(
      "missing realityPublicKey"
    );
  });

  it("throws error when shortId is missing", () => {
    const server = createMockServer({ realityShortId: null });

    expect(() => generateVlessUrlForServer(server, validUuid)).toThrow(
      ConfigGeneratorError
    );
    expect(() => generateVlessUrlForServer(server, validUuid)).toThrow(
      "missing realityShortId"
    );
  });

  it("throws error for invalid UUID", () => {
    const server = createMockServer();

    expect(() => generateVlessUrlForServer(server, "not-a-uuid")).toThrow(
      ConfigGeneratorError
    );
  });
});
