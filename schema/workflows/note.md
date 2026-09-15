# Note Workflow

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

Read [shared page rules](page-rules.md) for page conventions, creation thresholds, voice, and privacy.

For filing user-authored content (meeting notes, reading reactions, journals, scratch thoughts, self-written explainers) without a digest request. Digesting always uses the Ingest Workflow, even if the supplied material is user-authored. Lighter-touch than Ingest — no discussion, no take ceremony. The whole body is the user's voice.

1. Read the note.
2. **Classify by size and density:**
   - **Small** (< ~1KB) or **already structured/tidy** → skip to step 4, file as-is.
   - **Large** (> ~5KB) or **raw / transcript-like / contains visible filler** → propose a trim in step 3.
3. **Trim (conditional).** In a single message, surface what you'd keep and what you'd drop: "I'd keep A/B/C and drop X/Y. OK or file as-is?" One question, not three. Apply the user's answer literally.
4. **File** at `wiki/main/notes/<Essence Name>.md`. The note page IS the file — no separate `raw/` counterpart. Add frontmatter:
   - `type: note`
   - `note_type:` one of `meeting | reading | thought | scratch | self-explainer`
   - `created:`, `updated:` (notes are mutable)
   - `people:` (if applicable)
   - `related:` `[[wikilinks]]` to existing entities/concepts/sources mentioned
5. **Link to existing pages.** Identify entities, concepts, sources named in the note. Use `[[wikilinks]]` inline and in `related:`. Apply the same page creation thresholds as Ingest — do not auto-create new entity pages from a single mention in a single note.
6. **Update `index.md`** under a separate `## Notes` table (alongside `## Sources`).
7. **Append `log.md`** with a one-line entry: `## [YYYY-MM-DD] note | <Title>`.
8. No discussion phase. No `## My take` section. **The take-protection rule (Core Rules) applies to the entire body** — fix typos/grammar and lightly rephrase, but never add ideas or alter meaning.

Notes are equal-weight with sources during retrieval. The Query Workflow does not deprioritize them. The difference between source and note is **provenance**, not **importance**.
