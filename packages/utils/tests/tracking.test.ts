import { describe, expect, it } from "vitest";
import { shiprocketTrackingUrl } from "../src/tracking";

describe("shiprocketTrackingUrl", () => {
  it("builds the public tracking URL for a plain numeric AWB", () => {
    expect(shiprocketTrackingUrl("700054910")).toBe("https://shiprocket.co/tracking/700054910");
  });

  it("accepts alphanumeric AWBs with dashes, dots and underscores", () => {
    expect(shiprocketTrackingUrl("RM992244551IN")).toBe("https://shiprocket.co/tracking/RM992244551IN");
    expect(shiprocketTrackingUrl("AWB-BLD-894102948")).toBe("https://shiprocket.co/tracking/AWB-BLD-894102948");
    expect(shiprocketTrackingUrl("FMPP.112_3")).toBe("https://shiprocket.co/tracking/FMPP.112_3");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(shiprocketTrackingUrl("  700054910  ")).toBe("https://shiprocket.co/tracking/700054910");
  });

  it("returns null for shapes Shiprocket would not recognise (no link is invented)", () => {
    expect(shiprocketTrackingUrl("")).toBeNull();
    expect(shiprocketTrackingUrl("   ")).toBeNull();
    expect(shiprocketTrackingUrl("ab")).toBeNull(); // too short
    expect(shiprocketTrackingUrl("has space 123")).toBeNull();
    expect(shiprocketTrackingUrl("AWB/SLASH")).toBeNull();
    expect(shiprocketTrackingUrl("https://evil.example")).toBeNull(); // URL injection
  });

  it("URL-encodes characters that are valid in the pattern", () => {
    // dots and underscores are pattern-legal; encodeURIComponent leaves them intact
    expect(shiprocketTrackingUrl("A.B_C-D")).toBe("https://shiprocket.co/tracking/A.B_C-D");
  });
});
