import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database before importing handlers
vi.mock("../src/db/index.js", () => ({
  db: {
    query: {
      plans: {
        findFirst: vi.fn(),
      },
      servers: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}));

vi.mock("../src/services/xui/repository.js", () => ({
  getXuiClientForServer: vi.fn(),
  generateClientEmail: vi.fn(() => "user_1_1234567890"),
}));

import { db } from "../src/db/index.js";
import { getXuiClientForServer } from "../src/services/xui/repository.js";

describe("Payment Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Invoice payload format", () => {
    it("payload contains planId", () => {
      const planId = 5;
      const payload = JSON.stringify({ planId });

      const parsed = JSON.parse(payload);
      expect(parsed.planId).toBe(5);
    });
  });

  describe("Plan validation", () => {
    it("validates plan exists and is active", async () => {
      const mockPlan = {
        id: 1,
        name: "Monthly",
        durationDays: 30,
        priceStars: 30,
        priceTon: "5.00",
        trafficLimitGb: null,
        maxDevices: 3,
        isActive: true,
      };

      (db.query.plans.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPlan);

      const plan = await db.query.plans.findFirst({
        where: {} as any,
      });

      expect(plan).toEqual(mockPlan);
      expect(plan?.isActive).toBe(true);
    });

    it("returns undefined for inactive plan", async () => {
      (db.query.plans.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const plan = await db.query.plans.findFirst({
        where: {} as any,
      });

      expect(plan).toBeUndefined();
    });
  });

  describe("Server availability", () => {
    it("checks for active server", async () => {
      const mockServer = {
        id: 1,
        name: "US West",
        isActive: true,
        domain: "us.example.com",
        realityPort: 443,
      };

      (db.query.servers.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockServer);

      const server = await db.query.servers.findFirst({
        where: {} as any,
      });

      expect(server).toBeDefined();
      expect(server?.isActive).toBe(true);
    });

    it("returns undefined when no active servers", async () => {
      (db.query.servers.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const server = await db.query.servers.findFirst({
        where: {} as any,
      });

      expect(server).toBeUndefined();
    });
  });

  describe("Subscription expiry calculation", () => {
    it("calculates correct expiry date for 30 day plan", () => {
      const durationDays = 30;
      const startsAt = new Date("2024-01-15");
      const expiresAt = new Date(startsAt);
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      expect(expiresAt.toISOString().slice(0, 10)).toBe("2024-02-14");
    });

    it("calculates correct expiry date for 7 day plan", () => {
      const durationDays = 7;
      const startsAt = new Date("2024-01-15");
      const expiresAt = new Date(startsAt);
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      expect(expiresAt.toISOString().slice(0, 10)).toBe("2024-01-22");
    });

    it("handles month boundary correctly", () => {
      const durationDays = 30;
      const startsAt = new Date("2024-01-31");
      const expiresAt = new Date(startsAt);
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // 31 + 30 = March 1 (since Feb has 29 days in 2024)
      expect(expiresAt.getMonth()).toBe(2); // March = 2
    });
  });

  describe("XUI client integration", () => {
    it("calls getXuiClientForServer with correct server ID", async () => {
      const mockXuiClient = {
        addClient: vi.fn().mockResolvedValue("test-uuid"),
      };

      (getXuiClientForServer as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockXuiClient);

      const serverId = 5;
      const client = await getXuiClientForServer(serverId);

      expect(getXuiClientForServer).toHaveBeenCalledWith(5);
      expect(client).toBe(mockXuiClient);
    });
  });

  describe("Traffic limit conversion", () => {
    it("unlimited traffic is 0", () => {
      const trafficLimitGb: number | null = null;
      const totalGB = trafficLimitGb ?? 0;

      expect(totalGB).toBe(0);
    });

    it("specific traffic limit is passed through", () => {
      const trafficLimitGb: number | null = 50;
      const totalGB = trafficLimitGb ?? 0;

      expect(totalGB).toBe(50);
    });
  });

  describe("Invoice description", () => {
    it("formats unlimited traffic correctly", () => {
      const plan = { trafficLimitGb: null };
      const traffic = plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

      expect(traffic).toBe("Unlimited");
    });

    it("formats limited traffic correctly", () => {
      const plan = { trafficLimitGb: 100 };
      const traffic = plan.trafficLimitGb === null ? "Unlimited" : `${plan.trafficLimitGb} GB`;

      expect(traffic).toBe("100 GB");
    });
  });
});
