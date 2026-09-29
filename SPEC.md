# ATEP: Agentic Telephone Exchange Protocol

Version 1.0, draft 3. Editor: Lydoh (hello@lydoh.com). License: Apache 2.0.

## Abstract

ATEP lets two AI agents that meet over an ordinary telephone call, one calling on behalf of a person and one answering on behalf of a business, recognize each other within the first seconds of the call, bind their web endpoints to that exact call, prove whom they act for, and complete a bounded task over a structured HTTPS channel, with the voice call kept as the fallback. It needs one JSON document at a fixed well-known path, one HTTPS endpoint, one spoken sentence, and a few DTMF digits. It works when only one side implements it. Every action that binds a person or a business ends in a receipt both sides sign.

## Status

This is a draft for public comment. The discovery path (Section 4.1), the hello sentences (Section 5.1), and the DTMF frames (Section 5.2) are frozen from this draft onward: they will not change in any 1.x release. Message fields may be added in 1.x; none will be removed or change meaning.

## 1. Terms

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as in RFC 2119 and RFC 8174.

- **Agent**: software that speaks on a telephone call on behalf of a principal.
- **Principal**: the person or business the agent acts for.
- **Caller**: the agent that placed the call. Its principal is usually a person.
- **Answerer**: the agent that answered the call. Its principal is usually a business.
- **Platform**: the operator of an agent (for example, a voice-AI vendor). A platform publishes a card and signs messages; a person never publishes a card.
- **Card**: the JSON document at `/.well-known/atep.json` describing a party's endpoint, keys, intents, and policies (Section 4).
- **Registry**: an HTTPS service mapping E.164 numbers to cards (Section 4.4).
- **Session**: one structured exchange over HTTPS, bound to one telephone call (Section 6).
- **Leg**: one party's side of the call.
- **Human-audible**: a message or leg that a human may have heard. A leg is *machine-only* when every message after binding was marked not human-audible by both sides (Section 6.6).
- **Delegation**: a signed credential from a principal's platform stating what the caller may do for that principal (Section 7.1).
- **Mandate**: a signed, per-transaction authorization for a binding action (Section 7.2).
- **Receipt**: the signed record of an outcome, held by both sides (Section 7.5).

## 2. Design

ATEP has five layers. Each is usable without the ones above it.

```
L4  Intents      availability, book, reschedule, cancel, quote, message, handoff
L3  Session      delegation, mandates, receipts, state machine, attestations
L2  Exchange     HTTPS + JSON, JWS-signed, JCS-canonicalized
L1  Handshake    spoken hello, DTMF frames, call binding
L0  Discovery    /.well-known/atep.json, DNS, the registry
```

Principles the design follows:

1. The telephone number is the address. Discovery starts from an E.164 number because that is all a caller has.
2. It works one-sided. A card helps a caller even when the answerer is human. A hello costs a caller nothing when the answerer is human.
3. Voice is the transport of last resort, never the transport of record.
4. Nothing binds a principal without a receipt.
5. Every session has a handoff path to a human, in both directions.
6. Disclosure is protocol, not prompt.
7. Authority is declared, scoped, signed, and revocable, and is never verified by the agent itself.
8. The vocabulary is small and closed. Extensions must be declared in the card.
9. Conformance is a public test anyone can run against a number.
10. The discovery path never moves.

## 3. Data conventions

- Encoding: UTF-8 JSON (RFC 8259). Unknown fields MUST be ignored.
- Times: RFC 3339 with offset, for example `2026-10-01T14:30:00-04:00`.
- Numbers: E.164 with leading `+`, for example `+14632513583`.
- Money: `{ "amount": 200, "currency": "USD" }`, amount in major units as a decimal number.
- Identifiers: every identifier (`id`, `session`, `reference`, `nonce`, `kid`, `verification_id`, slot ids) is an opaque string of at most 128 characters, unique within its issuer.
- Digests: `sha256:` followed by the lowercase hex SHA-256 of the JCS form of the object.
- Free text: every field named `note`, `reason`, `text`, `summary`, `instructions`, `expected_response`, `statement`, or `detail.text`, and every element of `includes` and `excludes`, and `terms` in a quote response, is at most 500 characters. No other field carries free text.
- Canonicalization: JSON Canonicalization Scheme, RFC 8785.
- Signatures: JSON Web Signature, RFC 7515, compact serialization, detached payload. The payload is the JCS form of the object with its `sig` field removed. Algorithm `EdDSA` with Ed25519 keys MUST be supported; `ES256` MAY be supported. The JWS header MUST carry `kid` naming a key in the signer's card. The header MUST NOT carry `jku`; keys come only from cards.
- Versions: the string `"1.0"` in the `atep` field of cards and hello messages. Minor versions are backward compatible.

## 4. Discovery (L0)

### 4.1 The card

A party that answers or places ATEP calls MUST publish a card at:

```
https://<domain>/.well-known/atep.json
```

served with `Content-Type: application/json`, over TLS, with a cache lifetime of at least one hour. The path is frozen.

A platform that hosts agents for many businesses publishes its own card at the well-known path and MAY host one card per business at any HTTPS URL on the same domain (for example `https://lydoh.com/atep/cards/cedar-grove.json`). Such a hosted card is a full card in its own right: it names the business as `party`, lists the business's numbers, and is signed with the platform's key. The registry and the DNS record (Section 4.2) point to hosted cards by URL. A business with its own domain MAY instead publish the card itself; a number MUST resolve to exactly one card.

