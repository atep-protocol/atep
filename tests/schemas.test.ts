import { describe, expect, it } from "vitest";
import {
  buildAjv,
  errorText,
  example,
  exampleFiles,
  schemaFiles,
  validatorFor,
} from "./ajv-setup";

const ajv = buildAjv();

/**
 * Examples whose schema is not simply the same file name under atep/schemas:
 * a JSON Pointer into a schema, or a second example for one schema.
 */
const SPECIAL: Record<string, string> = {
  "delegation.credential.json": "delegation.json#/$defs/credential_payload",
  "delegation.credential.healthcare.json": "delegation.json#/$defs/credential_payload_healthcare",
  "intent.quote.request.accept.json": "intent.quote.request.json",
};

/** Schemas that are definitions only and so carry no example of their own. */
const NO_EXAMPLE = new Set(["common.json"]);

/** Examples that are not a single instance of one schema. */
const ARRAY_OF = { "session.appendix-b.json": "envelope.json" } as const;

function ok(ref: string, data: unknown) {
  const validate = validatorFor(ajv, ref);
  const valid = validate(data);
  return { valid, errors: errorText(validate) };
}

function expectValid(ref: string, data: unknown) {
  const r = ok(ref, data);
  expect(r.errors, `${ref} should accept this instance`).toBe("");
  expect(r.valid).toBe(true);
}

function expectInvalid(ref: string, data: unknown) {
  const r = ok(ref, data);
  expect(r.valid, `${ref} should reject this instance`).toBe(false);
}

describe("every schema compiles", () => {
  for (const file of schemaFiles()) {
    it(file, () => {
      expect(() => validatorFor(ajv, file)).not.toThrow();
    });
  }
});

describe("every example validates against its schema", () => {
  for (const file of exampleFiles()) {
    if (file in ARRAY_OF) continue;
    const ref = SPECIAL[file] ?? file;
    it(`${file} -> ${ref}`, () => {
      expectValid(ref, example(file));
    });
  }

  it("session.appendix-b.json is an array of valid envelopes", () => {
    const session = example<unknown[]>("session.appendix-b.json");
    expect(Array.isArray(session)).toBe(true);
    expect(session.length).toBe(15);
    for (const message of session) expectValid("envelope.json", message);
  });
});

describe("every schema has an example", () => {
  const covered = new Set(
    exampleFiles().map((f) => (SPECIAL[f] ?? ARRAY_OF[f as keyof typeof ARRAY_OF] ?? f).split("#")[0]),
  );
  for (const file of schemaFiles()) {
    if (NO_EXAMPLE.has(file)) continue;
    it(file, () => {
      expect(covered.has(file), `no example for ${file}`).toBe(true);
    });
  }
});

describe("Section 3: unknown fields are ignored", () => {
  it("a card with an unknown field is still valid", () => {
    const card = example<Record<string, unknown>>("card.json");
    expectValid("card.json", { ...card, "x-vendor-extra": { anything: true } });
  });

  it("a book request with an unknown field is still valid", () => {
    const request = example<Record<string, unknown>>("intent.book.request.json");
    expectValid("intent.book.request.json", { ...request, unknown_field: "ignored" });
  });
});

