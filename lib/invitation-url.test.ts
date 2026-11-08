import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildInvitationUrl, getAppOrigin } from "./invitation-url.ts";

describe("buildInvitationUrl", () => {
  it("builds a local development URL", () => {
    const url = buildInvitationUrl("http://localhost:3000", "abc123");
    expect(url).toBe("http://localhost:3000/reflect?token=abc123");
  });

  it("builds a Vercel Preview URL", () => {
    const url = buildInvitationUrl(
      "https://trace-git-feature-abc123-davidz580.vercel.app",
      "preview-token"
    );
    expect(url).toBe(
      "https://trace-git-feature-abc123-davidz580.vercel.app/reflect?token=preview-token"
    );
  });

  it("builds a production URL", () => {
    const url = buildInvitationUrl("https://trace.vercel.app", "prod-token");
    expect(url).toBe("https://trace.vercel.app/reflect?token=prod-token");
  });

  it("strips trailing slashes from the origin", () => {
    const url = buildInvitationUrl("https://trace.vercel.app/", "tok");
    expect(url).toBe("https://trace.vercel.app/reflect?token=tok");
  });

  it("produces identical URLs when given identical inputs", () => {
    const origin = "https://trace.vercel.app";
    const token = "same-token";
    const first = buildInvitationUrl(origin, token);
    const second = buildInvitationUrl(origin, token);
    expect(first).toBe(second);
  });

  it("produces a URL suitable for both copy-link and QR code (regression)", () => {
    const origin = "https://trace.vercel.app";
    const token = "abc123";
    const url = buildInvitationUrl(origin, token);
    expect(url).toMatch(/^https:\/\/trace\.vercel\.app\/reflect\?token=/);
    expect(url).toContain(token);
  });

  it("URL-encodes the token", () => {
    const url = buildInvitationUrl("https://trace.vercel.app", "a+b=c&d");
    expect(url).toBe(
      "https://trace.vercel.app/reflect?token=a%2Bb%3Dc%26d"
    );
  });
});

describe("getAppOrigin", () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
    delete process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns https://VERCEL_URL when VERCEL_URL is set", () => {
    process.env.VERCEL_URL = "trace-davidz580.vercel.app";
    expect(getAppOrigin()).toBe("https://trace-davidz580.vercel.app");
  });

  it("returns NEXT_PUBLIC_APP_URL when set and VERCEL_URL is missing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom.example.com";
    expect(getAppOrigin()).toBe("https://custom.example.com");
  });

  it("strips trailing slash from NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom.example.com/";
    expect(getAppOrigin()).toBe("https://custom.example.com");
  });

  it("falls back to localhost in development", () => {
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("never returns localhost when VERCEL_URL is set", () => {
    process.env.VERCEL_URL = "trace-git-xyz123.vercel.app";
    const origin = getAppOrigin();
    expect(origin).not.toContain("localhost");
    expect(origin.startsWith("https://")).toBe(true);
  });

  it("never returns localhost when NEXT_PUBLIC_APP_URL is set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://trace.vercel.app";
    const origin = getAppOrigin();
    expect(origin).not.toContain("localhost");
  });
});