```json
{
  "atep": "1.0",
  "party": {
    "id": "urn:atep:party:9f2c0e4a-6e6d-4a2e-9b1a-3f4b0b9a1c77",
    "name": "Cedar Grove Family Medicine",
    "kind": "business",
    "website": "https://cedargrovefm.example"
  },
  "numbers": ["+14632513583"],
  "endpoint": "https://api.example/atep/v1/sessions",
  "keys": [
    { "kid": "2026-09", "kty": "OKP", "crv": "Ed25519", "x": "…", "use": "sig" }
  ],
  "intents": ["availability", "book", "reschedule", "cancel", "message", "handoff"],
  "services": [
    { "id": "new-patient", "name": "New patient visit", "duration_minutes": 30 },
    { "id": "follow-up", "name": "Follow-up", "duration_minutes": 15 }
  ],
  "hours": {
    "timezone": "America/New_York",
    "weekly": { "mon": [["09:00", "17:00"]], "tue": [["09:00", "17:00"]] }
  },
  "languages": ["en"],
  "policies": {
    "records_calls": true,
    "no_record_mode": true,
    "human_available": "business_hours",
    "accepts_agents": "yes",
    "no_sales": true,
    "retention_days": 365,
    "do_not_call_days": 30
  },
  "disclosure": "This is Cedar Grove Family Medicine's AI assistant.",
  "healthcare": true,
  "a2a": "https://cedargrovefm.example/.well-known/agent-card.json",
  "contact": { "technical": "it@cedargrovefm.example", "abuse": "abuse@cedargrovefm.example" },
  "issued": "2026-09-23T00:00:00Z",
  "expires": "2027-09-23T00:00:00Z",
  "sig": "…"
}
```

Field rules:

- `atep`, `party`, `endpoint`, `keys`, `intents`, `disclosure`, `contact`, `issued`, `expires`, `sig` are REQUIRED. `numbers` is REQUIRED unless `party.kind` is `platform`. Everything else is OPTIONAL.
- `party.kind` is `business` or `platform`. A platform that operates agents for many principals (a voice-AI vendor, a personal-assistant service) publishes one card with `kind: "platform"` and MAY omit `numbers`. A person never publishes a card; the person appears only in a delegation (Section 7.1).
- `numbers` lists the E.164 numbers this card answers for. A number MUST appear in at most one verified card in a registry.
- `endpoint` is the URL that accepts `POST` of a `hello` message (Section 6.2). It MUST be HTTPS.
- `keys` is a JWK Set array (RFC 7517). At least one Ed25519 key MUST be present. A key MAY carry `expires` (RFC 3339) for rotation.
- `intents` lists the intents in Section 8 the party serves. A caller-only platform lists the intents it can request. Extension intents are named `x-<vendor>-<name>` and MUST be listed here to be used.
- `services` names what can be booked, for the `availability` and `book` intents. `id` is what messages reference. A service MAY list `reasons: [{ "id", "name" }]`, the only visit reasons a caller may give (Section 9).
- `policies.human_available` is `always`, `business_hours`, or `never`. `accepts_agents` is `yes`, `verified_only` (only callers whose platform card is registry-verified), or `no`. `retention_days` is how long the party keeps session records. `do_not_call_days` is how long a `do_not_call` error applies.
- `disclosure` is the exact sentence the party's agent speaks to identify itself as AI (Section 5.1). It MUST name the party and MUST contain "AI" or "artificial" or "automated" or "virtual" together with "assistant" or "agent".
- `healthcare: true` switches on the healthcare profile (Section 9) for every session with this party.
- `contact.technical` is REQUIRED (an email for protocol and breach notices); `contact.abuse` is OPTIONAL.
- `a2a` links an A2A agent card for the same party. ATEP does not depend on it.
- `expires` MUST be no more than 400 days after `issued`. An expired card MUST be treated as absent.
- `sig` signs the card per Section 3 with one of the card's own keys. A caller MUST verify it before trusting any other field.

### 4.2 Resolution from a number

Given an E.164 number, a caller resolves a card in this order and stops at the first success:

1. A cached card whose `numbers` includes the number and which has not expired.
2. The registry (Section 4.4): `GET /v1/numbers/{e164}`.
3. A DNS TXT record at `_atep.<domain>` when the caller already knows the party's domain: `"v=atep1; card=https://<domain>/.well-known/atep.json"`.
4. The DTMF pointer received during the handshake (Section 5.2), which restarts this list with the pointer's platform or number.

If nothing resolves, ATEP is not available for that call and the caller proceeds in plain voice. Resolution MUST NOT delay dialing; a caller MAY resolve after the answerer's hello.

### 4.3 Verifying a card belongs to a number

A card's `numbers` field is a claim. It becomes verified in one of two ways:

- **Registry verification**: the registry called the number, received an ATEP hello and DTMF pointer, completed binding (Section 5.3) against the card's endpoint, and recorded `verified_at`.
- **Live binding**: the current call completed binding against the card's endpoint. Binding proves that whoever controls the endpoint also controls this leg of this call. It does not prove ownership of the number in the carrier's sense; STIR/SHAKEN attestation, where present, is complementary.

