import { describe, it, expect } from "vitest";
import { servers } from "../src/db/schema";
import { getTableName, getTableColumns } from "drizzle-orm";

describe("servers schema", () => {
  it("has correct table name", () => {
    expect(getTableName(servers)).toBe("servers");
  });

  it("has all required columns", () => {
    const columns = getTableColumns(servers);
    const columnNames = Object.keys(columns);

    const expectedColumns = [
      "id",
      "name",
      "location",
      "flagEmoji",
      "host",
      "domain",
      "xuiPort",
      "xuiUsername",
      "xuiPassword",
      "inboundId",
      "realityPort",
      "realityDest",
      "realitySni",
      "realityPublicKey",
      "realityShortId",
      "isActive",
      "createdAt",
      "updatedAt",
    ];

    expectedColumns.forEach((col) => {
      expect(columnNames).toContain(col);
    });
  });

  it("has correct column database names", () => {
    const columns = getTableColumns(servers);

    expect(columns.id.name).toBe("id");
    expect(columns.flagEmoji.name).toBe("flag_emoji");
    expect(columns.xuiPort.name).toBe("xui_port");
    expect(columns.xuiUsername.name).toBe("xui_username");
    expect(columns.xuiPassword.name).toBe("xui_password");
    expect(columns.inboundId.name).toBe("inbound_id");
    expect(columns.realityPort.name).toBe("reality_port");
    expect(columns.realityDest.name).toBe("reality_dest");
    expect(columns.realitySni.name).toBe("reality_sni");
    expect(columns.realityPublicKey.name).toBe("reality_public_key");
    expect(columns.realityShortId.name).toBe("reality_short_id");
    expect(columns.isActive.name).toBe("is_active");
    expect(columns.createdAt.name).toBe("created_at");
    expect(columns.updatedAt.name).toBe("updated_at");
  });

  it("has id as primary key", () => {
    const columns = getTableColumns(servers);
    expect(columns.id.primary).toBe(true);
  });

  it("has correct not-null constraints", () => {
    const columns = getTableColumns(servers);

    // Required fields
    expect(columns.name.notNull).toBe(true);
    expect(columns.location.notNull).toBe(true);
    expect(columns.host.notNull).toBe(true);
    expect(columns.domain.notNull).toBe(true);
    expect(columns.xuiPort.notNull).toBe(true);
    expect(columns.xuiUsername.notNull).toBe(true);
    expect(columns.xuiPassword.notNull).toBe(true);
    expect(columns.inboundId.notNull).toBe(true);
    expect(columns.realityPort.notNull).toBe(true);
    expect(columns.realityDest.notNull).toBe(true);
    expect(columns.realitySni.notNull).toBe(true);
    expect(columns.isActive.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);

    // Optional fields
    expect(columns.flagEmoji.notNull).toBe(false);
    expect(columns.realityPublicKey.notNull).toBe(false);
    expect(columns.realityShortId.notNull).toBe(false);
  });

  it("has correct default values", () => {
    const columns = getTableColumns(servers);

    expect(columns.xuiPort.hasDefault).toBe(true);
    expect(columns.inboundId.hasDefault).toBe(true);
    expect(columns.realityPort.hasDefault).toBe(true);
    expect(columns.isActive.hasDefault).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
    expect(columns.updatedAt.hasDefault).toBe(true);
  });

  it("domain column is unique", () => {
    const columns = getTableColumns(servers);
    expect(columns.domain.isUnique).toBe(true);
  });

  it("exports type definitions", () => {
    // Type exports are verified at compile time by TypeScript
    // This test ensures the module is importable
    expect(servers).toBeDefined();
  });
});
