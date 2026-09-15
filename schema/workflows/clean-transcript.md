# Cleaning Auto-transcripts

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

An ASR / auto-captured transcript is machine output with **no authority** — its garbling isn't worth preserving. On ingest, **clean it in place** (this is "clean," distinct from the wiki [Lint Workflow](lint.md), which audits structure, not content):

- **Sidecar first, always:** before touching the file, copy the untouched original to `<name>.orig.md`. A clean with no sidecar is invalid — cleaning is the one operation that rewrites a raw file, and the sidecar is what makes it non-destructive. The cleaned transcript becomes the readable raw file.
- Deletion is category-bounded: greetings, small talk, dead air, ads/sponsor breaks, music cues, duplicated timestamps, filler, false starts, and verbatim repeats. Everything else stays sentence-for-sentence — **never paraphrase, compress, merge, or reorder the substance**. Readability comes from removing noise and adding speaker labels, not from rewriting.
- Correct ASR errors against confirmed entity names already present in Engram; flag low-confidence corrections inline — *(ASR — confirm)* — never assert them as fact.
- **Verify before saving:** report original → cleaned word counts in the log entry. Reduction beyond ~25% is condensation, not cleaning — stop and show the user what would be dropped before writing.
- **Transcripts only** — authored sources (PDFs, papers, formal docs) keep the strict never-modify-raw rule.