A caller MUST NOT send a delegation to an endpoint that is neither registry-verified nor live-bound.

### 4.4 The registry

A registry is an HTTPS service with this interface. Anyone may run one; a caller is configured with one or more registry base URLs. The reference registry is at `https://atep.io`.

| Method and path | Purpose |
|---|---|
| `GET /v1/numbers/{e164}` | Returns `{ "number", "card": "<url>", "party", "verified_at", "platform": "<code>" }` or 404. |
| `GET /v1/platforms/{code}` | Returns `{ "code", "card": "<url>", "party", "verified_at" }` or 404. `code` is 2 to 6 digits, issued by the registry. |
| `POST /v1/numbers` | Body `{ "number", "card" }`. Starts verification: the registry fetches the card, checks `numbers` includes the number, calls the number, and expects the handshake and binding. Returns `{ "verification_id", "status": "pending" }`. |
| `GET /v1/verifications/{id}` | Returns `{ "status": "pending" \| "verified" \| "failed", "reason" }`. `reason` is present only when `status` is `failed`. |
| `GET /v1/cards?party={id}` | Returns `{ "party", "cards": [{ "card", "numbers", "verified_at", "platform" }] }`. |

A registry MUST re-verify a number at least every 90 days and MUST remove a number whose card expired or whose verification fails twice. Every registry response body carries a `sig` member, signed per Section 3 with a key published in the registry's own card at `/.well-known/atep.json`.

## 5. Handshake (L1)

The handshake happens on the voice call. It has three parts: the hello sentence, the DTMF frame, and binding.

### 5.1 The hello

An ATEP agent's first utterance on a call MUST be its hello. The answerer speaks it on answer, within 10 seconds of the call connecting. The caller speaks it after the answerer's hello frame when it hears one, and otherwise after the answerer's first sound, in either case within 10 seconds of that moment. The templates are frozen. Braces mark substitutions.

Caller:

> This is an AI assistant calling for {principal}. Callback {number}. ATEP.

Answerer:

> {disclosure} ATEP.

where `{disclosure}` is the card's `disclosure` sentence.

If the speaker records the call, it MUST insert "This call is recorded." immediately before "ATEP." The announcement is then inside the recording.

`{principal}` is the principal's display name as it appears in the delegation. `{number}` is a callback number for the responsible entity, read as digits, at which a human can reach the caller's principal or platform. It MUST NOT be a dialer-only number.

An agent MUST speak the hello in the call's language. The English templates are normative; a translation MUST preserve every element (AI status, principal or party name, callback number for a caller, recording notice, and the word "ATEP").

An agent MUST re-assert that it is an AI whenever asked, in any phrasing, on any leg, at any time.

### 5.2 The DTMF frame

Immediately after speaking "ATEP." the agent MUST send a DTMF frame:

```
Caller:    # 1 #
Answerer:  # 1 <pointer> #
```

`1` is the major version. `<pointer>` is OPTIONAL and is one of:

- the answerer's own E.164 digits without `+` (for example `14632513583`), meaning "resolve me by this number"; or
- `0` followed by a registry platform code, meaning "resolve my platform, then ask it for the card for the number you dialed". Platform codes are 2 to 6 digits (Section 4.4); code `42` gives the pointer `042`. No E.164 number begins with `0`, so the two forms cannot be confused.

Frames are sent as RFC 4733 telephone events where available and as in-band tones otherwise. A sender SHOULD use 100 ms tones with 100 ms gaps and MUST NOT exceed 500 ms per digit including its gap; a receiver MUST accept any spacing up to that. A frame MUST start within 2 seconds of the end of "ATEP." and MUST NOT be interrupted by speech. An answerer on a registered platform SHOULD send the platform-code pointer rather than its E.164 digits: it is a third of the length, and every 100 ms on the handshake is paid on every call.

A receiver MUST split on `#` and MUST tolerate several frames arriving in one buffer, since telephony stacks commonly batch keypad input.

Detection: an agent that hears a well-formed frame within 8 seconds of the end of the other side's hello knows it is talking to an ATEP agent. If it hears no frame in that window, it MUST assume the other side is a human or a phone tree, continue in plain voice, and MUST NOT send further frames. It MAY log `peer: human`.

A `#` followed by an unexpected digit sequence is not a frame. Phone trees commonly ignore `#` sequences that match no menu option; an agent MUST tolerate a frame being swallowed and fall back to voice.

### 5.3 Binding

Binding ties the HTTPS session to this exact call. Both sides prove control of their leg.

1. On detecting the answerer's frame, the caller resolves the answerer's card (Section 4.2) and, within 3 seconds, `POST`s a `hello` message (Section 6.2) to the card's `endpoint`. The `hello` carries a `call_ref` (both numbers, the connect time, a nonce) and a four-digit `challenge` chosen by the caller.
2. The answerer's endpoint replies with `hello_ack`, which carries the session id and a four-digit `challenge` chosen by the answerer.
3. After it has heard the caller's hello frame, the answerer's leg sends DTMF `# 0 <answerer challenge> #` on the call. It MUST NOT send it while the caller is speaking.
4. The caller's leg, on hearing it, compares it to the `hello_ack`. On match it sends DTMF `# 0 <caller challenge> #` on the call and `POST`s a `bind` message carrying what it heard.
5. The answerer compares the DTMF it heard with the `challenge` in the `hello`, and the `bind` message with the challenge it sent. On match it replies `bound`. The session is now bound.