describe("negative tests: MUSTs the schemas enforce", () => {
  it("1. Section 3: a number without the leading + is not E.164", () => {
    const card = example<{ numbers: string[] }>("card.json");
    card.numbers = ["14632513583"];
    expectInvalid("card.json", card);
  });

  it("2. Section 4.1: a card MUST NOT expire more than 400 days after it was issued", () => {
    const card = example<{ issued: string; expires: string }>("card.json");
    card.expires = "2027-12-31T00:00:00Z"; // 464 days
    expectInvalid("card.json", card);
  });

  it("3. Section 4.1: the disclosure MUST contain the AI words", () => {
    const card = example<{ disclosure: string }>("card.json");
    card.disclosure = "This is Cedar Grove Family Medicine's front desk.";
    expectInvalid("card.json", card);
  });

  it("4. Section 4.1: the disclosure MUST name the party", () => {
    const card = example<{ disclosure: string }>("card.json");
    card.disclosure = "This is an AI assistant.";
    expectInvalid("card.json", card);
  });

  it("5. Section 4.1: at least one Ed25519 key MUST be present", () => {
    const card = example<{ keys: unknown[] }>("card.json");
    card.keys = [{ kid: "2026-09", kty: "EC", crv: "P-256", x: "abc", y: "def", use: "sig" }];
    expectInvalid("card.json", card);
  });

  it("6. Section 4.1: a card MUST carry sig", () => {
    const card = example<Record<string, unknown>>("card.json");
    delete card.sig;
    expectInvalid("card.json", card);
  });

  it("7. Section 4.1: the endpoint MUST be HTTPS", () => {
    const card = example<{ endpoint: string }>("card.json");
    card.endpoint = "http://api.example/atep/v1/sessions";
    expectInvalid("card.json", card);
  });

  it("8. Section 9: a healthcare card MUST NOT set human_available to never", () => {
    const card = example<{ policies: Record<string, unknown> }>("card.json");
    card.policies.human_available = "never";
    expectInvalid("card.json", card);
  });

  it("9. Section 4.1: only a platform card MAY omit numbers", () => {
    const card = example<Record<string, unknown>>("card.json");
    delete card.numbers;
    expectInvalid("card.json", card);
  });

  it("10. Section 6.1: every message MUST carry sig", () => {
    const envelope = example<Record<string, unknown>>("envelope.json");
    delete envelope.sig;
    expectInvalid("envelope.json", envelope);
  });

  it("11. Section 6.1: session is absent on hello", () => {
    const [hello] = example<Record<string, unknown>[]>("session.appendix-b.json");
    expectInvalid("envelope.json", { ...hello, session: "s_01J8QK3ZP7W9V2X4Y6B8C0D2E4" });
  });

  it("12. Section 6.2: the vocabulary of message types is closed", () => {
    const envelope = example<Record<string, unknown>>("envelope.json");
    envelope.type = "negotiate";
    expectInvalid("envelope.json", envelope);
  });

  it("13. Section 6.6: every message MUST carry human_audible", () => {
    const envelope = example<Record<string, unknown>>("envelope.json");
    delete envelope.human_audible;
    expectInvalid("envelope.json", envelope);
  });

  it("14. Section 6.2: the body MUST match the type", () => {
    const envelope = example<Record<string, unknown>>("envelope.json");
    envelope.type = "bind"; // a bound body carries bound_at, not heard
    expectInvalid("envelope.json", envelope);
  });

  it("15. Section 5.3: a challenge is four digits, not three", () => {
    const hello = example<{ challenge: string }>("message.hello.json");
    hello.challenge = "720";
    expectInvalid("message.hello.json", hello);
  });

  it("16. Section 5.3: what bind heard is four digits, not five", () => {
    expectInvalid("message.bind.json", { heard: "48311" });
  });

  it("17. Section 7.1: identity_verification is fixed at none", () => {
    const delegation = example<{ identity_verification: string }>("delegation.json");
    delegation.identity_verification = "self";
    expectInvalid("delegation.json", delegation);
  });

  it("18. Section 7.1: a delegation MUST NOT expire more than 24 hours after it was issued", () => {
    const delegation = example<{ expires: string }>("delegation.json");
    delegation.expires = "2026-09-25T14:29:00-04:00";
    expectInvalid("delegation.json", delegation);
  });

  it("19. Section 7.1: the revocation URL MUST be HTTPS", () => {
    const delegation = example<{ revocation_url: string }>("delegation.json");
    delegation.revocation_url = "http://lydoh.com/atep/v1/delegations/d_01J8";
    expectInvalid("delegation.json", delegation);
  });

  it("20. Section 8.8: an extension intent MUST be named x-<vendor>-<name>", () => {
    const delegation = example<{ scope: string[] }>("delegation.json");
    delegation.scope = ["availability", "purchase"];
    expectInvalid("delegation.json", delegation);
  });

  it("21. Section 7.1: an id is at most 128 characters", () => {
    const delegation = example<{ principal: Record<string, unknown> }>("delegation.json");
    delegation.principal.id = "urn:atep:principal:" + "a".repeat(128);
    expectInvalid("delegation.json", delegation);
  });

  it("22. Section 7.1: the credential payload MUST be typed AtepDelegation", () => {
    const payload = example<{ type: string[] }>("delegation.credential.json");
    payload.type = ["VerifiableCredential"];
    expectInvalid("delegation.json#/$defs/credential_payload", payload);
  });

  it("23. Section 9: a healthcare delegation MUST carry healthcare_authorization", () => {
    const payload = example<{ credentialSubject: Record<string, unknown> }>(
      "delegation.credential.healthcare.json",
    );
    delete payload.credentialSubject.healthcare_authorization;
    expectInvalid("delegation.json#/$defs/credential_payload_healthcare", payload);
  });

  it("24. Section 7.2: a mandate expires in at most one hour", () => {
    const mandate = example<{ expires: string }>("mandate.json");
    mandate.expires = "2026-09-23T16:31:00-04:00";
    expectInvalid("mandate.json", mandate);
  });

  it("25. Section 7.2: a mandate covers cancel, reschedule, or quote", () => {
    const mandate = example<{ for: string }>("mandate.json");
    mandate.for = "book";
    expectInvalid("mandate.json", mandate);
  });

  it("26. Section 8.6: urgency MUST be routine", () => {
    const request = example<{ urgency: string }>("intent.message.request.json");
    request.urgency = "urgent";
    expectInvalid("intent.message.request.json", request);
  });

  it("27. Section 8: free text is at most 500 characters", () => {
    const request = example<{ text: string }>("intent.message.request.json");
    request.text = "x".repeat(501);
    expectInvalid("intent.message.request.json", request);
  });

  it("28. Section 8.1: a note over 500 characters is rejected", () => {
    const response = example<{ note: string }>("intent.availability.response.json");
    response.note = "n".repeat(501);
    expectInvalid("intent.availability.response.json", response);
  });

  it("29. Section 8.2: book carries a slot or a start, not both", () => {
    const request = example<Record<string, unknown>>("intent.book.request.json");
    request.start = "2026-10-06T09:00:00-04:00";
    expectInvalid("intent.book.request.json", request);
  });

  it("30. Section 8.2: book carries a slot or a start, not neither", () => {
    const request = example<Record<string, unknown>>("intent.book.request.json");
    delete request.slot;
    expectInvalid("intent.book.request.json", request);
  });

  it("31. Section 8.5: accepting a quote is accept: true with a reference", () => {
    expectInvalid("intent.quote.request.json", { accept: false, reference: "q_8823" });
  });

  it("32. Section 7.5: the receipt outcome vocabulary is closed", () => {
    const receipt = example<{ outcome: string }>("receipt.json");
    receipt.outcome = "confirmed";
    expectInvalid("receipt.json", receipt);
  });

  it("33. Section 7.5: recorded names exactly the two legs", () => {
    const receipt = example<{ recorded: Record<string, unknown> }>("receipt.json");
    receipt.recorded.registry = true;
    expectInvalid("receipt.json", receipt);
  });

  it("34. Section 7.5: log_hash is a SHA-256 digest", () => {
    const receipt = example<{ log_hash: string }>("receipt.json");
    receipt.log_hash = "not-a-digest";
    expectInvalid("receipt.json", receipt);
  });

  it("35. Section 8.7: a handoff receipt carries kind, connected, and waited_seconds", () => {
    const receipt = example<Record<string, unknown>>("receipt.json");
    receipt.outcome = "handed_off";
    receipt.details = { kind: "need_human" };
    expectInvalid("receipt.json", receipt);
  });

  it("36. Section 6.5: the error code vocabulary is closed", () => {
    expectInvalid("message.error.json", { code: "teapot", detail: "no" });
  });

  it("37. Section 6.4: confirm with accept false carries a reason", () => {
    expectInvalid("message.confirm.json", {
      intent: "book",
      summary: "Booked: new patient visit.",
      accept: false,
    });
  });

  it("38. Section 6.2: a release body is empty", () => {
    expectInvalid("message.release.json", { reason: "done" });
  });

  it("39. Section 3: a timestamp carries an offset", () => {
    const envelope = example<{ ts: string }>("envelope.json");
    envelope.ts = "2026-09-23T14:30:09";
    expectInvalid("envelope.json", envelope);
  });

  it("40. Section 4.4: a registry platform code is 2 to 6 digits", () => {
    const response = example<{ code: string }>("registry.platform.json");
    response.code = "0421337";
    expectInvalid("registry.platform.json", response);
  });

  it("41. Section 4.4: a registry response MUST be signed", () => {
    const response = example<Record<string, unknown>>("registry.number.json");
    delete response.sig;
    expectInvalid("registry.number.json", response);
  });

  it("42. Section 4.1: the card version is 1.x", () => {
    const card = example<{ atep: string }>("card.json");
    card.atep = "2.0";
    expectInvalid("card.json", card);
  });

  it("43. Section 3: a digest is lowercase hex", () => {
    const receipt = example<{ log_hash: string }>("receipt.json");
    receipt.log_hash = "sha256:A0B1C2D3E4F5061728394A5B6C7D8E9F00112233445566778899AABBCCDDEEFF";
    expectInvalid("receipt.json", receipt);
  });

  it("44. Section 3: a digest is the full 64 hex characters", () => {
    const receipt = example<{ delegation: string }>("receipt.json");
    receipt.delegation = "sha256:1f8b2c3d4e5f6071";
    expectInvalid("receipt.json", receipt);
  });

  it("45. Section 4.1: a key's expires is RFC 3339, not a numeric date", () => {
    const card = example<{ keys: Record<string, unknown>[] }>("card.json");
    card.keys[0].expires = 1790000000;
    expectInvalid("card.json", card);
  });

  it("46. Section 4.1: a service reason carries an id and a name", () => {
    const card = example<{ services: Record<string, unknown>[] }>("card.json");
    card.services[0].reasons = ["sore-throat"];
    expectInvalid("card.json", card);
  });

  it("47. Section 6.1: the envelope session and the body session must agree", () => {
    const session = example<Record<string, unknown>[]>("session.appendix-b.json");
    const helloAck = session[1];
    expectInvalid("envelope.json", { ...helloAck, session: "s_someone_elses_session" });
  });

  it("48. Section 6.5: detail is an object, not a string", () => {
    expectInvalid("message.error.json", { code: "declined", detail: "We do not take agent calls." });
  });

  it("49. Section 6.5: rate_limited carries detail.retry_after", () => {
    expectInvalid("message.error.json", { code: "rate_limited", detail: { text: "Too many." } });
  });

  it("50. Section 6.5: detail.retry_after is an RFC 3339 time", () => {
    expectInvalid("message.error.json", { code: "rate_limited", detail: { retry_after: 600 } });
  });

  it("51. Section 6.5: do_not_call carries detail.until", () => {
    expectInvalid("message.error.json", { code: "do_not_call", detail: { text: "Please stop." } });
  });

  it("52. Section 7.2: a mandate is for cancel, reschedule, quote, or an extension intent", () => {
    const mandate = example<{ for: string }>("mandate.json");
    mandate.for = "x-lydoh-purchase!";
    expectInvalid("mandate.json", mandate);
  });

  it("53. Section 7.5: a receipt with neither signature is not a receipt", () => {
    const receipt = example<{ signatures: Record<string, unknown> }>("receipt.json");
    receipt.signatures = { caller: null, answerer: null };
    expectInvalid("receipt.json", receipt);
  });

  it("54. Section 7.5: disclosures names exactly the two legs", () => {
    const receipt = example<{ disclosures: Record<string, unknown> }>("receipt.json");
    delete receipt.disclosures.answerer;
    expectInvalid("receipt.json", receipt);
  });

  it("55. Section 8.2: a book reason is an identifier, not free text", () => {
    const request = example<Record<string, unknown>>("intent.book.request.json");
    request.reason = "r".repeat(129);
    expectInvalid("intent.book.request.json", request);
  });

  it("56. Section 8.3: a reschedule answers rescheduled, not booked", () => {
    const response = example<{ outcome: string }>("intent.reschedule.response.json");
    response.outcome = "booked";
    expectInvalid("intent.reschedule.response.json", response);
  });

  it("57. Section 8.5: an accepted quote carries the reference it accepted", () => {
    expectInvalid("intent.quote.response.json", { outcome: "quote_accepted" });
  });

  it("58. Section 8.6: the message recipient is a name or a role, not a sentence", () => {
    const request = example<Record<string, unknown>>("intent.message.request.json");
    request.to = "the front desk";
    expectInvalid("intent.message.request.json", request);
  });

  it("59. Section 8.6: a callback window is a start and an end, not a sentence", () => {
    const request = example<{ callback: Record<string, unknown> }>("intent.message.request.json");
    request.callback.window = "weekday mornings";
    expectInvalid("intent.message.request.json", request);
  });
});

