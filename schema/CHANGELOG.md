# System Changelog

Changes to how agents work in this repo — rules, workflows, harnesses, conventions. Maintained by [Apollo](agents/apollo.md); one entry per applied change, newest first.

Format: `## [YYYY-MM-DD] scope | change` — body: what changed, the incident that triggered it, what would now block it.

## [2026-08-10] git | Restore repository metadata after moving the active vault

- Restored the existing Git metadata from the previous local checkout into `/Users/claudiusma/Documents/PKS`, reinstated the default-deny root `.gitignore`, and set `origin` to `https://github.com/ClaudiusMa/Personal-Knowledge-System.git`.
- Trigger: the active vault had been moved or copied without its hidden `.git` and `.gitignore`, leaving it disconnected from its existing history and exposing private paths as ordinary filesystem content.
- Now blocked by: the active vault retains the existing `main` history and upstream configuration, while the root allowlist ignores `wiki/`, Obsidian state, artifact content, and other private or machine-local paths before any staging or push can occur.

## [2026-08-06] artifact | Route document-to-artifact work through one portable two-view skill

- Added `schema/skills/turn-doc-into-artifact/`: one vendor-neutral PKS skill that renders a complete Agent view, then a default Human view whose sections follow the source's real sequence and tell each stage through the user's job, the gap, and the grounded response. It includes a source/status contract and a dependency-free structural validator.
- Archived the former `artifact-humanize` dynamic workflow as inactive v1 and routed both new artifact creation and existing-artifact humanization through the skill in `AGENTS.md`; no model-product installation or duplicated skill copy is required.
- Strengthened the shared light and dark brand guidance: artifacts start neutral, one interface accent is the default, every additional color needs a stable state or data meaning, and decorative section colors, tinted cards, gradients, glow, and colored shadows are prohibited. The private brand precedent points agents to the user's approved restrained artifact.
- Trigger: the old 2–3-beat Humanizer could not reproduce a successful screen-by-screen story from a complete decision log, while recent artifacts overused the available accent palette without semantic purpose.
- Now blocked by: the PKS router loads one complete skill; the source manifest makes Agent coverage and the unresolved-item record auditable; the Human contract keeps the source's actual stages and the user's confirmed wording; deterministic validation checks the two-view shell and declared color semantics before handoff.

## [2026-08-01] routing | Check pending files only when ingestion is signaled

- Removed the universal session-start route and moved the pending-file check into the Ingest Workflow.
- Trigger: a knowledge-base question began with an unrelated promise to check the vault for pending ingests because every new session was required to scan `wiki/main/raw/` before routing the user's request.
- Now handled by: questions route directly to the Query Workflow, while a signal that new material should be ingested initiates the pending-file check.

## [2026-07-22] artifact-brand | Install Koji beside the shared design systems

- Cloned the private canonical `doordash/koji` repository into the gitignored `artifact/_brand/koji/` infrastructure area; its pinned Pro v1.5.0 distribution, design guide, and generated component documentation remain intact inside the clone.
- Trigger: Koji is needed for explicitly requested prototype work, but it is shared design infrastructure rather than a knowledge-generated artifact; a proposed separate `.local/` checkout and additional brand-selection rules added unnecessary indirection and documentation.
- Now blocked by: the checkout lives with Prism and SDS under `_brand/`, the existing Geist-default guidance remains untouched, and the outer repository's default-deny ignore rule prevents the private nested repository from entering the public PKS history.

## [2026-07-16] artifact-humanize | Compile one PKS-grounded story and fail closed

