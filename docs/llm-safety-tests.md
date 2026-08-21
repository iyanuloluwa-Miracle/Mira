# LLM safety tests

Status: placeholder — to be filled in alongside `server/api/conversation/` and
`server/services/conversation/`.

Documents the deterministic pre-filter and output post-filter that enforce rule R6 on the
bounded conversational layer (component 4), and the adversarial test cases used to verify them.
The system prompt is not, on its own, an acceptable enforcement mechanism for R6 — this
document exists specifically because "the prompt tells it not to" is not a testable claim, and
the filters described here are.

Expected sections once populated:

- **Pre-filter**: what user input is blocked or reshaped before it reaches the LLM (e.g.
  requests for a diagnosis, medication dosing, or crisis instructions), and where that logic
  lives.
- **Post-filter**: what LLM output is blocked, rewritten, or replaced with static copy before
  it reaches the user, and how each of the R6 prohibitions (no diagnosis, no disorder-naming
  conclusion, no medication/dosage information, no self-issued crisis instructions, never
  claims to be a clinician) maps to a specific filter check.
- **Adversarial test cases**: the prompts used to try to defeat each filter, expected behavior,
  and where the corresponding tests live (likely `tests/integration/`).
- **Failure mode**: what happens when the LLM is unreachable (must degrade per rule R7, not
  fail the conversation feature entirely — psychoeducation content still needs a fallback path).
