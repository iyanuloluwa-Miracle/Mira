# Contributing to Mira

Thanks for your interest in contributing. Mira is research software that people may rely on
while distressed, so the bar for changes near the safety logic is higher than a typical
project's. Read this whole document before opening a PR that touches anything under
`server/domain/`, `server/utils/`, `config/helplines.ts`, or `app/content/copy/`.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Node version is pinned in [.nvmrc](.nvmrc); use `nvm use` (or equivalent) before installing.

## Branches and commits

- Branch names: `type/short-description`, e.g. `fix/phq9-item9-routing`,
  `feat/clinician-notes-export`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`. Reference the requirement
  tag in the body where relevant, e.g. `Implements FR6 escalation threshold`.
- Keep commits scoped to one logical change. Don't mix a refactor with a behavior change.

## Before opening a PR

- `npm run lint` and `npm run typecheck` pass.
- `npm test` passes; new or changed logic in `server/domain/` or `server/utils/` has tests.
  Coverage thresholds (90%) on those two directories are enforced in CI — see
  `npm run test:coverage`.
- Any module implementing a functional or non-functional requirement carries its `// [FR#]` /
  `// [NFR#]` tag (see [CLAUDE.md](CLAUDE.md)).
- No secret, API key, real helpline number, participant data file, or thesis document is
  staged. CI runs a pattern scan for this, but review your own diff first.
- Relevant docs under `docs/` are updated if the change affects architecture, data model, or a
  documented control.

## Changes to safety-critical code

The following require review by someone with a clinical background, in addition to normal
engineering review, before merge:

- `server/domain/triage.ts` — the rules that turn scores into a risk level and an escalation
  decision.
- `server/domain/safety.ts` — the crisis-detection and safety-routing rules, including the
  PHQ-9 item 9 override (rule R2).
- `server/domain/conversation-safety.ts` — the bounded conversational layer's pre-filter and
  post-filter (rule R6). Changing a phrase/pattern list here needs the same scrutiny as
  changing triage.ts: it's the actual enforcement mechanism, not decoration. Any change must
  keep every case in `server/domain/conversation-safety.test.ts`'s adversarial suite passing —
  see `docs/llm-safety-tests.md`.
- `server/services/conversation/system-prompt.ts` — what the conversational layer's LLM is
  instructed to do and not do. Not the enforcement mechanism for rule R6 (the filters above
  are), but still every word a person's conversation is shaped by.
- `config/helplines.ts` — any human-support contact information shown to a user.
- `app/content/copy/` — every string a distressed user might read, including crisis and
  escalation copy (rule R3) and the conversational layer's fallback messages
  (`app/content/copy/conversation.ts`).

If you are not able to arrange that review yourself, open the PR as a draft, say so explicitly
in the description, and a maintainer will help route it. Do not merge changes to these paths on
engineering review alone, even for something that looks like a trivial wording fix.

## Engineering rules that apply to every PR

The full list lives in [CLAUDE.md](CLAUDE.md) as rules R1–R10. The two most commonly relevant
day to day:

- No plaintext free text, chat content, identifier, or token may reach a log line — route
  everything through the redactor in `server/utils/logger.ts`.
- `server/domain/` stays free of Nuxt, Nitro, Prisma, and service imports. If your change needs
  one of those inside a domain file, the logic probably belongs in `server/services/` or
  `server/api/` instead.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
