/**
 * Cross-check: every field name the spec shows in Sections 4, 6, 7 and 8 must
 * appear somewhere in the schemas.
 *
 * Sources, per section: the keys of every JSON example block, the backticked
 * tokens of every table row, and - because Section 8 defines its intents in
 * prose rather than tables - every backticked token in Section 8.
 *
 * A token counts as covered when it appears in a schema as a property name, a
 * $defs name, a required entry, an enum member, or a const value. Nothing is
 * matched against prose in a description.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATEP_DIR, SCHEMA_DIR, readJson, schemaFiles } from "./ajv-setup";

const SPEC = fs.readFileSync(path.join(ATEP_DIR, "SPEC.md"), "utf8");
const SECTIONS = ["4", "6", "7", "8"];

/**
 * Words that appear in backticks in those sections but are not field names:
 * the type words a table row uses to say what a field holds. Values a schema
 * does encode - message types, error codes, outcomes, enum members - are
 * deliberately absent from this list, and so are checked.
 */
const NON_FIELD_TOKENS = new Set([
  "bool",
  "boolean",
  "string",
  "int",
  "integer",
  "true",
  "false",
  "null",
  "jws",
  "url",
]);

function sectionsOfInterest(): { heading: string; text: string }[] {
  const parts = SPEC.split(/\n(?=## )/g);
  return parts
    .map((part) => {
      const heading = part.split("\n", 1)[0];
      return { heading, text: part };
    })
    .filter(({ heading }) => {
      const m = /^## (\d+)\./.exec(heading);
      return m !== null && SECTIONS.includes(m[1]);
    });
}

function jsonBlockKeys(text: string): string[] {
  const keys: string[] = [];
  for (const block of text.matchAll(/```json\n([\s\S]*?)```/g)) {
    for (const m of block[1].matchAll(/"(@?[A-Za-z][A-Za-z0-9_@-]*)"\s*:/g)) keys.push(m[1]);
  }
  return keys;
}

function backtickedTokens(line: string): string[] {
  const tokens: string[] = [];
  for (const span of line.matchAll(/`([^`]+)`/g)) {
    // An HTTP method and path names an endpoint, not a field.
    if (/^(GET|POST|PUT|PATCH|DELETE)\s/.test(span[1])) continue;
    // <vendor>, <name>, <url> and the like are placeholders, not fields.
    const text = span[1].replace(/<[^>]*>/g, " ");
    for (const m of text.matchAll(/@?[A-Za-z][A-Za-z0-9_]*/g)) tokens.push(m[0]);
  }
  return tokens;
}

function collectTokens(): Map<string, string> {
  const found = new Map<string, string>(); // token -> where it was seen
  for (const { heading, text } of sectionsOfInterest()) {
    const isSection8 = heading.startsWith("## 8.");
    for (const key of jsonBlockKeys(text)) found.set(key, `${heading} (JSON example)`);
    for (const line of text.split("\n")) {
      const isTableRow = line.trimStart().startsWith("|");
      if (!isTableRow && !isSection8) continue;
      for (const token of backtickedTokens(line)) {
        found.set(token, `${heading} (${isTableRow ? "table" : "prose"})`);
      }
    }
  }
  const filtered = new Map<string, string>();
  for (const [token, where] of found) {
    if (!/^@?[a-z][a-z0-9_]*$/.test(token)) continue;
    if (NON_FIELD_TOKENS.has(token)) continue;
    filtered.set(token, where);
  }
  return filtered;
}

function collectSchemaNames(): Set<string> {
  const names = new Set<string>();
  const walk = (node: unknown, key?: string) => {
    if (Array.isArray(node)) {
      if (key === "required" || key === "enum") {
        for (const item of node) if (typeof item === "string") names.add(item);
      }
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((k === "properties" || k === "$defs" || k === "patternProperties") && v && typeof v === "object") {
        for (const name of Object.keys(v as Record<string, unknown>)) names.add(name);
      }
      if (k === "const" && typeof v === "string") names.add(v);
      walk(v, k);
    }
  };
  for (const file of schemaFiles()) walk(readJson(path.join(SCHEMA_DIR, file)));
  return names;
}

describe("spec cross-check", () => {
  const tokens = collectTokens();
  const names = collectSchemaNames();

  it("finds field names in the spec to check", () => {
    expect(tokens.size).toBeGreaterThan(80);
  });

  it("every field name in Sections 4, 6, 7 and 8 appears in the schemas", () => {
    const missing = [...tokens]
      .filter(([token]) => !names.has(token))
      .map(([token, where]) => `${token}  (${where})`);
    expect(missing, `field names not found in atep/schemas:\n${missing.join("\n")}`).toEqual([]);
  });
});
