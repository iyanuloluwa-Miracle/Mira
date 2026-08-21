## What and why

<!-- What does this change do, and what problem does it solve? Link an issue if there is one. -->

## Related requirement(s)

<!-- e.g. FR4, NFR5 — see CLAUDE.md. Leave blank if this is pure tooling/chore work. -->

## Safety-critical paths touched

<!-- Check any that apply. If any are checked, this PR needs clinical review before merge
     (see CONTRIBUTING.md) in addition to normal engineering review. -->

- [ ] `server/domain/triage.ts`
- [ ] `server/domain/safety.ts`
- [ ] `config/helplines.ts`
- [ ] `app/content/copy/`
- [ ] None of the above

## Checklist

- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm test` passes; new/changed logic in `server/domain/` or `server/utils/` has tests
- [ ] Requirement tags (`// [FR#]` / `// [NFR#]`) added where applicable
- [ ] No secret, real helpline number, participant data, or thesis document is included in this diff
- [ ] No plaintext free text, chat content, identifier, or token is passed to the logger directly
- [ ] Relevant docs under `docs/` updated

## How was this tested?

<!-- Commands run, scenarios exercised. Screenshots welcome for UI changes — synthetic data only. -->