- Replaced the child-directed, exhaustive paraphrase with a bounded editorial compile: one main point, two or three supporting sides, an adult audience, a 450-word ceiling, a 30-word hook ceiling, canonical terminology, and explicit fact / proposal / open status.
- Trigger: the S&O artifact's generated Human view was roughly as long as its Agent view, buried the main point, invented labels such as "boss team," recast the Robocop AI agent as a generic "computer program," and could reuse its own prior Human copy as evidence on reruns.
- Now blocked by: the Ground phase resolves only PKS pages cited by the untouched Agent view; prior generated blocks and world knowledge are excluded; every displayed line carries evidence IDs; Gretel reopens the source pages for an independent check; deterministic, story, terminology, or grounding failures prevent publication; postflight restores the original artifact unless it proves the accepted story was copied exactly and the Agent view was preserved.

## [2026-07-16] obsidian | Hide `.orig.md` sidecars from the frontend

- Added the regex filter `/\.orig\.md$/` to `userIgnoreFilters` in `schema/obsidian/app.json` and the live `.obsidian/app.json` (the installer only copies the template when the live file is missing, so both needed the edit). Sidecars stay on disk as the clean's audit trail but no longer surface in Obsidian search, the quick switcher, or the graph.
- Trigger: the sidecar-first rule (below) makes untouched ASR originals accumulate in `raw/`; the felt cost was frontend clutter, not disk (measured: 77KB per sidecar against a 109MB `raw/`, 93MB of it PDFs).
- Decided against auto-deletion — timed destruction of originals re-opens the loss path the sidecar rule closed. A lint-surfaced, user-approved deletion checklist item was drafted and deferred until sidecars number in the dozens.

## [2026-07-16] clean | Sidecar mandatory before any transcript clean

- "Keep the untouched original only if useful" became "sidecar first, always": copy the original to `<name>.orig.md` before any edit; a clean with no sidecar is invalid.
- Trigger: the 2026-07-16 Jason Yuan ingest announced a sidecar, never wrote one, then rewrote the raw file in place — the vault's only copy of the ~13.9k-word transcript is now a 5.2k-word paraphrase; the original survives only as a chat attachment.
- Now blocked by: the original is preserved on disk before the first edit, so even a bad clean destroys nothing.

## [2026-07-16] clean | Category-bounded deletions + word-count check

- "Keep the substance close to verbatim" (aspirational, self-certified) became mechanical: deletions limited to enumerated noise categories; never paraphrase, compress, merge, or reorder the substance; original → cleaned word counts reported in the log entry; reduction beyond ~25% forces a stop-and-show before saving.
- Trigger: same incident — a 63% reduction shipped with a header claiming "close to verbatim." Drift was already visible in the 2026-07-15 clean ("combined adjacent turns", "grouped by topic").
- Now blocked by: the 63% reduction trips the word-count check; sentence-level fidelity removes the discretion to compress.

## [2026-07-16] sources | Closed section set; digest requests never land on source pages

- Source pages now have a closed section set: the three required headings plus optional `## Related pages` and `## Source notes`; no other `##` may appear. The no-synthesis Core Rule now names the term collision: a request phrased as "digest as source" still routes the distillation to `artifact/workshop/<name>/` or chat, with the boundary named to the user rather than silently resolved.
- Trigger: same incident — the prompt said "digest as source"; when the user later asked for the distilled process, the agent added a `## Process sequence shown in the source` section (three tables + a 12-step model) to the source page instead of routing it to the workshop.
- Now blocked by: the extra section violates the closed set regardless of phrasing; the routing clause gives the digest a legal home and requires surfacing the conflict.

## [2026-07-13] roles | Create Apollo, the system-improvement role

- Added `schema/agents/apollo.md` — the first named agent role: improves rules/workflows/harnesses so worker agents behave; never does object-level work (no wiki writes, no artifact deliverables). Operating loop: debug → propose → align (explicit per-change sign-off) → apply → verify → record here.
- Routed the root `AGENTS.md` `meta` row to the Apollo harness; established this changelog.
- Trigger: Apollo-role work itself overreached — a "debug why the agent made a .md instead of an artifact" request was answered with unapproved README rewrites and an unrequested artifact build. The harness makes the align gate explicit and per-change; the loop's step 1 states that a message describing a desired end state is diagnosis input, not an execution trigger.
