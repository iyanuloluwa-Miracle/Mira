# Security Policy

## Research software, not a certified clinical system

Mira is the reference implementation for an MSc research project. **It is not certified for
clinical deployment and is not a substitute for professional mental health care or a crisis
service.** Treat any deployment beyond local development and research evaluation as
out-of-scope for the guarantees this project makes.

## Reporting a vulnerability

Please do not open a public GitHub issue for a security vulnerability. Instead, use GitHub's
private vulnerability reporting for this repository (Security tab → "Report a vulnerability"),
or, if that is unavailable to you, contact the maintainer directly through the contact details
on their GitHub profile.

Include, where you can:

- A description of the issue and its potential impact.
- Steps to reproduce, or a proof of concept.
- Which rule or requirement (see [CLAUDE.md](CLAUDE.md), rules R1–R10) the issue affects, if
  applicable — this is especially important for anything touching triage logic, the crisis
  pathway, encryption at rest, or logging redaction.

## Response expectations

This is a small research project maintained outside of a funded security program. We aim to:

- Acknowledge a report within 5 business days.
- Give an initial assessment (confirmed, needs more info, not applicable) within 10 business
  days.
- Agree on a disclosure timeline with the reporter once a fix is in progress.

There is no bug bounty.

## Scope

In scope: this repository and its first-party code (`app/`, `server/`, `services/classifier/`,
`prisma/`). Out of scope: third-party dependencies (report upstream), and any production
deployment run by a third party using this code — those deployers are responsible for their own
security posture.

## Safety-relevant reports

If your report concerns the triage or crisis-routing logic itself (e.g. a scoring or routing
error that could suppress an appropriate escalation), please say so explicitly in the subject
line so it can be triaged with the correct urgency, in addition to any purely technical
security implications.
