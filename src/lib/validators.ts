import { z } from "zod";

export const serverRegistrationSchema = z.object({
  name: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  flagEmoji: z.string().max(10).optional(),
  host: z.string().ip(),
  domain: z.string().min(1).max(255),

  xuiPort: z.number().int().min(1).max(65535).default(2053),
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
