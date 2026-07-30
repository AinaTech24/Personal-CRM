import { describe, expect, it, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "test-only-key-do-not-use-in-prod";
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const encrypted = encryptSecret("hunter2");
    expect(encrypted).not.toContain("hunter2");
    expect(decryptSecret(encrypted)).toBe("hunter2");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const a = encryptSecret("same-password");
    const b = encryptSecret("same-password");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-password");
    expect(decryptSecret(b)).toBe("same-password");
  });

  it("throws on a tampered payload rather than returning garbage", () => {
    const encrypted = encryptSecret("hunter2");
    const [iv, tag] = encrypted.split(":");
    const tampered = [iv, tag, Buffer.from("tampered-data").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("handles unicode content", () => {
    const encrypted = encryptSecret("pässwörd-123-üñïçødé");
    expect(decryptSecret(encrypted)).toBe("pässwörd-123-üñïçødé");
  });
});
