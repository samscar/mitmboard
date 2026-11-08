import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { tokenizeLines } from "../src/json/highlight";
import { RawLines } from "../src/components/JsonView";

const pretty = [
  "{",
  '  "retcode": 0,',
  '  "message": "Success",',
  '  "flag": true,',
  '  "coupon": null,',
  '  "list": [1, 2]',
  "}",
].join("\n");

describe("tokenizeLines (json)", () => {
  it("maps prism token types onto the jv-* palette (token text keeps the quotes)", () => {
    const lines = tokenizeLines(pretty, "json");
    const flat = lines.flat();
    expect(flat.find((t) => t.text === '"retcode"')?.cls).toBe("jv-key");
    expect(flat.find((t) => t.text === '"Success"')?.cls).toBe("jv-string");
    expect(flat.find((t) => t.text === "0")?.cls).toBe("jv-number");
    expect(flat.find((t) => t.text === "true")?.cls).toBe("jv-boolean");
    expect(flat.find((t) => t.text === "null")?.cls).toBe("jv-null");
    expect(flat.find((t) => t.text === "{")?.cls).toBe("jv-punct");
  });

  it("splits tokens across lines matching text.split('\\n') indexes", () => {
    const lines = tokenizeLines(pretty, "json");
    expect(lines).toHaveLength(pretty.split("\n").length);
    expect(lines[1].some((t) => t.cls === "jv-key" && t.text.includes("retcode"))).toBe(true);
    expect(lines[2].some((t) => t.cls === "jv-string" && t.text.includes("Success"))).toBe(true);
    expect(lines[6].some((t) => t.cls === "jv-punct" && t.text === "}")).toBe(true);
  });

  it("keeps brace lines non-empty so the gutter stays aligned", () => {
    const lines = tokenizeLines("{\n}", "json");
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });
});

describe("RawLines token rendering", () => {
  it("renders colored spans per line and keeps the gutter numbering", () => {
    render(<RawLines text={pretty} lang="json" />);
    expect(document.querySelectorAll(".jv-gutter > div")).toHaveLength(7);
    expect(document.querySelector(".jv-line .jv-key")).not.toBeNull();
    expect(screen.getByText('"Success"')).toHaveClass("jv-string");
    expect(screen.getByText("true")).toHaveClass("jv-boolean");
  });

  it("renders plain text unchanged when no lang is given", () => {
    render(<RawLines text={"not json"} />);
    expect(screen.getByText("not json")).toBeInTheDocument();
    expect(document.querySelector(".jv-key")).toBeNull();
  });
});

describe("RawLines markup rendering (prism)", () => {
  it("colors tags and attribute names via the markup grammar", () => {
    render(<RawLines text={'<html>\n  <body class="x">hi</body>\n</html>'} lang="markup" />);
    const tagWords = screen.getAllByText("body");
    expect(tagWords.length).toBeGreaterThan(0);
    for (const w of tagWords) expect(w).toHaveClass("jv-tag");
    expect(screen.getByText("class")).toHaveClass("jv-key");
    expect(screen.getByText("x", { exact: false })).toHaveClass("jv-string");
    expect(screen.getByText("hi")).not.toHaveClass("jv-tag");
  });

  it("keeps plain text untokenized", () => {
    render(<RawLines text={"plain body\nline two"} />);
    expect(document.querySelector(".jv-tag")).toBeNull();
    expect(screen.getByText("line two")).toBeInTheDocument();
  });
});
