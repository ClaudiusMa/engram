# Shared page and intake rules

Load this file only for workflows that classify or write wiki pages. Repository-relative paths are relative to the Engram root.

## Page Types

- `source`: an annotation layer for one ingested source. References the original file in `wiki/main/raw/` via the `file:` frontmatter and a `## Source` embed. Contains a factual `## What's in this source` index and optional dated takes. Material processed through source ingest, including every explicit digest request; usually externally-authored content such as product briefs, papers, books, formal docs, and websites.
- `note`: user-authored content — meeting notes, reading reactions, journals, scratch thoughts, self-written explainers. The whole body is the user's voice; there is no `## My take` section because the note IS the take. Lighter-touch ingest than `source` (no discussion phase, no entity/concept promotion beyond linking). Lives at `wiki/main/notes/`, not `sources/`.
- `entity`: a concrete recurring **non-person** thing: organization, product, tool, place, book, project, etc. **People are never entity-paged** — they're mentioned inline as plain text (see [page creation thresholds](#page-creation-thresholds)).
- `concept`: a descriptive idea, theme, pattern, term, or framework.
- `position`: an opinionated personal claim or sustained view. Positions link to supporting, conflicting, and related pages.
- `question`: an unresolved question being tracked.
- `human-skill`: a private, living playbook for a capability the user performs. The human executes it; the agent may retrieve it and may update it only through the Human Skill Workflow after explicit approval. Human skills live in `wiki/main/human-skills/` and are not agent `SKILL.md` files.
- `project`: a thin private pointer to a living external project, created only on an explicit connection request. Existing pointers may be cited as recorded knowledge; live external reads require explicit user authorization. ProductLab resolution and connection mechanics belong to the optional integration, not ordinary Engram retrieval.

Filename conventions:

- **`wiki/main/sources/` and `wiki/main/raw/`**: Title Case with spaces. **No date prefix** — dates live in frontmatter (`published:`, `captured:`). **Short — capture the essence only**, drop em-dash subtitles, drop redundant brand prefixes when context implies them. The source page filename mirrors the source's essence; the raw file keeps the author's framing unless the author's filename is unreadable, in which case rename. Long descriptive titles make the wiki harder to scan and harder to render in a future frontend — keep them tight.
- **`wiki/main/concepts/`, `entities/`, `positions/`, `questions/`, `projects/`, `human-skills/`**: lowercase kebab-case. These function as retrieval tags (see the Direction section in `README.md`), so the filename IS the tag. Human skills use unique filenames such as `meeting.md`, not repeated `SKILL.md` filenames, to stay distinct from agent skills and unambiguous in Obsidian.

Examples:

- `wiki/main/sources/AI Design Principles Audit.md`
- `wiki/main/raw/AI Design Principles Audit.pdf`
- `wiki/main/concepts/ai-agents.md`
- `wiki/main/positions/agents-are-workflow-tools-not-coworkers.md`
- `wiki/main/questions/what-makes-a-note-worth-promoting.md`
- `wiki/main/human-skills/meeting.md`
- `wiki/main/projects/example-project.md`

## Required Wiki Files

Each wiki has:

- `index.md`: content catalog. Read this before any ingest or query.
- `log.md`: chronological append-only record.

Log headings must use:

```md
## [YYYY-MM-DD] ingest | Title
```

Other operation types may use:

```md
## [YYYY-MM-DD] query | Topic
## [YYYY-MM-DD] lint | Scope
## [YYYY-MM-DD] connect | Project
## [YYYY-MM-DD] human-skill | Title created
```

#### Source vs Note classification

A digest request always routes to source ingest; do not apply this classifier to it. For a content drop without a digest request, when a file lands in `raw/` and could be either, classify by signals. Proceed silently when 4+ signals agree; ask once only when signals split.

| Signal | source | note |
| --- | --- | --- |
| Format | PDF, .docx, exported doc | bare markdown |
| Filename | "Brief", "Proposal", "Audit", "Paper", em-dash subtitle | informal, first-person, "meeting notes", "thoughts on X" |
| Author | external named author | you, or no attribution |
| Voice | third-person, citations, formal | first-person, "I think", "we discussed" |
| Structure | TOC, page numbers, formal sections | bullets, quote+reaction, scratch |

## Promotion Rules

Keep source-page takes scoped to the source.

Create or update a `position` page when the user's view becomes reusable across sources.

Create or update a `concept` page when an idea needs neutral explanation.

Create or update a `question` page when uncertainty remains important.

Example:

- Source take: "This article makes me skeptical that agents should be framed as coworkers."
- Concept: `[[ai-agents]]`
- Position: `[[agents-are-workflow-tools-not-coworkers]]`
- Question: `[[when-do-agents-need-human-review]]`

## Position Pages

Positions are personal claims, not neutral topic summaries.

They should include links to:

- related concepts
- supporting sources
- conflicting or complicating sources
- open questions

This makes them useful in Obsidian graph view as synthesis nodes.

## Privacy Checklist

Before every commit or status report:

- `git status` must not show private source files or wiki content as tracked.
- `wiki/` must remain ignored.
- URLs are private.
- `index.md` and `log.md` are private.
- Source summaries, takes, and page links are private.
- Human-skill pages, routing metadata, iteration records, and related links are private.
- Project pages — including their local `path:` and `repo:` pointers — are private; they live under `wiki/`.


## User voice

- A user's `My take` (and note bodies) are the user's voice — preserve the **ideas and meaning, not the exact words**. **Allowed silently:** fix typos/misspellings, fix grammar, and lightly rephrase for readability. **Prohibited:** changing the meaning, inserting any idea/reasoning/analysis the user didn't express, expanding, adding caveats, or reframing a claim into something subtly different. Every idea in the take must be one the user actually said — tidy the wording freely, never add or alter an idea.
- The common failure is sliding from "rephrase" into "add": a connective "because/as…", an explanatory clause, or a header asserting a framing the user didn't state. If a rephrase makes the take say *more* than the user said, you've crossed the line — pull it back. When unsure whether a rephrase preserves meaning, keep the user's words.
- If a take seems incomplete or unclear, surface a question to the user; don't fill the gap by editing. If you think the take's *meaning* should change, don't — ask.

## Page creation thresholds

**Page creation thresholds** (apply when deciding what to create during steps 4 and 8 — do not ask the user, apply the rule):

- **Entity page** — create when (a) the entity already appears in another source or wiki page, or (b) the source treats it as a primary subject (named in the title, repeatedly cited, or central to the source's framing). For one-off mentions, link inline if a page already exists; otherwise reference as plain text and let it promote later if it recurs.
- **People are never entity-paged.** Always mention people inline as plain text rather than wikilinking their names. Reasons: first names collide; person pages are directory metadata, not knowledge; the wiki's focus is concepts, sources, and decisions — not a people directory. Exception: only if a person IS the primary subject of a substantial source (a biography, a memoir), discuss with the user before creating.
- **Concept page** — create when the source explicitly defines it as a domain category (e.g., a named capability area in a competitive audit, a labeled framework, a term the source itself introduces) or when the concept already appears in another source or wiki page. Otherwise mention inline without a stub.
- **Position page** — create only when the user's `My take` expresses a reusable claim that's likely to apply across multiple sources. Do not pre-emptively create from a source's own claims.
- **Question page** — create only for the user's own tracked uncertainties. Never create from a source's sub-questions.
- **Project page** — never auto-created. Create one only on the user's explicit request to connect an external project (see the Connect Project Workflow). A passing mention of an outside repo stays plain text or an inline link, not a project page.
