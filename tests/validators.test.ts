import { describe, it, expect } from "vitest";
import { serverRegistrationSchema } from "../src/lib/validators";

describe("serverRegistrationSchema", () => {
  const validInput = {
    name: "US West Server",
    location: "Los Angeles, US",
    host: "192.168.1.1",
    domain: "us-west.example.com",
    xuiUsername: "admin",
    xuiPassword: "secure-password",
    realityDest: "www.microsoft.com:443",
    realitySni: "microsoft.com",
  };

  describe("valid inputs", () => {
    it("accepts minimal valid input", () => {
      const result = serverRegistrationSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("applies default values correctly", () => {
      const result = serverRegistrationSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.xuiPort).toBe(2053);
        expect(result.data.inboundId).toBe(1);
        expect(result.data.realityPort).toBe(443);
      }
    });

    it("accepts full input with all optional fields", () => {
      const fullInput = {
        ...validInput,
        flagEmoji: "🇺🇸",
        xuiPort: 8080,
        inboundId: 5,
        realityPort: 8443,
        realityPublicKey: "abc123publickey",
        realityShortId: "shortid",
      };

      const result = serverRegistrationSchema.safeParse(fullInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.flagEmoji).toBe("🇺🇸");
        expect(result.data.xuiPort).toBe(8080);
        expect(result.data.inboundId).toBe(5);
        expect(result.data.realityPort).toBe(8443);
        expect(result.data.realityPublicKey).toBe("abc123publickey");
        expect(result.data.realityShortId).toBe("shortid");
      }
    });

    it("accepts IPv4 addresses", () => {
      const inputs = [
        { ...validInput, host: "10.0.0.1" },
        { ...validInput, host: "172.16.0.1" },
        { ...validInput, host: "255.255.255.255" },
        { ...validInput, host: "1.2.3.4" },
      ];

      inputs.forEach((input) => {
        const result = serverRegistrationSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("accepts IPv6 addresses", () => {
      const inputs = [
        { ...validInput, host: "::1" },
        { ...validInput, host: "2001:db8::1" },
        { ...validInput, host: "fe80::1" },
      ];

      inputs.forEach((input) => {
        const result = serverRegistrationSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("accepts port at boundaries", () => {
      const minPort = { ...validInput, xuiPort: 1 };
      const maxPort = { ...validInput, xuiPort: 65535 };

      expect(serverRegistrationSchema.safeParse(minPort).success).toBe(true);
      expect(serverRegistrationSchema.safeParse(maxPort).success).toBe(true);
    });
  });

  describe("name field", () => {
    it("rejects empty name", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects name over 100 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        name: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("accepts name at max length", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        name: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("location field", () => {
    it("rejects empty location", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        location: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects location over 100 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        location: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("host field", () => {
    it("rejects invalid IP addresses", () => {
      const invalidIPs = [
        "not-an-ip",
        "256.1.1.1",
        "1.2.3",
        "1.2.3.4.5",
        "example.com",
        "",
      ];

      invalidIPs.forEach((host) => {
        const result = serverRegistrationSchema.safeParse({
          ...validInput,
          host,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("domain field", () => {
    it("rejects empty domain", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        domain: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects domain over 255 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        domain: "a".repeat(256),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("port fields", () => {
    it("rejects port below 1", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiPort: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects port above 65535", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiPort: 65536,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer port", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiPort: 8080.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative port", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realityPort: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("xuiUsername field", () => {
    it("rejects empty username", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiUsername: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects username over 100 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiUsername: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("xuiPassword field", () => {
    it("rejects empty password", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiPassword: "",
      });
      expect(result.success).toBe(false);
    });

    it("accepts long passwords", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiPassword: "a".repeat(1000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("inboundId field", () => {
    it("rejects zero", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        inboundId: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative numbers", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        inboundId: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reality fields", () => {
    it("rejects empty realityDest", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realityDest: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty realitySni", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realitySni: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects realityDest over 255 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realityDest: "a".repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it("accepts realityPublicKey up to 255 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realityPublicKey: "a".repeat(255),
      });
      expect(result.success).toBe(true);
    });

    it("rejects realityPublicKey over 255 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realityPublicKey: "a".repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it("rejects realityShortId over 50 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        realityShortId: "a".repeat(51),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("flagEmoji field", () => {
    it("accepts emoji flags", () => {
      const flags = ["🇺🇸", "🇬🇧", "🇯🇵", "🇩🇪"];
      flags.forEach((flag) => {
        const result = serverRegistrationSchema.safeParse({
          ...validInput,
          flagEmoji: flag,
        });
        expect(result.success).toBe(true);
      });
    });

    it("rejects flagEmoji over 10 characters", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        flagEmoji: "a".repeat(11),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("missing required fields", () => {
    const requiredFields = [
      "name",
      "location",
      "host",
      "domain",
      "xuiUsername",
      "xuiPassword",
      "realityDest",
      "realitySni",
    ];

    requiredFields.forEach((field) => {
      it(`rejects missing ${field}`, () => {
        const input = { ...validInput };
        delete input[field as keyof typeof input];

        const result = serverRegistrationSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("type coercion", () => {
    it("rejects string where number expected", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        xuiPort: "8080",
      });
      expect(result.success).toBe(false);
    });

    it("rejects number where string expected", () => {
      const result = serverRegistrationSchema.safeParse({
        ...validInput,
        name: 123,
      });
      expect(result.success).toBe(false);
    });
  });
});
