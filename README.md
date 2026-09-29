# ATEP: the Agentic Telephone Exchange Protocol

**Status: 1.0 draft 3, a draft for public comment.**

ATEP is what two AI agents say to each other when they meet on an ordinary telephone
call. One is calling for a person, the other is answering for a business. Within the
first seconds of the call they recognize each other, bind their web endpoints to that
exact call, prove whom they act for, and then finish the task over a structured HTTPS
channel instead of over speech. The voice call stays on the line as the fallback, and
as the thing everyone can still hear.

It is deliberately small. It needs one JSON document at a fixed well-known path
(`/.well-known/atep.json`), one HTTPS endpoint, one spoken sentence, and a few DTMF
digits. It works when only one side implements it: a published card helps a caller
even when a human answers, and a hello costs a caller nothing when it reaches a phone
tree. The discovery path, the hello sentences, and the DTMF frames are frozen from
this draft onward.

Authority in ATEP is declared, scoped, signed, and revocable, and an agent never
verifies identity itself: a caller carries a delegation from its principal's platform,
a binding action needs a per-transaction mandate, and every outcome ends in a receipt
both sides sign and keep. `identity_verification` is fixed at `"none"` in v1 — where a
business needs a date of birth or a one-time code, the answer is a handoff to a human.
This directory holds the normative spec and the machine-checkable artifacts built from
it: JSON Schemas, examples, and the tests that hold the two together.

## Layers

```
L4  Intents      availability, book, reschedule, cancel, quote, message, handoff
L3  Session      delegation, mandates, receipts, state machine, attestations
L2  Exchange     HTTPS + JSON, JWS-signed, JCS-canonicalized
L1  Handshake    spoken hello, DTMF frames, call binding
L0  Discovery    /.well-known/atep.json, DNS, the registry
```

Each layer is usable without the ones above it.

## Validate a card

```
node validate.mjs card path/to/atep.json
```

The first argument is any schema file name under `schemas/` (`card`, `envelope`,
`delegation`, `receipt`, `intent.book.request`, …), with or without the `.json`. The
command exits 0 on success and prints each error and exits 1 on failure.

To run the whole suite — every example against its schema, the negative tests, and the
spec cross-check:

```
npm install
npm test
```

## Layout

```
  SPEC.md                  the normative specification, version 1.0 draft 3
  README.md                this file
  LICENSE                  Apache License 2.0
  NOTICE                   copyright notice
  validate.mjs             one-command validator over the schemas
  src/validate.ts          the same validator as a TypeScript module, for servers
  schemas/                 JSON Schema draft 2020-12, $id https://atep.io/schemas/1.0/
    common.json            shared definitions: E.164, RFC 3339, money, id, service, slot
    card.json              Section 4.1
    envelope.json          Section 6.1, a discriminated oneOf on type over the bodies
    message.<type>.json    one body schema per message type in Section 6.2
    delegation.json        Section 7.1, with the Verifiable Credential payload and the
                           Section 9 healthcare_authorization extension
    mandate.json           Section 7.2
    receipt.json           Section 7.5
    intent.<name>.request.json / intent.<name>.response.json   Section 8, seven intents
    registry.*.json        Section 4.4 registry requests and responses
  examples/                one valid instance per schema, plus session.appendix-b.json,
                           the Appendix B session as an array of envelopes
  tests/
    ajv-setup.ts           Ajv 2020 wiring and the two custom keywords
    schemas.test.ts        every example validates; negative tests for the MUSTs
    spec-coverage.test.ts  every field name in Sections 4, 6, 7 and 8 is in a schema
```

## What the schemas can and cannot check

The schemas encode every MUST that a JSON Schema can express: the E.164 and RFC 3339
patterns, the four-digit challenge, the 128-character identifier limit, the
500-character cap on free text, the lowercase-hex `sha256:` digest, the closed enums
for message types, error codes and outcomes, `identity_verification: "none"`,
`urgency: "routine"`, and the requirement that a disclosure sentence contain "AI",
"artificial", "automated" or "virtual" together with "assistant" or "agent".

Five MUSTs need arithmetic or a cross-field comparison, so they are carried by three
`x-` prefixed keywords that a plain validator ignores and that `validate.mjs` and the
test harness implement: `x-atep-max-lifetime` (a card expires no more than 400 days
after it was issued, a delegation no more than 24 hours, a mandate no more than one
hour), `x-atep-disclosure-names-party` (the disclosure names the party), and
`x-atep-session-matches-body` (an envelope whose `session` disagrees with a `session`
in its body is `malformed`, Section 6.1). Everything that depends on a live call, a
signature or a network fetch — binding, JWS verification, revocation checks, the
2-second latency contract, the state machine — is out of scope for a schema and
belongs to the conformance tester in Section 11.

Draft 2 resolved the 23 contradictions and ambiguities found while writing these
schemas; Appendix C of [SPEC.md](SPEC.md) lists them. Where the document leaves a
choice, the schemas take the most conservative reading available.

## Contributing

Comments on the draft are welcome as GitHub issues. See [CONTRIBUTING.md](CONTRIBUTING.md).
The published schemas are served at their `$id`s under https://atep.io/schemas/1.0/.

## License

ATEP is licensed under the Apache License 2.0; see [LICENSE](LICENSE) and
[NOTICE](NOTICE). Copyright 2026 Lydoh.
