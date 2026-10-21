# Engram

A private, LLM-maintained knowledge system with a reusable public structure. Works with any Markdown-compatible frontend platform.

The core idea is that an LLM should not repeatedly rediscover your knowledge from raw files. Instead, it incrementally maintains a persistent wiki: source pages, concept pages, entity pages, position pages, question pages, an index, and a log. The wiki compounds over time.

![Engram as a personal knowledge system](assets/engram-overview.png)

This repository contains the public structure only. Your actual knowledge stays under the gitignored `wiki/` boundary and is never included in the public repository.

## Quick Start

Create or `cd` into the folder you want to use as your knowledge system, then run:

```sh
npx github:ClaudiusMa/engram init
```

## Graph View

On a Mac, double-click **Engram Graph** in your Engram folder. It opens a map of everything in your Engram (ideas, people and things, stances, open questions, projects, sources, and your notes) in your browser. Click any dot to read about that page and see what it connects to.

Each time you open it, the map is rebuilt from your current pages, so it is always up to date. The map is built on your computer and is never uploaded. Engram Graph needs Node.js; if it is missing, the app offers a link to install it. On other systems, run `npm run graph`.

If your Engram was set up before Engram Graph existed, run the Quick Start command again in that folder to add it. Existing files are left unchanged.

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
    │   ├── artifact.md
    │   ├── artifact-sync.js
    │   ├── artifact-sync.md
    │   ├── clean-transcript.md
    │   ├── connect-project.md
    │   ├── human-skill.md
    │   ├── ingest.md
    │   ├── lint.md
    │   ├── note.md
    │   ├── page-rules.md
    │   ├── productlab.md
    │   ├── productlab-migration.md
    │   ├── project-decision-housekeeper.md
    │   ├── query.md
    │   ├── recap.md
    │   └── archive/
    │       └── artifact-humanize-v1.js
    └── templates/
        ├── index.template.md
        ├── log.template.md
        ├── source.template.md
        ├── note.template.md
        ├── human-skill.template.md
        ├── human-skills-index.template.md
        ├── entity.template.md
        ├── concept.template.md
        ├── position.template.md
        ├── question.template.md
        ├── project-link.template.json
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
    ├── human-skills/ # private human-executed playbooks + compact routing registry
    ├── entities/
    ├── concepts/
    ├── positions/
    ├── questions/
    └── projects/     # pointers to external projects (path/repo, never the content)
```

## Page Types

- `source`: an annotation layer for one ingested source. References the original file in `wiki/main/raw/` via the `file:` frontmatter and a `## Source` embed. Contains a factual `## What's in this source` index and the user's optional, confirmed `## My take`. The original file is the source of truth; the source page never duplicates its content.
- `note`: user-authored content — meeting notes, reading reactions, journals, scratch thoughts. The whole body is the user's voice. Lives at `wiki/main/notes/`. Digest requests always use source ingest instead.
- `human-skill`: a private, user-owned playbook for a capability the human performs. The agent retrieves it only after a dedicated intent gate and updates it only after the user approves a proposed change. Lives at `wiki/main/human-skills/`; it is not an agent `SKILL.md`.
- `entity`: a concrete recurring thing
- `concept`: a neutral idea, term, pattern, or framework
- `position`: a personal claim or sustained view
- `question`: an unresolved question being tracked
- `project`: a private pointer to a living external project, created on explicit request. Recorded annotations may be cited; live project reads and ProductLab catalog resolution require explicit activation of the optional integration.

Position pages are intentionally separate from concept pages. Concepts describe ideas. Positions capture what the owner currently believes about those ideas.

## Workflows

### Ingest

Every request to digest a website, paper, file, or supplied text uses source ingest; it never becomes a note or an automatic companion artifact. The detailed procedure is in `schema/workflows/ingest.md`; shared page and intake rules are in `schema/workflows/page-rules.md`. Contradiction auditing remains a separate lint operation.

### Query

The LLM reads the private index first, then relevant pages, then answers from the wiki. Durable synthesis can be promoted into a concept, position, or question page when the user approves. See `schema/workflows/query.md`.

### Human skills

Human skills externalize practices the user wants to improve through repeated experience. Routing is progressive: ordinary requests never load the skill registry; an explicit human-skill request or an immediate request to perform or reflect on a repeatable human activity may read the compact registry, select at most one direct match, and then load only that skill. The current playbook is authoritative, iteration history stays compact, and no reflection becomes guidance until the user approves the change.

### Lint

The LLM periodically checks for stale pages, missing links, contradictions, orphan pages, missing index entries, and confirmed takes that should be promoted.

### Artifacts

The Engram router sends requests to turn a complete research, analysis, or decision document into a visual artifact to `schema/skills/turn-doc-into-artifact/SKILL.md`. New outputs live directly at `artifact/<name>/`; a single working document may live at `artifact/<Name>.md`. The artifact folder is already temporary. `artifact/_brand/` remains the permanent build guide. Existing outputs are preserved until the user requests a move or cleanup.

### Optional ProductLab integration

ProductLab behaves as an opt-in extension, disabled by default. Only an explicit request to connect, read, sync, or move work through ProductLab loads `schema/workflows/productlab.md`. Engram agents otherwise create artifacts locally without catalog reads, ownership classification, or migration. A complex artifact can move to ProductLab when the user chooses to move it.

### Workflow protection

`AGENTS.md` contains protected routing cases for digest, note, artifact, and optional integrations. System edits must identify affected before/after behavior, explicitly ask for the user's consent and wait for confirmation before changing behavior, preserve unrelated routes, and verify linked instructions and initializer defaults. Historical instructions cannot silently override the current contract.

## Direction

The long-term goal is a dedicated frontend for *reading* the wiki — built around how a human consumes source-derived knowledge, not how a graph database stores it. Implications for current ingest decisions:

- **Concepts as retrieval tags.** Concept pages stay lean and tag-like (one-line definition, list of inbound sources, a few wikilinks to adjacent concepts). The future frontend will use concepts as the primary retrieval key, so heavy prose makes retrieval noisy.
- **Related pages → "you might also be interested."** Each source page's `## Related pages` section is the foundation for a recommended-next-read block in the future frontend.
- **Frontend independence.** Markdown stays plain — avoid platform-specific plugin syntax (Dataview, advanced templating). `[[wikilinks]]` and `![[embeds]]` are kept since they're the link primitive of the system.
- **Meta-bookkeeping excluded from graph view.** `wiki/main/raw/`, `wiki/main/index.md`, `wiki/main/log.md`, and the human-skill routing registry at `wiki/main/human-skills/index.md` are filtered out of graph rendering in whatever frontend platform is used.
- **Generated artifacts excluded from graph and frontend.** `artifact/` is temporary output and `_brand/` is its build infrastructure; neither is knowledge to ingest. Both remain hidden from the frontend and graph. Moving an artifact outside Engram requires an explicit user request.

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
