# Artifacts

Downstream deliverables built **from** the wiki — shareable outputs like one-pagers, roadmaps, or prototypes that distill PKS knowledge for an audience.

## Why they live here

Artifacts sit inside the PKS repo so agents working in PKS can read and write them locally without crossing repo boundaries — most importantly, the [`artifact-sync`](../schema/workflows/artifact-sync.js) workflow, which reconciles an artifact's `Human/` layer against current wiki knowledge.

## What is tracked vs. ignored

- **Tracked:** this folder and this `README.md` only — the structure and instructions.
- **Ignored:** every artifact project inside (`artifact/<name>/`). Artifact content is private knowledge (it carries internal project context) and is never committed to the PKS remote. See `.gitignore`.

Each artifact is its own self-contained project — typically its own git repo with a [HAI-Harness](https://github.com/ClaudiusMa/HAI-Harness) layer (`Human/` for product thinking, `Agents/` for agent tasks). PKS does not track, commit, or push that content.

## How PKS interacts with an artifact

PKS touches an artifact through one skill and one reconciliation workflow (see [`AGENTS.md`](../AGENTS.md) → Workflows):

- **`artifact-sync` — proposes, never applies.** Writes one dated report, `<artifact>/Human/knowledge-sync-<date>.md`, listing how new wiki knowledge promotes / resolves / contradicts / adds to the artifact's cited claims. It never edits the canonical `Human/` files, the `Agents/` layer, or the deliverable. After you fold the report in, the artifact's own HAI-Harness agent rebuilds the deliverable in its own session.
- **`turn-doc-into-artifact` — builds the deliverable.** Reads one complete source document, renders the full **Agent** record, then adds a default **Human** story in the user's tone. The Human sections follow the source's real sequence and tell each stage through the user's job, the gap, and the grounded response; they are never forced into an arbitrary number of beats. The same skill can humanize an existing artifact while preserving its Agent view.

## Shared brand kit (`_brand/`)

`artifact/_brand/` is the **single source of truth** for visual style across all artifacts — `design.md` / `design.dark.md` (the Geist design system, light + dark) and `logo.svg`. Artifacts **reference** it, they don't copy it:

- **Design system:** an artifact's agent reads `../_brand/design.md` at build time and applies it; nothing is copied, so updating `_brand/design.md` propagates to every artifact's next build — one file, always current.
- **Logo:** each artifact's served `logo.svg` is a relative symlink to `_brand/logo.svg` — update once, reflected everywhere.

Each artifact's `AGENTS.md` carries a Brand section pointing here (the one authorized exception to its "repo is the only source of truth" rule). Full conventions + the line to paste into a new artifact live in [`_brand/BUILD-INSTRUCTIONS.md`](_brand/BUILD-INSTRUCTIONS.md). (`_brand/` itself is gitignored, like all artifact content.)

## Workshop (`workshop/`)

`artifact/workshop/<project>/` holds **agent-produced working material** — plans, task breakdowns, PRD/spec/rubric drafts, research digests. Artifacts are things to *build and share*; workshop docs are the scaffolding that precedes them. They never go in `wiki/` (that would launder agent output into the user's voice — `wiki/` is allowlist-only per `AGENTS.md`). When a workshop doc matures into a shareable deliverable, it graduates to its own `artifact/<name>/`. See [`workshop/README.md`](workshop/README.md).

## Adding an artifact

**An artifact is a folder with a deliverable — a loose `.md` at the artifact root is never an artifact.** "Make X an artifact" means building the shareable deliverable from the content, not copying/renaming a file. Two ways one arrives:

**Creating one from content** (the common case — e.g. "turn this research/plan into an artifact"):

```
artifact/<Name>/
  index.html          ← the deliverable: renders the content, styled per _brand/design.md
                        (Geist light; dark via design.dark.md + prefers-color-scheme)
  branding/logo.svg   ← symlink to ../../_brand/logo.svg
  AGENTS.md           ← Brand section pasted from _brand/BUILD-INSTRUCTIONS.md
  Human/              ← optional; add if it will receive knowledge-sync reports
```

Read and follow `schema/skills/turn-doc-into-artifact/SKILL.md`. It renders the content faithfully as the complete **Agent** view, then builds the default **Human** view and fixed switch in the same source-grounded process. The output is self-contained static HTML with no build step.

**Dropping in an existing project:** place it under `artifact/<name>/` (it's ignored by default — nothing to configure), give it a `Human/` layer whose entries cite their source wiki pages (`Source:` lines) so `artifact-sync` can reconcile by citation, and **wire it to the brand kit:** symlink its served logo to `_brand/logo.svg` and paste the Brand section into its `AGENTS.md` — see [`_brand/BUILD-INSTRUCTIONS.md`](_brand/BUILD-INSTRUCTIONS.md).
