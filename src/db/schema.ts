import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  flagEmoji: text("flag_emoji"),
  host: text("host").notNull(),
  domain: text("domain").notNull().unique(),

  xuiPort: integer("xui_port").notNull().default(2053),
  xuiUsername: text("xui_username").notNull(),
  xuiPassword: text("xui_password").notNull(), // encrypted

  inboundId: integer("inbound_id").notNull().default(1),
  realityPort: integer("reality_port").notNull().default(443),
  realityDest: text("reality_dest").notNull(),
  realitySni: text("reality_sni").notNull(),
  realityPublicKey: text("reality_public_key"),
  realityShortId: text("reality_short_id"),

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
