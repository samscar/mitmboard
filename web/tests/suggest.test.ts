import { describe, it, expect } from "vitest";
import { suggest } from "../src/filters/suggest";

describe("suggest", () => {
  it("completes field names by prefix", () => {
    const tokens = suggest("host:x sta").map((s) => s.token);
    expect(tokens).toContain("status:");
    expect(tokens).not.toContain("method:");
  });
  it("suggests method values", () => {
    const tokens = suggest("method:").map((s) => s.token);
    expect(tokens).toEqual(expect.arrayContaining(["method:GET", "method:POST"]));
  });
  it("filters method values by partial", () => {
    expect(suggest("method:P").map((s) => s.token)).toEqual(["method:POST", "method:PUT", "method:PATCH"]);
  });
  it("suggests PATCH", () => {
    expect(suggest("method:PAT").map((s) => s.token)).toContain("method:PATCH");
  });
  it("empty query returns field completions", () => {
    expect(suggest("").length).toBeGreaterThan(0);
  });
});

describe("device completion", () => {
  const devices = [
    { ip: "192.168.1.23", label: "iPhone" },
    { ip: "10.0.0.5", label: "Mac" },
  ];

  it("offers the device name and its IP", () => {
    const tokens = suggest("device:", devices).map((s) => s.token);
    expect(tokens).toEqual(expect.arrayContaining(["device:iPhone", "device:192.168.1.23"]));
  });

  it("filters by the typed partial", () => {
    expect(suggest("device:mac", devices).map((s) => s.token)).toEqual(["device:Mac"]);
    expect(suggest("device:10.0", devices).map((s) => s.token)).toEqual(["device:10.0.0.5"]);
  });

  it("keeps client: working with the same device list", () => {
    expect(suggest("client:10", devices).map((s) => s.token)).toEqual(["client:10.0.0.5"]);
  });

  it("lists device among the field completions", () => {
    expect(suggest("dev").map((s) => s.token)).toContain("device:");
  });
});

