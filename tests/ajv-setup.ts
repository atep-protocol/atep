// Filesystem helpers for the ATEP schema tests. Not a test file.
//
// The validator lives in src/validate.ts, because an endpoint validates every
// inbound message (SPEC §6.1) and production code must not import from a test
// tree. What stays here is what only a test needs: reading schemas/ and
// examples/ off disk, so a schema or example added to the repo is covered
// without anyone editing an import list.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAjv as buildAtepAjv, SCHEMA_BASE, validatorFor, errorText } from "../src/validate";

export { SCHEMA_BASE, validatorFor, errorText };

export const ATEP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA_DIR = path.join(ATEP_DIR, "schemas");
export const EXAMPLE_DIR = path.join(ATEP_DIR, "examples");

export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function schemaFiles(): string[] {
  return fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json")).sort();
}

export function exampleFiles(): string[] {
  return fs.readdirSync(EXAMPLE_DIR).filter((f) => f.endsWith(".json")).sort();
}

/**
 * The same validator the endpoint uses, but built from the schemas as they
 * are on disk right now. A file added to schemas/ and not yet listed in
 * src/validate.ts is therefore still tested — and the drift test in
 * schemas.test.ts is what catches the missing import.
 */
export function buildAjv() {
  return buildAtepAjv(schemaFiles().map((file) => readJson(path.join(SCHEMA_DIR, file))));
}

/** A deep clone of an example, for negative tests that mutate one field. */
export function example<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, name), "utf8")) as T;
}
