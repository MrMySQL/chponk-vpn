import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../../src/db";
import { servers } from "../../src/db/schema";
import { encrypt } from "../../src/lib/crypto";
import { serverRegistrationSchema } from "../../src/lib/validators";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify authorization
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.API_TOKEN;

  if (!expectedToken) {
    return res.status(500).json({ error: "API_TOKEN not configured" });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validate input
  const parseResult = serverRegistrationSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parseResult.error.flatten(),
    });
  }

  const input = parseResult.data;

  try {
    // Encrypt password before storage
    const encryptedPassword = encrypt(input.xuiPassword);

    const [server] = await db
      .insert(servers)
      .values({
        name: input.name,
        location: input.location,
        flagEmoji: input.flagEmoji,
        host: input.host,
        domain: input.domain,
        xuiPort: input.xuiPort,
        xuiUsername: input.xuiUsername,
        xuiPassword: encryptedPassword,
        inboundId: input.inboundId,
        realityPort: input.realityPort,
        realityDest: input.realityDest,
        realitySni: input.realitySni,
        realityPublicKey: input.realityPublicKey,
        realityShortId: input.realityShortId,
      })
      .returning({
        id: servers.id,
        name: servers.name,
        domain: servers.domain,
        location: servers.location,
      });

    return res.status(201).json({
      success: true,
      server,
    });
  } catch (error) {
    console.error("Failed to register server:", error);

    // Check for unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return res.status(409).json({
        error: "A server with this domain already exists",
      });
    }

    return res.status(500).json({ error: "Failed to register server" });
  }
}
