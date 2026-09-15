# Ingest Workflow

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

Read [shared page rules](page-rules.md) before writing. For an ASR source, follow [cleaning](clean-transcript.md) before ingesting.

- Source digesting preserves the original source-page design: a factual `## What's in this source` index, the original reference in `## Source`, and the user's confirmed reaction in `## My take`. Explain and discuss the source in conversation; do not substitute a separate digest file, add an AI-summary section, or put agent interpretation into the user's take. The source page is the filed result of digesting.

Digest requests use this workflow end-to-end. Create or update the source annotation rather than creating a note or an automatic companion artifact. For a website, retain an original capture or a clearly labeled live-source pointer in `raw/`; never present a URL pointer as a captured copy. If the source was already ingested, update its existing annotation instead of duplicating it.

When the user signals new material for ingestion, check `wiki/main/raw/` for pending files before ingesting. Any file there that is not referenced by an existing source page's `file:` frontmatter is pending. If the user has not identified a file, surface the pending list and ask which one to process; if only one is pending, begin with that file and confirm what you're doing.

1. Read `wiki/main/index.md` first.
2. Read related pages suggested by the index.
3. Read the new source.
4. Identify likely related entities, concepts, positions, questions, past sources, and connected projects.
5. Link to relevant existing pages (entities, concepts, positions, questions, past sources, projects) using `[[wikilinks]]` — in the source page's `## Related pages` and inline in `## What's in this source` where natural. Link existing project annotations as recorded knowledge. Read an external project live only when the user explicitly requests that access; ProductLab access must pass the optional integration gate. Do not analyze the source for contradictions or tensions with existing wiki content; that audit lives in the Lint Workflow.
6. Keep the original file in `wiki/main/raw/`. Create the source page as an annotation layer:
   - Set the `file:` frontmatter to the path of the original.
   - Add a `## Source` section with `![[../raw/<filename>]]` so the original is embedded/linked from the source page.
   - Populate `## What's in this source` with factual bullets only (sections covered, entities mentioned, scope, format).
   - Do not embed the file's content. Do not delete the file.
7. **Discuss the source with the user before capturing `My take`.** After the source page is written, ask 1–3 specific, open questions drawn from the source — what stood out, what to push back on, what feels useful, where it overlaps with the user's existing thinking. Don't ask for a monolithic "take" upfront. Let the conversation move; follow up where the user shows interest. When the user articulates a view, mirror it back as a proposed `My take` ("so your take is X — should I write that down?") and only write on confirmation. Capture in the user's voice — fix typos/grammar and lightly rephrase for readability, but never add ideas or change meaning (per the take-protection rule in Core Rules). If the user has no view or wants to skip, leave `_None yet._`. **The discussion is the point; the take is a byproduct.**
8. Update relevant entity, concept, position, question, and project pages.
9. Promote a take only if it has grown beyond one source.
10. Update `index.md`.
11. Append `log.md`.
12. Show changed files.
13. Run `git status` and verify private content remains untracked.

Apply the [page creation thresholds](page-rules.md#page-creation-thresholds) when deciding what to create during steps 4 and 8.

A source page must contain these headings:

```md
## My take
## What's in this source
## Source
```

(`## Related pages` and `## Source notes` may also appear but are not required. **No other `##` section may appear on a source page** — content that doesn't fit these five headings doesn't belong on the page.)

`What's in this source` is a factual index of the source, not a synthesis. Bullet points naming sections, entities, scope, and format. No prose interpretation — that belongs in `## My take`.

`My take` is the user's reaction, dated by month when present:

```md
### 2026-05
```

If a take is skipped, keep the heading but write:

```md
_None yet._
```