Binding MUST complete within 15 seconds of the end of the caller's hello frame, or either side sends `error` with `binding_failed`; nobody hangs up, and both continue in plain voice. Implementations SHOULD emit binding frames from the telephony layer rather than through a language model; measured on one production stack, a model-triggered frame starts 2.7 seconds after the cue and a telephony-layer frame starts within 100 ms. A challenge MUST be freshly random per call and MUST NOT be reused.

What binding proves: the party controlling the endpoint also controls the leg that sent the matching digits on this call. An attacker who obtained a card URL cannot complete a session for a call they are not on. Replay is prevented by `call_ref.nonce` and a 10-minute validity on `hello`.

### 5.4 Silence and release

After sending its frame, an agent MUST NOT speak on the call while the session is active, except to complete a handoff (Section 8.7) or after a fallback (Section 5.5). Hold music, announcements, and silence on the line are not reasons to speak.

Once bound, either side MAY send `release`. When both sides have acknowledged, both hang up and the session continues over HTTPS alone. A released session MUST reach `receipted`, `declined`, or `error` within 15 minutes. A `handoff` intent on a released session requires a new call: the caller redials, speaks its hello with the session id appended ("ATEP session {id}."), and the answerer rebinds using Section 5.3 with the existing session.

Release is where ATEP saves cost: a bound session typically needs the call for less than 20 seconds.

### 5.5 Fallback to voice

At any point before `receipted`, either side MAY send `fallback` with a reason. Both sides then continue the task in plain voice, starting from the last confirmed state. A caller that loses HTTPS connectivity MUST say so on the call: "ATEP unavailable, continuing by voice." The session's partial log remains valid for the receipt if the task later completes by voice; a voice-completed task produces a receipt with `outcome_channel: "voice"` signed by whichever side can, and the other side SHOULD countersign when it can.

## 6. Exchange and session (L2, L3)

### 6.1 Transport

One session is one HTTPS resource. The caller `POST`s messages to the answerer; each `POST` returns the answerer's reply in the response body. The answerer never pushes messages to the caller in v1; the only requests it makes toward the caller's platform are card fetches and the revocation check (Section 7.1). Every message is a JSON object with this envelope:

```json
{
  "atep": "1.0",
  "id": "m_01J8…",
  "session": "s_01J8…",
  "ts": "2026-09-23T14:30:02-04:00",
  "from": "urn:atep:party:…",
  "type": "…",
  "human_audible": false,
  "body": { },
  "sig": "…"
}
```

`session` is absent on `hello` and REQUIRED on every other message, including `hello_ack`, whose envelope carries the session id it assigns. A message whose envelope `session` disagrees with a `session` in its body is rejected with `malformed`. `sig` is the JWS per Section 3 over the envelope without `sig`, signed with a key from the sender's card. A receiver MUST reject a message whose signature fails, whose `ts` is more than 5 minutes from its clock, or whose `id` it has seen before.

Latency: the answerer MUST respond to every `POST` within 2 seconds. If the work takes longer it MUST reply `working` with `retry_after_ms`, and the caller polls with `GET {endpoint}/{session}/messages?after={id}`. Two seconds is the human conversational clock; on the phone, silence past it reads as a dead call.

### 6.2 Messages

| Type | Sender | Body |
|---|---|---|
| `hello` | caller | `call_ref { from, to, connected_at, nonce }`, `caller_card` (URL), `challenge` (4 digits), `records: bool`, `language`, `intents` (what the caller wants to do) |
| `hello_ack` | answerer | `session`, `challenge` (4 digits), `records: bool`, `accepts: [intents]`, `healthcare: bool` |
| `bind` | caller | `heard` (the 4 digits received on the call) |
| `bound` | answerer | `bound_at` |
| `delegation` | caller | Section 7.1 |
| `delegation_ack` | answerer | `accepted: bool`, `reason` |
| `mandate` | caller | Section 7.2 |
| `intent` | caller | `intent`, `request` (Section 8) |
| `result` | answerer | `intent`, `response` (Section 8) |
| `confirm` | either | `intent`, `summary` (read-back text), `accept: bool` |
| `receipt` | either | Section 7.5 |
| `handoff` | either | Section 8.7 |
| `release` / `release_ack` | either | empty |
| `fallback` | either | `reason` |
| `working` | answerer | `retry_after_ms` |
| `error` | either | `code`, `detail` (Section 6.5) |

Every field a table row or JSON block in this document lists is REQUIRED unless the prose marks it optional or gives a default. Exceptions stated once here: `note` in any intent request is OPTIONAL; each member of `caps` is OPTIONAL; `reference`, `details`, and `mandate` in a receipt are OPTIONAL. Receivers MUST ignore fields they do not recognize; senders MUST NOT rename or repurpose a defined field.

### 6.3 State machine

```
hello → bound → delegated → negotiating → confirmed → receipted
```

- `hello`: `hello` sent, `hello_ack` received.
- `bound`: binding complete (Section 5.3).
- `delegated`: `delegation` accepted.
- `negotiating`: one or more `intent` / `result` exchanges.
- `confirmed`: both sides sent `confirm` with `accept: true` for the same summary.
- `receipted`: both signatures on the receipt.

