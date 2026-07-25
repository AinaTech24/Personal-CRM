import { describe, expect, it } from "vitest";
import { isValidPin, normalizeMobile, isValidMobile } from "./credentials";

describe("isValidPin", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("000000")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidPin("12345")).toBe(false); // too short
    expect(isValidPin("1234567")).toBe(false); // too long
    expect(isValidPin("12a456")).toBe(false); // not all digits
    expect(isValidPin("")).toBe(false);
  });
});

describe("normalizeMobile", () => {
  it("leaves a plain 10-digit number as-is", () => {
    expect(normalizeMobile("9876543210")).toBe("9876543210");
  });

  it("strips spaces, dashes, and a +91 country code", () => {
    expect(normalizeMobile("+91 98765 43210")).toBe("9876543210");
    expect(normalizeMobile("+91-98765-43210")).toBe("9876543210");
  });

  it("strips a leading trunk 0", () => {
    expect(normalizeMobile("09876543210")).toBe("9876543210");
  });

  it("handles a trunk 0 and country code together", () => {
    expect(normalizeMobile("0919876543210")).toBe("9876543210");
  });
});

describe("isValidMobile", () => {
  it("is true for anything that normalizes to 10 digits", () => {
    expect(isValidMobile("+91 98765 43210")).toBe(true);
    expect(isValidMobile("9876543210")).toBe(true);
  });

  it("is false for too few or too many digits", () => {
    expect(isValidMobile("12345")).toBe(false);
    expect(isValidMobile("")).toBe(false);
  });
});
