# 0001 — Why triage is rule-based rather than model-driven

Date: 2026-08-21
Status: Accepted

## Context

Mira computes a risk band from PHQ-9 and GAD-7 scores and routes the person accordingly (FR4,
FR6). A machine-learned model — the NLP classifier already present as component 3, or a future
model trained directly on triage outcomes — could plausibly do this: learn from labeled
screening data and produce a risk score, possibly a more nuanced one than a fixed rule table.

The system also has a hard safety requirement (rule R2): if PHQ-9 item 9 (thoughts of
self-harm) is answered above zero, the outcome must be CRISIS, every time, with no exception.
NFR5 additionally requires that every screening output come with an interpretable rationale —
not just a number, but a reason a person or a clinician can check.

## Decision

Triage (`server/domain/triage.ts`) and crisis detection (`server/domain/safety.ts`) are
implemented as deterministic rule code: plain conditionals over validated instrument scores,
with no model — classifier or LLM — in the decision path. The classifier (component 3) may
only ever raise a risk band by at most one step above what the rules produced, and it must
record that it did so; it can never lower a band, and it can never be the reason a band is
computed in the first place (rule R1).

## Alternatives considered

- **A model trained end-to-end on scores (and optionally free text) to predict risk band.**
  Rejected. A learned model cannot give the hard, provable guarantee that R2 requires — "item 9
  above zero always means CRISIS" is a property you can read out of an `if` statement in one
  line, and cannot be read out of trained weights without exhaustive testing that no test suite
  can make complete. A single mislabeled training example or a shifted feature distribution
  could silently suppress an escalation. That failure mode is unacceptable for this system.
- **The classifier or LLM allowed to override or lower a rule-based band.** Rejected for the
  same reason, and additionally because it reintroduces exactly the failure mode component 4 is
  explicitly built to avoid: a generative or learned component acquiring authority over a
  clinical outcome (see the component ordering in CLAUDE.md).
- **Rules plus classifier both feeding a single opaque "final score" function.** Rejected
  because it would break NFR5 — a rationale that says "combined score was 0.71" is not
  interpretable in the way "PHQ-9 = 14 (moderately severe) and item 9 > 0" is.

## Consequences

- Triage logic is easy to unit test exhaustively (all input combinations are enumerable) and
  easy for a non-engineer with clinical background to review directly, which is what
  CONTRIBUTING.md requires for changes to this file.
- The classifier's contribution is capped and auditable: any risk band that differs from the
  pure rule-based output is, by construction, exactly one step higher and flagged as
  classifier-influenced. Review and evaluation code can always separate "what the rules said"
  from "what the classifier added."
- This does forgo any accuracy gain a jointly learned model might offer over hand-written
  thresholds. If future evaluation data suggests the fixed thresholds are miscalibrated for
  this population, the fix is to revisit the thresholds themselves (still rule-based, still in
  `triage.ts`, still reviewable) — not to hand decision authority to a model.
- This decision governs `server/domain/triage.ts` and `server/domain/safety.ts` directly; any
  change that would give a model output the ability to set or override a risk band requires a
  new ADR superseding this one, not a quiet code change.
