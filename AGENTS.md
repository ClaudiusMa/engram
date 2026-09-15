# AGENTS.md

This repo is Engram: an Obsidian vault and open-source schema for a private,
LLM-maintained knowledge system. The public repository contains structure only;
`wiki/` is private and gitignored. GitHub stores structure, not knowledge.

The canonical public name is **Engram**. `PKS`, `personal-knowledge-base`, and
`personal-knowledge-system` remain permitted internal implementation names. The
public structure includes `README.md`, `LICENSE`, `.gitignore`, `package.json`,
`bin/`, `schema/`, and the tracked `artifact/README.md` shell. Do not add
tooling unless the user asks or repeated pain justifies it.

## Identity and boundaries

- Obsidian is the frontend; the LLM edits Markdown.
- Use one wiki at launch: `wiki/main/`, with one root `AGENTS.md`.
- Before any file write, classify it: structure is tracked; knowledge is
  gitignored. Never ingest private content into tracked files.
- `wiki/` writes are allowlist-only. `raw/` receives originals through ingest or clean; `sources/` is
  written by ingest; `notes/` only files the user authored; agents never create, expand, or backlink notes on their own initiative; `human-skills/`
  only follows the human-skill workflow; concepts, entities, positions,
  questions, and projects require their documented thresholds and workflows.
  Content without an authorized path is denied.
- Raw source files are authoritative and are never modified or deleted, except
  auto-generated transcripts cleaned under the clean-transcript workflow.
  Source pages annotate originals through `file:` and an embed; they do not
  copy source content.
- Digest always means source ingest, even for user-authored material, and never
  routes to notes or an automatic companion artifact. AI-created working
  products live directly in `artifact/`; existing artifacts stay in place.
- `artifact/` is temporary; `artifact/_brand/` remains the permanent design guide. A routing change never
  authorizes moving or deleting existing artifact files.
- ProductLab is disabled unless the user explicitly invokes that integration.
  Project names, existing pointers, artifact complexity, and earlier use do not
  enable it; ordinary work does not read its catalog, classify ownership, or
  migrate outputs or request a handoff. Human-skill registry and pages are deferred until their
  intent gate passes.

The source-page contract is fixed: `## My take`, `## What's in this source`,
`## Source`, with optional `## Related pages` and `## Source notes`; no other
level-two headings. A user's take and note body preserve the user's ideas and
meaning. Silent edits may fix grammar and readability; they may not add
reasoning, caveats, or interpretation. If meaning is unclear, ask.

## Routing

Classify the request first, then load only the selected workflow and explicitly
needed shared rules. Follow it end-to-end; do not read every linked workflow. Repository-relative paths below are relative to this root.

| Intent | Route |
| --- | --- |
| Digest or ingest a source, including a new external file in `raw/` | [`schema/workflows/ingest.md`](schema/workflows/ingest.md) |
| File the user's own note without a digest request | Note Workflow → `wiki/main/notes/`; [`schema/workflows/note.md`](schema/workflows/note.md) |
| Clean an ASR transcript | [`schema/workflows/clean-transcript.md`](schema/workflows/clean-transcript.md) |
| Questions, advice, planning, or recommendations | [`schema/workflows/query.md`](schema/workflows/query.md) |
| Lint or check stale pages | [`schema/workflows/lint.md`](schema/workflows/lint.md) |
| Weekly recap | [`schema/workflows/recap.md`](schema/workflows/recap.md) |
| Sync an artifact | [`schema/workflows/artifact-sync.md`](schema/workflows/artifact-sync.md) |
| Turn a document into an artifact, humanize it, or add a Human view | [`schema/workflows/artifact.md`](schema/workflows/artifact.md) |
| Connect an external project | [`schema/workflows/connect-project.md`](schema/workflows/connect-project.md) |
| Create, show, use, or update a human skill | [`schema/workflows/human-skill.md`](schema/workflows/human-skill.md) |
| ProductLab work | [`schema/workflows/productlab.md`](schema/workflows/productlab.md), only after explicit invocation |
| System, schema, workflow, harness, or Git configuration changes | [`schema/agents/apollo.md`](schema/agents/apollo.md) |

Digest takes precedence over source-versus-note heuristics. For applicable
classification and page conventions, load [`schema/workflows/page-rules.md`](schema/workflows/page-rules.md).
Do not load human-skill context for topical mentions or ordinary queries.
If a message triggers multiple categories, default to ingest when new raw
material and a question coexist; discussion belongs in ingest. A genuinely
ambiguous request is the one case to ask which category applies. Cleaning an
ASR transcript continues to ingest when it came from a digest, otherwise to
the applicable source or note workflow. Human-skill routing includes creating,
showing, using, or updating a skill and immediate help performing or reflecting
on a repeatable activity; it may read only its compact registry and one match.

## Protected behavior

Routes, destinations, provenance, and existing content survive refactoring,
cleanup, and integrations. System edits route through Apollo. Before changing
workflow behavior, show the proposed change, explicitly ask for the user’s
consent, and wait for confirmation before editing. Apollo honors explicit
consent already given for that exact change in the current task; inferred
intent, old approvals, or consent for another change are insufficient.

## Public/private check

Before a commit or status report, verify `wiki/` remains ignored and private
source files, URLs, summaries, takes, indexes, logs, human-skill pages, and
project pointers are not tracked. See the selected workflow for its complete
procedure and reporting requirements.