From any state, a side MAY move to `handoff`, `declined` (via `error` with `declined`), `released` (parallel to the states above; it changes transport, not progress), or `error`. A session that has not advanced for 5 minutes on a live call, or 15 minutes released, is `expired` and MUST NOT produce a receipt.

### 6.4 Confirmation

A `book`, `reschedule`, `cancel`, or accepted `quote` MUST be confirmed before a receipt. The answerer sends `confirm` with a `summary`: a single sentence in the call's language stating the outcome exactly as a human would read it back ("Booked: new patient visit, Tuesday October 6 at 9:00 AM, for Sohel S., reference 4471."). The caller replies `confirm` with the same `summary` and `accept: true`, or `accept: false` with a `reason`. Mismatched summaries are not a confirmation.

If any leg after binding was human-audible, the confirming side MUST also speak the summary on the call before sending `confirm`.

### 6.5 Errors

`detail` is an object. It MAY carry `text`; some codes require more, listed below.

| Code | Meaning |
|---|---|
| `malformed` | The message fails the schema, or its envelope and body disagree. |
| `unsupported_version` | Major version not supported. |
| `bad_signature` | Signature or key check failed. |
| `binding_failed` | Challenge mismatch or timeout. |
| `declined` | The party will not proceed; `detail` says why. |
| `delegation_insufficient` | Scope, caps, or expiry do not cover the request. |
| `mandate_required` | The action needs a per-transaction mandate (Section 7.2). `detail.terms` carries the exact terms. |
| `out_of_scope` | Intent not served by this party. |
| `not_available` | No slot, item, or person matches. |
| `needs_human` | The party requires a human on its side; a `handoff` follows. |
| `neither_confirm_nor_deny` | Healthcare profile; Section 9. |
| `rate_limited` | Too many sessions from this platform. `detail.retry_after` is an RFC 3339 time. |
| `do_not_call` | The party asks not to be called. `detail.until` is an RFC 3339 time, `policies.do_not_call_days` from now. |
| `expired` | Session timed out. |

### 6.6 Human-audible attestation

Every message carries `human_audible`. A sender sets it `true` if a human on its side may have heard the content of that message spoken, or may hear the call at that moment. After binding, an agent that has muted itself and whose principal is not on the line sets it `false`. A session is *machine-only* when every message after `bound` from both sides carries `false`. The receipt records this (Section 7.5). A machine-only session's exchange is not human-directed content; the hello and any handoff always are.

Neither side may treat machine-only as an exception to disclosure or recording rules. The hello is spoken regardless, because neither side can know at connect time who is listening.

## 7. Authority, records, and receipts (L3)

### 7.1 Delegation

The caller's first message after `bound` MUST be a `delegation`:

```json
{
  "principal": {
    "id": "urn:atep:principal:c1b6…",
    "name": "Sohel S.",
    "contact": "+17755551234",
    "platform": "https://lydoh.com/.well-known/atep.json"
  },
  "scope": ["availability", "book", "message", "handoff"],
  "caps": {
    "max_spend": { "amount": 200, "currency": "USD" },
    "date_window": { "start": "2026-10-01", "end": "2026-10-31" },
    "max_bookings": 1
  },
  "identity_verification": "none",
  "issued": "2026-09-23T14:29:00-04:00",
  "expires": "2026-09-23T15:29:00-04:00",
  "revocation_url": "https://lydoh.com/atep/v1/delegations/d_01J8…",
  "credential": "<JWS>"
}
```

- `principal.id` is opaque and stable for the principal on that platform. `contact` is the number the business may use for this booking. `name` is a display name; it need not be a legal name.
- `scope` lists intents; `caps` bound them. `date_window` bounds any booking; `max_spend` bounds any accepted quote or fee; `max_bookings` bounds `book`.
- `identity_verification` is fixed at `"none"` in v1. The caller MUST NOT answer security questions, provide identity documents, dates of birth, account numbers, or one-time codes. Where a business needs those, the answer is `handoff` (Section 8.7).
- `credential` is a JWS over the delegation body without `credential`, signed by the platform's key. Its payload is shaped as a W3C Verifiable Credential (`@context`, `type: ["VerifiableCredential", "AtepDelegation"]`, `issuer`, `credentialSubject` = the delegation body without `credential`) so a payment-network mandate can reference it later. The answerer verifies it against the platform card named in `principal.platform`.
- `expires` MUST be no more than 24 hours after `issued`. The answerer MUST check `revocation_url` (`GET`, returns 200 with `{ "revoked": bool }`) before any receipt, and MUST treat an unreachable revocation URL as not revoked only if the delegation is less than one hour old.

The answerer replies `delegation_ack`. `accepted: false` ends the session with `declined`.

### 7.2 Mandates

Some actions bind the principal beyond a standing delegation: `cancel`, a `reschedule` that carries a fee, and accepting a `quote`. For these the answerer MUST reply `mandate_required` with the exact `terms`, and the caller MUST obtain a `mandate` from its principal before proceeding:

