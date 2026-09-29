import Ajv2020Module from "ajv/dist/2020";
import type { AnySchemaObject, SchemaValidateFunction, ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";

// The ATEP validator, for PRODUCTION code. SPEC §6.1 makes schema validation
// the first gate on every inbound message, and §6.5 gives a schema failure
// its own error code (`malformed`), so this cannot live in the test tree —
// tests/ajv-setup.ts re-exports it and keeps only its filesystem
// helpers for the schema tests.
//
// Every schema is imported statically rather than read with fs. A server
// handler is bundled, and a bundle cannot readdir a directory that the
// deployment may not even have shipped; a static import is also the only
// form the type checker can see.

import card from "../schemas/card.json";
import common from "../schemas/common.json";
import delegation from "../schemas/delegation.json";
import envelope from "../schemas/envelope.json";
import intentAvailabilityRequest from "../schemas/intent.availability.request.json";
import intentAvailabilityResponse from "../schemas/intent.availability.response.json";
import intentBookRequest from "../schemas/intent.book.request.json";
import intentBookResponse from "../schemas/intent.book.response.json";
import intentCancelRequest from "../schemas/intent.cancel.request.json";
import intentCancelResponse from "../schemas/intent.cancel.response.json";
import intentHandoffRequest from "../schemas/intent.handoff.request.json";
import intentHandoffResponse from "../schemas/intent.handoff.response.json";
import intentMessageRequest from "../schemas/intent.message.request.json";
import intentMessageResponse from "../schemas/intent.message.response.json";
import intentQuoteRequest from "../schemas/intent.quote.request.json";
import intentQuoteResponse from "../schemas/intent.quote.response.json";
import intentRescheduleRequest from "../schemas/intent.reschedule.request.json";
import intentRescheduleResponse from "../schemas/intent.reschedule.response.json";
import mandate from "../schemas/mandate.json";
import messageBind from "../schemas/message.bind.json";
import messageBound from "../schemas/message.bound.json";
import messageConfirm from "../schemas/message.confirm.json";
import messageDelegation from "../schemas/message.delegation.json";
import messageDelegationAck from "../schemas/message.delegation_ack.json";
import messageError from "../schemas/message.error.json";
import messageFallback from "../schemas/message.fallback.json";
import messageHandoff from "../schemas/message.handoff.json";
import messageHello from "../schemas/message.hello.json";
import messageHelloAck from "../schemas/message.hello_ack.json";
import messageIntent from "../schemas/message.intent.json";
import messageMandate from "../schemas/message.mandate.json";
import messageReceipt from "../schemas/message.receipt.json";
import messageRelease from "../schemas/message.release.json";
import messageReleaseAck from "../schemas/message.release_ack.json";
import messageResult from "../schemas/message.result.json";
import messageWorking from "../schemas/message.working.json";
import receipt from "../schemas/receipt.json";
import registryCards from "../schemas/registry.cards.json";
import registryNumberRegistration from "../schemas/registry.number-registration.json";
import registryNumber from "../schemas/registry.number.json";
import registryPlatform from "../schemas/registry.platform.json";
import registryVerificationStarted from "../schemas/registry.verification-started.json";
import registryVerification from "../schemas/registry.verification.json";

/** Where the schemas live in $ref space. Every $id is this plus the filename. */
export const SCHEMA_BASE = "https://atep.io/schemas/1.0/";

/** Every ATEP schema, in the order Ajv registers them. */
export const ATEP_SCHEMAS: readonly unknown[] = [
  card,
  common,
  delegation,
  envelope,
  intentAvailabilityRequest,
  intentAvailabilityResponse,
  intentBookRequest,
  intentBookResponse,
  intentCancelRequest,
  intentCancelResponse,
  intentHandoffRequest,
  intentHandoffResponse,
  intentMessageRequest,
  intentMessageResponse,
  intentQuoteRequest,
  intentQuoteResponse,
  intentRescheduleRequest,
  intentRescheduleResponse,
  mandate,
  messageBind,
  messageBound,
  messageConfirm,
  messageDelegation,
  messageDelegationAck,
  messageError,
  messageFallback,
  messageHandoff,
  messageHello,
  messageHelloAck,
  messageIntent,
  messageMandate,
  messageReceipt,
  messageRelease,
  messageReleaseAck,
  messageResult,
  messageWorking,
  receipt,
  registryCards,
  registryNumberRegistration,
  registryNumber,
  registryPlatform,
  registryVerificationStarted,
  registryVerification,
];

type Ctor<T> = { default?: T };
const Ajv2020 = ((Ajv2020Module as unknown as Ctor<typeof Ajv2020Module>).default ??
  Ajv2020Module) as typeof Ajv2020Module;
const addFormats = ((addFormatsModule as unknown as Ctor<typeof addFormatsModule>).default ??
  addFormatsModule) as typeof addFormatsModule;

function lifetimeSeconds(data: Record<string, unknown>, from: string, to: string): number | null {
  const a = data[from];
  const b = data[to];
  if (typeof a !== "string" || typeof b !== "string") return null;
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return (end - start) / 1000;
}

/**
 * Builds the ATEP validator: every schema in schemas/ plus the three custom
 * keywords that carry MUSTs JSON Schema alone cannot express (Sections 4.1, 6.1, 7.1, 7.2).
 * Every keyword name is x-prefixed, so a validator that does not know them ignores them.
 */
export function buildAjv(schemas: readonly unknown[] = ATEP_SCHEMAS) {
  // strictRequired is off: an if/then branch names properties declared in the outer
  // schema, which is how the conditional MUSTs of Sections 6.4, 7.2, 8.2 and 8.5 are written.
  const ajv = new Ajv2020({
    strict: true,
    strictRequired: false,
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);

  // Section 4.1: card expires <= 400 days after issued.
  // Section 7.1: delegation expires <= 24 hours after issued.
  // Section 7.2: mandate expires <= 1 hour after issued.
  const maxLifetime: SchemaValidateFunction = (schema, data) => {
    const cap = schema as { from: string; to: string; maxSeconds: number };
    if (typeof data !== "object" || data === null) return true;
    const seconds = lifetimeSeconds(data as Record<string, unknown>, cap.from, cap.to);
    if (seconds === null) return true;
    if (seconds >= 0 && seconds <= cap.maxSeconds) return true;
    maxLifetime.errors = [
      {
        keyword: "x-atep-max-lifetime",
        message:
          seconds < 0
            ? `${cap.to} is before ${cap.from}`
            : `${cap.to} is more than ${cap.maxSeconds} seconds after ${cap.from}`,
        params: { seconds, maxSeconds: cap.maxSeconds },
      },
    ];
    return false;
  };
  ajv.addKeyword({
    keyword: "x-atep-max-lifetime",
    schemaType: "object",
    errors: true,
    validate: maxLifetime,
  });

  // Section 6.1: a message whose envelope session disagrees with a session in
  // its body is rejected with malformed.
  const sessionMatchesBody: SchemaValidateFunction = (schema, data) => {
    const where = schema as { envelope: string; body: string };
    if (typeof data !== "object" || data === null) return true;
    const message = data as Record<string, unknown>;
    const envelopeValue = message[where.envelope];
    const bodyValue = message[where.body];
    if (typeof envelopeValue !== "string" || typeof bodyValue !== "object" || bodyValue === null) return true;
    const inner = (bodyValue as Record<string, unknown>)[where.envelope];
    if (typeof inner !== "string" || inner === envelopeValue) return true;
    sessionMatchesBody.errors = [
      {
        keyword: "x-atep-session-matches-body",
        message: `${where.body}.${where.envelope} does not match ${where.envelope}`,
        params: { envelope: envelopeValue, body: inner },
      },
    ];
    return false;
  };
  ajv.addKeyword({
    keyword: "x-atep-session-matches-body",
    schemaType: "object",
    errors: true,
    validate: sessionMatchesBody,
  });

  // Section 4.1: the disclosure sentence MUST name the party.
  const disclosureNamesParty: SchemaValidateFunction = (schema, data) => {
    if (schema !== true) return true;
    if (typeof data !== "object" || data === null) return true;
    const cardData = data as { disclosure?: unknown; party?: { name?: unknown } };
    const disclosure = cardData.disclosure;
    const name = cardData.party?.name;
    if (typeof disclosure !== "string" || typeof name !== "string") return true;
    const normalize = (s: string) => s.toLowerCase().replace(/[\s\u2019'".,]+/g, " ").trim();
    if (normalize(disclosure).includes(normalize(name))) return true;
    disclosureNamesParty.errors = [
      {
        keyword: "x-atep-disclosure-names-party",
        message: "disclosure does not name party.name",
        params: { name },
      },
    ];
    return false;
  };
  ajv.addKeyword({
    keyword: "x-atep-disclosure-names-party",
    schemaType: "boolean",
    errors: true,
    validate: disclosureNamesParty,
  });

  for (const schema of schemas) ajv.addSchema(schema as AnySchemaObject);
  return ajv;
}

export function validatorFor(ajv: ReturnType<typeof buildAjv>, ref: string): ValidateFunction {
  const validate = ajv.getSchema(ref.startsWith("https://") ? ref : SCHEMA_BASE + ref);
  if (!validate) throw new Error(`no schema for ${ref}`);
  return validate;
}

export function errorText(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.keyword} ${e.message ?? ""}`)
    .join("; ");
}

// Compiling forty-odd schemas costs a few milliseconds; SPEC §6.1 gives the
// whole response two seconds, so it is paid once per process and cached.
let shared: ReturnType<typeof buildAjv> | null = null;
export function atepAjv(): ReturnType<typeof buildAjv> {
  if (!shared) shared = buildAjv();
  return shared;
}

const compiled = new Map<string, ValidateFunction>();
function validator(ref: string): ValidateFunction {
  let fn = compiled.get(ref);
  if (!fn) {
    fn = validatorFor(atepAjv(), ref);
    compiled.set(ref, fn);
  }
  return fn;
}

export interface SchemaCheck {
  ok: boolean;
  /** Human-readable, for the `detail.text` of a `malformed` error and the log. */
  errors: string;
}

/** Validate any value against one ATEP schema, by file name or $id. */
export function validateAgainst(ref: string, value: unknown): SchemaCheck {
  const fn = validator(ref);
  const ok = fn(value) as boolean;
  return { ok, errors: ok ? "" : errorText(fn) };
}

/**
 * SPEC §6.1's first gate: the whole envelope, discriminated on `type`, with
 * the body schema for that type and the envelope/body `session` agreement
 * check applied. Everything a `malformed` verdict rests on.
 */
export function validateEnvelope(message: unknown): SchemaCheck {
  return validateAgainst("envelope.json", message);
}
