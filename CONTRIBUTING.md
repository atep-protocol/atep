# Contributing to ATEP

ATEP 1.0 is a draft for public comment. Comments from anyone building voice agents,
phone systems or the businesses they call are welcome.

## Comments on the draft

Open an issue. Quote the section number and the sentence you are commenting on, say
what is wrong or unclear, and, if you can, propose replacement text. Implementation
reports ("we built Section 5.2 on carrier X and measured Y") are especially valuable.

## Changes

- `SPEC.md` is normative. The schemas, examples and tests follow it; where they
  disagree, the spec wins and the artifact is the bug.
- Every change to `SPEC.md` goes into a numbered draft. A pull request that changes
  the spec should say which section it changes and why.
- The discovery path (Section 4.1), the hello sentences (Section 5.1) and the DTMF
  frames (Section 5.2) are frozen. Proposals to change them will not be accepted in
  any 1.x release.
- A pull request that adds or changes a schema adds or updates its example and keeps
  `npm test` passing.

## License

By contributing you agree that your contribution is licensed under the Apache
License 2.0, the license of this repository.