```json
{
  "for": "cancel",
  "reference": "4471",
  "terms": { "fee": { "amount": 50, "currency": "USD" }, "text": "Cancellation within 24 hours carries a $50 fee." },
  "issued": "…",
  "expires": "…",
  "credential": "<JWS>"
}
```

`for` is one of `cancel`, `reschedule`, `quote`, or the name of an extension intent that declares in its definition that it requires a mandate.

How the platform obtains the principal's consent (a push notification, a text, a spoken yes on another line) is the platform's business, but the mandate's `credential` MUST be issued after the terms were shown to the principal, and the platform MUST keep evidence of that. A mandate expires in at most one hour and covers exactly one action with exactly those terms.

### 7.3 Read-back

Every `book`, `reschedule`, `cancel`, and accepted `quote` MUST pass confirmation (Section 6.4). The `summary` in the receipt is the text both sides accepted.

### 7.4 Retention and revocation

A party MUST keep session logs and receipts for at least `policies.retention_days` and MUST NOT keep them indefinitely. A principal's platform MUST be able to revoke a delegation at any time by making `revocation_url` return `revoked: true`. A business that receives a `do_not_call` request from its principal MUST answer subsequent sessions from that caller platform with `do_not_call` for the declared period.

### 7.5 Receipt

A receipt is produced for every state-changing outcome and for every `message` and `handoff`:

```json
{
  "session": "s_01J8…",
  "intent": "book",
  "outcome": "booked",
  "outcome_channel": "atep",
  "reference": "4471",
  "summary": "Booked: new patient visit, Tuesday October 6 at 9:00 AM, for Sohel S., reference 4471.",
  "details": { "service": "new-patient", "start": "2026-10-06T09:00:00-04:00", "duration_minutes": 30 },
  "principal": { "id": "urn:atep:principal:c1b6…", "name": "Sohel S.", "platform": "…" },
  "party": { "id": "urn:atep:party:9f2c…", "name": "Cedar Grove Family Medicine", "card": "…" },
  "delegation": "sha256:…",
  "mandate": null,
  "disclosures": {
    "caller": "This is an AI assistant calling for Sohel S. Callback 7 7 5 5 5 5 1 2 3 4. ATEP.",
    "answerer": "This is Cedar Grove Family Medicine's AI assistant. This call is recorded. ATEP."
  },
  "recorded": { "caller": false, "answerer": true },
  "machine_only": true,
  "log_hash": "sha256:…",
  "issued": "2026-09-23T14:30:41-04:00",
  "signatures": { "caller": "<JWS>", "answerer": "<JWS>" }
}
```

`outcome` is one of `booked`, `rescheduled`, `cancelled`, `not_found`, `quoted`, `quote_accepted`, `message_taken`, `handed_off`, `declined`, `not_available`. Response `outcome` values in Section 8 use the same vocabulary, plus `needs_human`, which produces no receipt because a `handoff` follows. `log_hash` is SHA-256 over the JCS form of the array of all session messages in order. `disclosures` are the hello sentences as spoken. When one side never spoke an ATEP hello (a human answerer, or a task finished by voice under Section 5.5), that side's member of `disclosures`, `recorded`, and `signatures` is `null`. Each side signs the receipt without the other's signature. Both sides MUST store it and MUST make it available to their principal in a human-readable form.

## 8. Intents (L4)

Every intent has a request and a response. Field names are fixed. Free text appears only in the fields Section 3 enumerates, each at most 500 characters.

### 8.1 availability

Request: `service` (id from the card), `window { start, end }`, `preferences { times_of_day: ["morning"|"afternoon"|"evening"], days: ["mon"…], provider }` (optional), `count` (max slots, default 5).

Response: `slots: [{ start, duration_minutes, provider, id }]`, `note`.

Standing delegation suffices. No receipt.

### 8.2 book

