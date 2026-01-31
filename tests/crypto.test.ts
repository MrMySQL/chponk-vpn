import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("crypto", () => {
  const VALID_KEY = "12345678901234567890123456789012"; // 32 chars

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", VALID_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("encrypts and decrypts a string correctly", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const plaintext = "my-secret-password";

    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const { encrypt } = await import("../src/lib/crypto");
    const plaintext = "my-secret-password";

    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("encrypted format contains three colon-separated parts", async () => {
    const { encrypt } = await import("../src/lib/crypto");
    const encrypted = encrypt("test");

    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    parts.forEach((part) => {
      expect(part.length).toBeGreaterThan(0);
    });
  });

  it("handles empty string", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const plaintext = "";

    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("handles unicode characters", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const plaintext = "パスワード🔐密码";

    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("handles long strings", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const plaintext = "a".repeat(10000);

    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("throws error when ENCRYPTION_KEY is missing", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.resetModules();

    const { encrypt } = await import("../src/lib/crypto");

    expect(() => encrypt("test")).toThrow(
      "ENCRYPTION_KEY must be exactly 32 characters"
    );
  });

  it("throws error when ENCRYPTION_KEY is wrong length", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "too-short");
    vi.resetModules();

    const { encrypt } = await import("../src/lib/crypto");

    expect(() => encrypt("test")).toThrow(
      "ENCRYPTION_KEY must be exactly 32 characters"
    );
  });

  it("fails to decrypt with wrong key", async () => {
    const { encrypt } = await import("../src/lib/crypto");
    const encrypted = encrypt("secret");

    // Change the key
    vi.stubEnv("ENCRYPTION_KEY", "abcdefghijklmnopqrstuvwxyz123456");
    vi.resetModules();

    const { decrypt } = await import("../src/lib/crypto");

    expect(() => decrypt(encrypted)).toThrow();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const encrypted = encrypt("secret");

    // Tamper with the encrypted data
    const parts = encrypted.split(":");
    parts[2] = Buffer.from("tampered").toString("base64");
    const tampered = parts.join(":");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("fails to decrypt with tampered auth tag", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const encrypted = encrypt("secret");

    // Tamper with the auth tag
    const parts = encrypted.split(":");
    parts[1] = Buffer.from("0000000000000000").toString("base64");
    const tampered = parts.join(":");

    expect(() => decrypt(tampered)).toThrow();
  });
});
