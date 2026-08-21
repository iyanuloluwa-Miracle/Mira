# Evaluation data dictionary

Status: placeholder — to be filled in alongside `scripts/export-evaluation-data.ts`.

Defines every field that appears in evaluation exports used for the research evaluation of
this system: name, type, allowed values, and provenance (derived vs. directly collected). This
is the document a reviewer of the research results should be able to check a claimed metric
against.

This dictionary describes **de-identified, aggregate, or synthetic evaluation data only**. It
must never describe, reference, or link to real participant-level records — see CLAUDE.md rule
R10. If a field could re-identify a participant, it does not belong in an evaluation export in
the first place, and should not be documented here as if it does.

Expected sections once populated:

- Screening-level fields (scores, risk band, whether the classifier influenced the band, and
  by how much).
- Latency and reliability measurements supporting NFR3/NFR4.
- Any usability or satisfaction measures collected, and their instrument/source.