Request: `service`, `slot` (an `id` from availability) or `start`, `for { name, contact }` (defaults to the delegation principal), `reason` (an id from the service's `reasons`, only if the card lists them), `note`.

Response: `outcome: "booked" | "not_available" | "needs_human"`, `reference`, `start`, `duration_minutes`, `provider`, `instructions` (what to bring, where to park), `cancellation_terms { text, fee, cutoff_hours }`.

Requires confirmation. Receipt. The `date_window` and `max_bookings` caps apply.

### 8.3 reschedule

Request: `reference`, `to { slot | start }`, `note`.

Response: as `book` with `outcome: "rescheduled" | "not_available" | "needs_human"`, plus `fee` if one applies.

If `fee` is non-zero, the answerer MUST first reply `mandate_required`. Requires confirmation. Receipt.

### 8.4 cancel

Request: `reference`, `reason` (optional).

Response: `outcome: "cancelled" | "not_found" | "needs_human"`, `fee`, `text`.

Always requires a mandate (a cancellation is never reversible by the agent). Requires confirmation. Receipt.

### 8.5 quote

Request: `description` (structured: `service`, `text`, `quantity`, `location`), `budget` (optional, from `caps.max_spend`).

Response: `outcome: "quoted" | "needs_human" | "declined"`, `price { amount, currency }`, `includes: [text]`, `excludes: [text]`, `valid_until`, `terms`, `reference`.

Requesting a quote runs on the standing delegation. Accepting one is a separate `intent` with `intent: "quote"`, `request { accept: true, reference }`, which MUST carry a mandate and MUST NOT exceed `caps.max_spend`. Its response is `outcome: "quote_accepted" | "declined"`, `reference`. Receipt on acceptance.

### 8.6 message

Request: `to { name, role }` (a person or role at the business, optional), `text`, `callback { number, window { start, end } }`, `urgency: "routine"`.

Response: `outcome: "message_taken"`, `reference`, `expected_response` (text).

`urgency` MUST be `routine`. ATEP MUST NOT be used for emergencies or anything where minutes matter; an agent that detects such a request MUST tell its principal to call directly. Receipt.

### 8.7 handoff

Either side may send `handoff`:

```json
{ "kind": "join_principal" | "need_human", "reason": "…", "hold_budget_seconds": 900 }
```

- `join_principal`: the caller's principal wants to be brought onto the call (the "hold my place" case). The answerer keeps the call open, or accepts a redial on a released session, and the caller's platform rings its principal and bridges them. The caller's agent MUST speak one sentence on the call before bridging: "One moment, I'm connecting you to {principal}." and MUST NOT speak after.
- `need_human`: the answerer requires a human on its own side (identity checks, clinical content, anything outside the delegation). The answerer's platform connects a person within `hold_budget_seconds` or replies with `outcome: "not_available"` and a callback window.

Response (a `result` with `intent: "handoff"`): `outcome: "handed_off" | "not_available"`, `kind`, `connected` (bool), `waited_seconds`, `callback { number, window { start, end } }` (on `not_available`), `reason`.

Receipt with `outcome: "handed_off"` and `details { kind, connected: bool, waited_seconds }`.

### 8.8 Extensions

An intent named `x-<vendor>-<name>` MAY be used only if it appears in both cards' `intents`. A receiver that does not recognize an extension replies `out_of_scope`. Extensions MUST NOT weaken any MUST in this document.

## 9. Healthcare profile

Applies to every session where the answerer's card has `healthcare: true`. It exists because a healthcare answerer must verify identity and authority before disclosing appointment details, and software cannot use the judgment a human receptionist can.

Caller obligations:

- MUST restrict `book`, `reschedule`, and `cancel` requests to the fields in Section 8 and MUST NOT include symptoms, diagnoses, medications, or any clinical detail in `note` or `text`. A visit `reason`, if the card's service lists `reasons`, is limited to those ids.
- MUST send a `delegation` whose `credential` includes `credentialSubject.healthcare_authorization: { "statement", "authorized_at" }`: a statement (free text, at most 500 characters), signed by the platform, that the principal authorized this platform to schedule on their behalf, and the RFC 3339 date of that authorization. This is the machine-checkable channel designation a covered entity can rely on.

Answerer obligations:

- MUST NOT confirm, deny, or describe any existing appointment, patient status, or record without a delegation whose principal matches its own record of the patient by `contact` number and name, and MUST reply `neither_confirm_nor_deny` otherwise. The reply MUST take the same time and shape whether or not a record exists.
- MUST serve `handoff` with `need_human`, MUST set `policies.human_available` to `always` or `business_hours`, and MUST move to `needs_human` the moment a request crosses from scheduling into clinical content.
- MUST NOT infer or record emotion or mental state from the exchange.
- MUST declare `policies.retention_days`.

Both:

- A misdelivered receipt (wrong principal, wrong party) MUST be treated as a presumptive breach: the receiving platform deletes it and notifies the sender's `contact.technical` within 24 hours.
- Receipts for healthcare sessions carry `details` limited to service, time, provider, location, and instructions.

## 10. Behavior rules

- **No sales.** An answerer MUST NOT propose goods or services the caller did not ask about. An answerer that does so enters a logged `sale_offered` state, MUST give the seller identity, sales purpose, and nature of goods in `text`, and the caller MUST decline unless the delegation's `scope` includes `x-atep-purchase` (reserved, not defined in 1.0).
- **Back-off.** A caller MUST NOT open more than one session with the same party for the same principal within 10 minutes, MUST honor `do_not_call` for the declared period, and MUST NOT retry a `declined` session for the same request.
- **Rate limits.** An answerer MAY limit sessions per caller platform and MUST say so with `rate_limited` and `retry_after`.
- **Provenance.** Synthesized speech in the hello and any human-audible leg SHOULD carry the speech provider's latent provenance marker where one exists.
- **Cloned voices.** An agent using a cloned human voice MUST say so in its hello: "using a synthetic voice" before "ATEP."

## 11. Conformance

| Level | Name | Requirements |
|---|---|---|
| 0 | Card | Publishes a valid, signed card at the well-known path. Any business, even human-answered. |
| 1 | Caller | Speaks the hello, sends the frame, resolves and verifies cards, completes binding, sends a valid delegation, completes `availability`, `book`, and `message` against the reference answerer, honors `mandate_required`, produces and stores receipts, falls back to voice correctly. |
| 2 | Answerer | Speaks the hello, sends the frame, serves `hello`, binding, all seven intents, confirmation, receipts, `release`, no-record mode, `do_not_call`, revocation checks, and the 2-second latency contract. |
| 3 | Healthcare | Level 2 plus Section 9. |

The reference tester dials a candidate number, or accepts a call from a candidate caller, runs the scenarios for the claimed level, and issues a signed conformance statement. A registry SHOULD list the level.

## 12. Security considerations

- **Replay.** `call_ref.nonce`, the 10-minute `hello` validity, per-message `id` uniqueness, and the 5-minute `ts` window prevent replay of a session or a message.
- **Endpoint impersonation.** A stolen card URL is useless without control of the leg: binding requires sending fresh DTMF challenges on the live call.
- **Number spoofing.** ATEP does not prove ownership of a number; it proves control of a leg. Registry verification calls the number, so a spoofed caller ID cannot register. STIR/SHAKEN attestation, where the call path carries it, SHOULD be logged in the session.
- **DTMF injection.** A phone tree or a human pressing keys could emit digits. Frames are `#`-delimited with a version or binding digit and are only meaningful in the 8-second window after a hello or during binding, and challenges are compared against the HTTPS session, so stray digits cannot bind a session.
- **Key compromise.** Cards carry `expires`; keys carry `expires`; a platform rotates by publishing a new key and re-signing its card. Receivers MUST re-fetch a card when a `kid` is unknown, at most once per minute per card.
- **Delegation abuse.** Scope, caps, 24-hour expiry, and the revocation URL bound the damage of a leaked delegation. `identity_verification: "none"` means a leaked delegation cannot be used to pass a security check anywhere.
- **Denial of service.** Answerers apply per-platform rate limits. The registry rate-limits verification requests per card.
- **Privacy of the log.** `log_hash` commits to the log without disclosing it. Logs stay with the parties for `retention_days`.

## 13. Privacy considerations

The minimum a session discloses is the principal's display name and a contact number. The healthcare profile forbids clinical detail. Receipts carry only what the person would read on a confirmation card. Cards are public by design and MUST NOT contain personal data. Registries store numbers, card URLs, and verification timestamps, nothing about calls.

## 14. IANA considerations

This document requests provisional registration of the well-known URI suffix `atep.json` (RFC 8615), change controller Lydoh (hello@lydoh.com), reference this specification, and reserves the DTMF frame prefixes `#0` (binding frames) and `#1` through `#8` (hello frames, by major version) for ATEP use on ATEP calls.

## Appendix A. Hello sentences by language

English (normative):

- Caller: "This is an AI assistant calling for {principal}. Callback {number}. ATEP."
- Answerer: "{disclosure} ATEP."
- Recording insert: "This call is recorded."
- Redial insert: "ATEP session {id}."
- Synthetic voice insert: "using a synthetic voice"

Other languages are added by pull request with a native-speaker review and MUST preserve every element.

## Appendix B. Example session

1. Caller dials +1 463 251 3583.
2. Answerer: "This is Cedar Grove Family Medicine's AI assistant. This call is recorded. ATEP." then DTMF `#114632513583#`.
3. Caller: "This is an AI assistant calling for Sohel S. Callback 7 7 5 5 5 5 1 2 3 4. ATEP." then DTMF `#1#`.
4. Caller resolves the card from the registry, `POST`s `hello` with challenge `7204`. Answerer replies `hello_ack` with session `s_01J8…` and challenge `4831`.
5. Answerer leg sends `#04831#`. Caller hears it, sends `#07204#`, `POST`s `bind { heard: "4831" }`. Answerer replies `bound`. Elapsed since the caller's frame: about 6 seconds on a telephony-layer implementation at 380 ms per digit.
6. Both send `release`; both hang up. Elapsed on the call: 19 seconds.
7. Caller `POST`s `delegation` (scope availability, book; window October; one booking). Answerer checks the credential and the revocation URL, replies `delegation_ack`.
8. Caller `intent availability { service: "new-patient", window: October, preferences: mornings }`. Answerer `result { slots: [Oct 6 9:00, Oct 8 9:30, …] }`.
9. Caller `intent book { slot: Oct 6 9:00 }`. Answerer `result { outcome: booked, reference: 4471, cancellation_terms }`.
10. Answerer `confirm { summary: "Booked: new patient visit, Tuesday October 6 at 9:00 AM, for Sohel S., reference 4471." }`. Caller `confirm { same summary, accept: true }`.
11. Both sign the receipt. Sohel's phone shows the booking; the practice's front desk sees the receipt on the appointment.

## Appendix C. Changes

- 1.0 draft 3, 2026-09-24: after live gate measurements (atep/GATES.md): the caller's hello is timed from the answerer's frame; the detection window is measured from the end of the hello; digit spacing is a SHOULD with a 500 ms ceiling; the answerer's binding frame waits for the caller's hello frame; binding budget 15 seconds from the caller's frame; receivers split concatenated frames; platform-code pointers recommended; guidance to emit frames from the telephony layer.
- 1.0 draft 2, 2026-09-23: resolved 23 issues found while writing the schemas: required fields stated once, `numbers` optional for platform cards, `detail` is an object with per-code members, `malformed` error added, `credentialSubject` excludes `credential`, free-text fields enumerated, `healthcare_authorization` shape, service `reasons` and the `book` `reason`, handoff response, outcome vocabulary shared with receipts, `callback.window` structured, message `to` (was `for`), registry `sig` carriage and `/v1/cards` body, pointer digits clarified, mandate `for` enumerated, digests lowercase hex, identifier rule, `contact.technical`, key `expires` in RFC 3339, one-sided receipts.
- 1.0 draft 1, 2026-09-23: first public draft.
