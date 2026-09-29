#!/usr/bin/env node
// Validate an ATEP document against one of the schemas in atep/schemas.
//
//   node atep/validate.mjs card atep/examples/card.json
//   node atep/validate.mjs envelope some-message.json
//   node atep/validate.mjs intent.book.request booking.json
//
// Exits 0 when the document is valid, 1 with the errors when it is not.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(HERE, "schemas");
const Ajv = Ajv2020.default ?? Ajv2020;
const formats = addFormats.default ?? addFormats;

const [name, file] = process.argv.slice(2);
if (!name || !file) {
  console.error("usage: node atep/validate.mjs <schema> <file.json>");
  console.error("       <schema> is a file name under atep/schemas, with or without .json");
  process.exit(2);
}

const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: true, allowUnionTypes: true });
formats(ajv);

// Sections 4.1, 7.1 and 7.2: a lifetime cap between two RFC 3339 fields.
ajv.addKeyword({
  keyword: "x-atep-max-lifetime",
  schemaType: "object",
  errors: true,
  validate: function check(schema, data) {
    if (typeof data !== "object" || data === null) return true;
    const from = Date.parse(data[schema.from]);
    const to = Date.parse(data[schema.to]);
    if (Number.isNaN(from) || Number.isNaN(to)) return true;
    const seconds = (to - from) / 1000;
    if (seconds >= 0 && seconds <= schema.maxSeconds) return true;
    check.errors = [
      {
        keyword: "x-atep-max-lifetime",
        message: `${schema.to} must be no more than ${schema.maxSeconds} seconds after ${schema.from}`,
        params: { seconds, maxSeconds: schema.maxSeconds },
      },
    ];
    return false;
  },
});

// Section 6.1: the envelope session and any session in the body must agree.
ajv.addKeyword({
  keyword: "x-atep-session-matches-body",
  schemaType: "object",
  errors: true,
  validate: function check(schema, data) {
    if (typeof data !== "object" || data === null) return true;
    const envelope = data[schema.envelope];
    const body = data[schema.body];
    if (typeof envelope !== "string" || typeof body !== "object" || body === null) return true;
    const inner = body[schema.envelope];
    if (typeof inner !== "string" || inner === envelope) return true;
    check.errors = [
      {
        keyword: "x-atep-session-matches-body",
        message: `${schema.body}.${schema.envelope} must equal ${schema.envelope}`,
        params: { envelope, body: inner },
      },
    ];
    return false;
  },
});

// Section 4.1: the disclosure sentence MUST name the party.
ajv.addKeyword({
  keyword: "x-atep-disclosure-names-party",
  schemaType: "boolean",
  errors: true,
  validate: function check(schema, data) {
    if (!schema || typeof data !== "object" || data === null) return true;
    const { disclosure, party } = data;
    if (typeof disclosure !== "string" || typeof party?.name !== "string") return true;
    const normalize = (s) => s.toLowerCase().replace(/[\s’'".,]+/g, " ").trim();
    if (normalize(disclosure).includes(normalize(party.name))) return true;
    check.errors = [
      {
        keyword: "x-atep-disclosure-names-party",
        message: "disclosure must name party.name",
        params: { name: party.name },
      },
    ];
    return false;
  },
});

for (const f of fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json"))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), "utf8")));
}

const id = `https://atep.io/schemas/1.0/${name.endsWith(".json") ? name : `${name}.json`}`;
const validate = ajv.getSchema(id);
if (!validate) {
  console.error(`no schema ${id}`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (validate(data)) {
  console.log(`${file} is a valid ${path.basename(id)}`);
  process.exit(0);
}
for (const e of validate.errors) console.error(`${e.instancePath || "/"} ${e.keyword} ${e.message}`);
process.exit(1);
