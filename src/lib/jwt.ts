import * as crypto from "crypto";

interface JWTPayload {
  sub: number;
  telegramId: string;
  isAdmin: boolean;
  iat: number;
  exp: number;
}

function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.isBuffer(data)
    ? data.toString("base64")
    : Buffer.from(data).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return Buffer.from(padded, "base64").toString("utf-8");
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return secret;
}

export function signJWT(payload: Omit<JWTPayload, "iat" | "exp">): string {
  const secret = getSecret();

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + 24 * 60 * 60, // 24 hours
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  const actualSignature = Buffer.from(
    encodedSignature.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  if (expectedSignature.length !== actualSignature.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedSignature, actualSignature)) {
    return null;
  }

  // Decode and validate payload
  try {
    const payload: JWTPayload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    // Validate required fields
    if (
      typeof payload.sub !== "number" ||
      typeof payload.telegramId !== "string" ||
      typeof payload.isAdmin !== "boolean"
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function validateTelegramAuth(
  data: Record<string, string>,
  botToken: string
): boolean {
  const { hash, ...rest } = data;

  if (!hash) {
    return false;
  }

  // Check auth_date is recent (within 5 minutes)
  const authDate = parseInt(rest.auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(authDate) || now - authDate > 300) {
    return false;
  }

  // Build check string
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  // Calculate secret key (SHA256 of bot token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // Calculate HMAC
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  return hmac === hash;
}
