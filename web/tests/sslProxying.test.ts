import { describe, expect, it } from "vitest";
import {
  isValidJsRegex, matchesHostPort, toCanonicalRegex, wildcardToRegex,
} from "../src/sslProxying";

describe("wildcard shorthand -> canonical ignore_hosts regex", () => {
  it("anchors a plain host and tolerates host:port", () => {
    expect(wildcardToRegex("example.com")).toBe("^example\\.com(:\\d+)?$");
    expect(matchesHostPort(wildcardToRegex("example.com"), "example.com:443")).toBe(true);
    expect(matchesHostPort(wildcardToRegex("example.com"), "EXAMPLE.COM:443")).toBe(true);
    expect(matchesHostPort(wildcardToRegex("example.com"), "notexample.com:443")).toBe(false);
  });

  it("maps * and ? and escapes every other metacharacter", () => {
    expect(wildcardToRegex("*.example.com")).toBe("^.*\\.example\\.com(:\\d+)?$");
    expect(wildcardToRegex("api?.example.com")).toBe("^api.\\.example\\.com(:\\d+)?$");
    expect(wildcardToRegex("api-v1+test[1].example.com"))
      .toBe("^api\\-v1\\+test\\[1\\]\\.example\\.com(:\\d+)?$");
  });

  it("expands the user's 10.53.*.* shorthand correctly", () => {
    const rex = wildcardToRegex("10.53.*.*");
    expect(rex).toBe("^10\\.53\\..*\\..*(:\\d+)?$");
    expect(matchesHostPort(rex, "10.53.1.20:8443")).toBe(true);
    expect(matchesHostPort(rex, "10.53.1.20")).toBe(true);
    expect(matchesHostPort(rex, "api.example.com:443")).toBe(false);
  });

  it("restricts to :443 when requested", () => {
    const rex = wildcardToRegex("*.example.com", true);
    expect(rex).toBe("^.*\\.example\\.com:443$");
    expect(matchesHostPort(rex, "api.example.com:443")).toBe(true);
    expect(matchesHostPort(rex, "api.example.com:8443")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(() => wildcardToRegex("  ")).toThrow();
  });
});

describe("entry modes and JS regex compatibility", () => {
  it("leaves a raw regex untouched", () => {
    expect(toCanonicalRegex("(?i)google", "regex")).toBe("(?i)google");
    expect(toCanonicalRegex("  ^a\\.com$  ", "regex")).toBe("^a\\.com$");
  });

  it("normalises Python-only inline flags for the browser matcher", () => {
    expect(matchesHostPort("(?i)google", "API.GOOGLE.COM:443")).toBe(true);
    expect(matchesHostPort("^(?i:gateway\\.icloud\\.com):443$", "GATEWAY.icloud.com:443")).toBe(true);
  });

  it("flags invalid regexes", () => {
    expect(isValidJsRegex("^ok$")).toBe(true);
    expect(isValidJsRegex("([")).toBe(false);
  });
});
