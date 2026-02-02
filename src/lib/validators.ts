import { z } from "zod";

export const serverRegistrationSchema = z.object({
  name: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  flagEmoji: z.string().max(10).optional(),
  host: z.string().ip(),
  domain: z.string().min(1).max(255),

  xuiPort: z.number().int().min(1).max(65535).default(2053),
  xuiBasePath: z.string().max(255).optional(),
  xuiUsername: z.string().min(1).max(100),
  xuiPassword: z.string().min(1),

  inboundId: z.number().int().positive().default(1),
  realityPort: z.number().int().min(1).max(65535).default(443),
  realityDest: z.string().min(1).max(255),
  realitySni: z.string().min(1).max(255),
  realityPublicKey: z.string().max(255).optional(),
  realityShortId: z.string().max(50).optional(),
});

export type ServerRegistrationInput = z.infer<typeof serverRegistrationSchema>;

// User validators
export const userSchema = z.object({
  telegramId: z.bigint(),
  username: z.string().max(100).nullable().optional(),
  firstName: z.string().max(100).nullable().optional(),
  languageCode: z.string().max(10).default("en"),
  isAdmin: z.boolean().default(false),
  isBanned: z.boolean().default(false),
});

export type UserInput = z.infer<typeof userSchema>;

// Plan validators
export const planSchema = z.object({
  name: z.string().min(1).max(100),
  durationDays: z.number().int().positive(),
  priceStars: z.number().int().nonnegative(),
  priceTon: z.string().regex(/^\d+(\.\d+)?$/, "Must be a valid decimal string"),
  trafficLimitGb: z.number().int().positive().nullable().optional(),
  maxDevices: z.number().int().positive().default(3),
  isActive: z.boolean().default(true),
});

export type PlanInput = z.infer<typeof planSchema>;

// Subscription validators
export const subscriptionSchema = z.object({
  userId: z.number().int().positive(),
  planId: z.number().int().positive(),
  clientUuid: z.string().uuid(),
  status: z.enum(["active", "expired", "cancelled"]).default("active"),
  startsAt: z.date().optional(),
  expiresAt: z.date(),
  trafficUsedBytes: z.bigint().nonnegative().default(BigInt(0)),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

// Payment validators
export const paymentSchema = z.object({
  userId: z.number().int().positive(),
  subscriptionId: z.number().int().positive().nullable().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Must be a valid decimal string"),
  currency: z.enum(["stars", "ton"]),
  status: z.enum(["pending", "completed", "failed", "refunded"]).default("pending"),
  providerId: z.string().max(255).nullable().optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