describe("draft 2: shapes the schemas accept", () => {
  it("Section 4.1: a service may list the visit reasons a caller may give", () => {
    const card = example<{ services: Record<string, unknown>[] }>("card.json");
    card.services[0].reasons = [{ id: "annual-physical", name: "Annual physical" }];
    expectValid("card.json", card);
  });

  it("Section 4.1: a key may carry an RFC 3339 expiry", () => {
    const card = example<{ keys: Record<string, unknown>[] }>("card.json");
    card.keys[0].expires = "2027-09-23T00:00:00Z";
    expectValid("card.json", card);
  });

  it("Section 6.5: malformed is an error code", () => {
    expectValid("message.error.json", {
      code: "malformed",
      detail: { text: "The envelope session and the body session disagree." },
    });
  });

  it("Section 6.5: do_not_call says until when", () => {
    expectValid("message.error.json", {
      code: "do_not_call",
      detail: { text: "Please do not call again.", until: "2026-10-23T00:00:00-04:00" },
    });
  });

  it("Section 7.2: a mandate may name an extension intent", () => {
    const mandate = example<{ for: string }>("mandate.json");
    mandate.for = "x-lydoh-purchase";
    expectValid("mandate.json", mandate);
  });

  it("Section 7.5: not_found is a receipt outcome", () => {
    const receipt = example<Record<string, unknown>>("receipt.json");
    receipt.intent = "cancel";
    receipt.outcome = "not_found";
    expectValid("receipt.json", receipt);
  });

  it("Section 7.5: a one-sided session nulls the missing side", () => {
    const receipt = example<Record<string, unknown>>("receipt.json");
    receipt.outcome_channel = "voice";
    receipt.disclosures = {
      caller: "This is an AI assistant calling for Sohel S. Callback 7 7 5 5 5 5 1 2 3 4. ATEP.",
      answerer: null,
    };
    receipt.recorded = { caller: false, answerer: null };
    receipt.signatures = {
      caller: "eyJhbGciOiJFZERTQSIsImtpZCI6IjIwMjYtMDgifQ..Y2FsbGVyLXNpZ25hdHVyZS1wbGFjZWhvbGRlcg",
      answerer: null,
    };
    expectValid("receipt.json", receipt);
  });

  it("Section 8.2: a book request may carry a reason from the service", () => {
    const request = example<Record<string, unknown>>("intent.book.request.json");
    request.reason = "annual-physical";
    expectValid("intent.book.request.json", request);
  });

  it("Section 8.5: accepting a quote answers quote_accepted with the reference", () => {
    expectValid("intent.quote.response.json", { outcome: "quote_accepted", reference: "q_8823" });
  });
});
