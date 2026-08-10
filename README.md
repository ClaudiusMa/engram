# Personal Knowledge System

A reusable structure for building a private, LLM-maintained knowledge system. Works with any markdown-compatible frontend platform.

The core idea is that an LLM should not repeatedly rediscover your knowledge from raw files. Instead, it incrementally maintains a persistent wiki: source pages, concept pages, entity pages, position pages, question pages, an index, and a log. The wiki compounds over time.

This repository contains the public structure only. Your actual knowledge stays under the gitignored `wiki/` boundary and is never included in the public repository.

## Quick Start

Create or `cd` into the folder you want to use as your knowledge system, then run:

```sh
npx github:ClaudiusMa/Personal-Knowledge-System init
```

## Privacy Model

GitHub holds structure, not content.

Private content lives under:

```text
wiki/
```

That folder is ignored by git. Private content includes:

- raw source files
- source URLs
- source summaries
- personal takes
- sparks
- entity pages
- concept pages
- position pages
- question pages
- `index.md`
- `log.md`

The `.gitignore` uses a whitelist approach: ignore everything by default, then explicitly allow only the public structure files.

## What Is Tracked

```text
.
├── AGENTS.md
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── artifact/
│   └── README.md
├── bin/
│   ├── personal-knowledge-base.mjs
│   └── personal-knowledge-base.test.mjs
└── schema/
    ├── gitignore.template
    ├── CHANGELOG.md
    ├── agents/
    │   └── apollo.md
    ├── skills/
    │   └── turn-doc-into-artifact/
    │       ├── SKILL.md
    │       ├── references/
    │       │   └── artifact-contract.md
    │       └── scripts/
    │           └── validate-artifact.mjs
    ├── obsidian/
    │   ├── app.json
    │   ├── graph.json
    │   └── types.json
    ├── workflows/
    │   ├── artifact-sync.js
    │   └── archive/
    │       └── artifact-humanize-v1.js
    └── templates/
        ├── index.template.md
        ├── log.template.md
        ├── source.template.md
        ├── note.template.md
        ├── entity.template.md
        ├── concept.template.md
        ├── position.template.md
        ├── question.template.md
        └── project.template.md
```

## What Is Ignored

```text
wiki/
└── main/
    ├── index.md
    ├── log.md
    ├── raw/          # original source files (the source of truth)
    ├── sources/
    ├── notes/
    ├── entities/
    ├── concepts/
    ├── positions/
    ├── questions/
    └── projects/     # pointers to external projects (path/repo, never the content)
```

## Page Types

- `source`: an annotation layer for one ingested source. References the original file in `wiki/main/raw/` via the `file:` frontmatter and a `## Source` embed. Contains a factual `## What's in this source` index and the user's optional, confirmed `## My take`. The original file is the source of truth; the source page never duplicates its content.
- `note`: user-authored content — meeting notes, reading reactions, journals, scratch thoughts. The whole body is the user's voice. Lives at `wiki/main/notes/`.
- `entity`: a concrete recurring thing
- `concept`: a neutral idea, term, pattern, or framework
- `position`: a personal claim or sustained view
- `question`: an unresolved question being tracked
- `project`: a pointer to a living, externally-owned repo or folder *outside* the vault. The LLM reads its current state at query time to draw context from work that didn't originate in PKS — but never copies it in or modifies it.

Position pages are intentionally separate from concept pages. Concepts describe ideas. Positions capture what the owner currently believes about those ideas.

## Workflows

### Ingest

The LLM reads the private index and related pages, creates an annotation layer for the new source, discusses the source before recording the user's take, updates eligible pages, updates the index, and appends the log. Contradiction auditing remains a separate lint operation.

### Query

The LLM reads the private index first, then relevant pages, then answers from the wiki. Durable synthesis can be promoted into a concept, position, or question page when the user approves.

### Lint

The LLM periodically checks for stale pages, missing links, contradictions, orphan pages, missing index entries, and confirmed takes that should be promoted.

### Artifacts

The PKS router sends requests to turn a complete research, analysis, or decision document into an artifact to `schema/skills/turn-doc-into-artifact/SKILL.md`. The portable skill builds a complete Agent view and a default Human view, follows the user's tone and the source's real sequence, and validates source coverage and restrained visual treatment before handoff.

## Direction

The long-term goal is a dedicated frontend for *reading* the wiki — built around how a human consumes source-derived knowledge, not how a graph database stores it. Implications for current ingest decisions:

- **Concepts as retrieval tags.** Concept pages stay lean and tag-like (one-line definition, list of inbound sources, a few wikilinks to adjacent concepts). The future frontend will use concepts as the primary retrieval key, so heavy prose makes retrieval noisy.
- **Related pages → "you might also be interested."** Each source page's `## Related pages` section is the foundation for a recommended-next-read block in the future frontend.
- **Frontend independence.** Markdown stays plain — avoid platform-specific plugin syntax (Dataview, advanced templating). `[[wikilinks]]` and `![[embeds]]` are kept since they're the link primitive of the system.
- **Meta-bookkeeping excluded from graph view.** `wiki/main/raw/`, `wiki/main/index.md`, and `wiki/main/log.md` are filtered out of graph rendering in whatever frontend platform is used.
- **Generated artifacts excluded from graph and frontend.** `artifact/` holds shareable deliverables built *from* wiki facts (e.g. a roadmap or dashboard app), not knowledge to ingest. It is hidden from the frontend platform UI via ignore filters and must be filtered out of graph rendering. The system treats it like `schema/` and `bin/`: structure, not knowledge.

## Frontend Platform Defaults

The knowledge schema stays plain Markdown and can be read by any Markdown-compatible frontend. The initializer also ships conservative Obsidian defaults for link maintenance, graph filtering, and property types.

The following structural paths should be excluded from your frontend's graph view, search, and navigation so they don't pollute the knowledge graph:

- `AGENTS.md`
- `README.md`
- `LICENSE`
- `package.json`
- `.gitignore`
- `schema/`
- `bin/`
- `artifact/`

Additionally, hiding `wiki/main/raw/` from graph view prevents duplicate nodes (one for the original file, one for the source page that annotates it). Raw files remain fully searchable, openable, and embeddable — they are only hidden from the visual graph.

## Using This With an LLM Agent

Point your LLM agent at the knowledge system directory and tell it to follow `AGENTS.md`. The schema is intentionally plain Markdown. No plugins, databases, vector search, or static-site tooling are required at the start.

Start with one broad wiki. Add structure only when real friction appears.

## Verify the Setup

Run the dependency-free initializer smoke test after changing the public schema or setup logic:

```sh
npm test
```

The test creates a temporary vault, verifies required folders and Obsidian defaults, checks idempotency, and confirms private content remains ignored.

## License

MIT
