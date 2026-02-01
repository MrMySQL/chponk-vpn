import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  languageCode: text("language_code").notNull().default("en"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Plans table
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  durationDays: integer("duration_days").notNull(),
  priceStars: integer("price_stars").notNull(),
  priceTon: text("price_ton").notNull(), // decimal as string
  trafficLimitGb: integer("traffic_limit_gb"), // nullable = unlimited
  maxDevices: integer("max_devices").notNull().default(3),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  clientUuid: text("client_uuid").notNull(), // UUID for 3x-ui clients
  status: text("status").notNull().default("active"), // active|expired|cancelled
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  trafficUsedBytes: bigint("traffic_used_bytes", { mode: "bigint" })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

// Payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id), // nullable
  amount: text("amount").notNull(), // decimal as string
  currency: text("currency").notNull(), // stars|ton
  status: text("status").notNull().default("pending"),
  providerId: text("provider_id"), // nullable
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  payments: many(payments),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [subscriptions.userId],
      references: [users.id],
    }),
    plan: one(plans, {
      fields: [subscriptions.planId],
      references: [plans.id],
    }),
    payments: many(payments),
  })
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));
