---
name: turn-doc-into-artifact
description: Turn a complete research, analysis, product-decision, or review document into a polished visual artifact with a faithful Agent view and a focused Human view in the user's tone. Use when the user asks to make, build, render, convert, or humanize an artifact from a document, decision log, report, or other finished text source.
---

# Turn a Document into an Artifact

Use this skill only for a requested artifact; a source digest follows the Ingest Workflow and does not invoke this skill.

Build one self-contained visual deliverable from one authoritative document. Preserve the complete record in the Agent view and make the same work understandable in the default Human view.

Read [references/artifact-contract.md](references/artifact-contract.md) completely before drafting or editing the deliverable.

## Non-negotiable contract

- Treat the handed-over document as the source of truth. Read it completely before writing.
- Never edit the source, invent a decision, resolve an open item, merge unlike metrics, or turn exploration into a conclusion.
- Build the complete Agent view first. Retain every substantive section, exact figure, decision, considered alternative, and unresolved item.
- Build the Human view second. It is a coherent story, not a generic summary or a shorter Agent view.
- Default to Human and provide a fixed Human / Agent switch visible in both views.
- Preserve the user's ideas and word choices. Lightly fix grammar and disfluency; do not make the user sound more certain, formal, or analytical than the evidence permits.
- Use neutral visual hierarchy by default. Color must have a named, stable meaning.
- Do not deploy unless the user separately asks for deployment.

## Determine the mode

Use **build mode** when the user provides a source document and wants a new artifact. Create both views.

Use **humanize mode** when an artifact already has a complete Agent view and the user wants a better Human view. Find its authoritative source from `AGENTS.md`, the source manifest, or the user's message. Preserve the Agent view while replacing only the Human-owned blocks and shared view control.

Stop and ask for the source only when it cannot be discovered. Never use a generated Human view as evidence.

## 1. Resolve the environment

Read the nearest `AGENTS.md` and obey its privacy and editing rules.

In the Engram artifact workspace:

1. Read `artifact/_brand/design.md`, `artifact/_brand/design.dark.md`, and `artifact/_brand/BUILD-INSTRUCTIONS.md`.
2. If `artifact/_brand/precedent.md` exists, read it and inspect the visual precedent it names. Use it only for layout and restraint guidance, never as content evidence.
3. Place new work directly at `artifact/<Artifact Name>/`. Use ProductLab only when the user explicitly requests that integration and destination.
4. Reference the shared logo through `branding/logo.svg`; do not copy or redraw it.

Outside that workspace, use the user's supplied brand and visual precedent. If neither exists, use a restrained neutral system with accessible light and dark modes.

## 2. Inventory the source

Create a private working ledger before touching the deliverable:

- source sections and sequence;
- facts, figures, and exact copy;
- user jobs or questions;
- observed gaps or problems;
- confirmed decisions and product responses;
- alternatives considered and why they were not selected;
- unresolved items and evidence limitations;
- phrases the user explicitly corrected or chose.

Map every source section to its Agent-view destination. Map each user-facing stage to its Human-view section. Keep the source's real number and order of stages; never force the story into three steps.

Before drafting the Human view, write one grounded job-to-be-done sentence for the artifact: who needs to do what, when, and why. Then write the distinct reader question each Human section will answer. If a proposed section cannot answer a necessary part of that job, remove it. Do not organize the Human view around content merely because the source contains it.

## 3. Build the Agent view

Render the complete document faithfully. Improve navigation and visual hierarchy, not meaning.

- Preserve provenance and source order.
- Use tables, timelines, diagrams, or callouts only when they clarify real relationships.
- Keep distinct populations, metrics, statuses, and timeframes distinct.
- Label confirmed, exploratory, superseded, and unresolved material without promotion.
- Include the source manifest defined in the artifact contract.
- Do not compress the deliverable into a teaser.

## 4. Build the Human view

Tell the story in the user's direct, conversational tone. Infer tone only from the source and current conversation; never invent a persona from unrelated material.

The opening must give the brief answer to the artifact's job to be done. The title is an answer, not a topic label, atmospheric tagline, or description of the artifact. The lead states the supported mechanism, decision, or boundary that makes the answer true.

For every source stage, tell the smallest grounded story that answers:

1. What does the user need to accomplish here?
2. What gets in the way?
3. How does the product or decision respond?
4. When supported, why was this response chosen over the alternatives?
5. What remains genuinely unresolved?

Write this as prose, not repeated `Job`, `Gap`, and `Decision` labels. Use the user's exact job wording when supplied. Keep one Human section per real source stage unless the user explicitly groups stages.

Do not add a journey strip, cast list, summary cards, or closing recap merely to fill the page. Add an element only when it helps the reader do a specific job.

When a heading promises a count or taxonomy (for example, “two kinds,” “three stages,” or “four states”), render exactly that many peer items at that level. Fold supporting facts into the correct peer instead of promoting them into an extra category.

## 5. Apply the visual language

Start monochrome. Use typography, spacing, alignment, thin borders, neutral surfaces, and sequence for hierarchy.

Before adding non-neutral color, write down what it means. Remove it if that meaning does not hold everywhere it appears.

- Use at most one interface accent for selection, links, and focus.
- Add other colors only for necessary status or data distinctions with explicit labels.
- Never give ordinary sections different colors merely to make them look different.
- Avoid decorative tinted cards, rainbow borders, colored shadows, glow, and gradients.
- Use a visualization only when it materially clarifies composition, comparison, sequence, or causality.
- Match the restraint of the nominated precedent without copying its content or forcing its layout onto a different story.

One legend may encode only one named semantic dimension whose values are peers. Verification status, roadmap position, optionality, and unresolvedness are different dimensions and must not share one legend. If an item could truthfully carry two labels at once, those labels are not mutually exclusive values of one dimension; separate the dimensions, label them locally, or remove the legend.

## 6. Write the artifact

Create or update:

- `index.html` — semantic, responsive, self-contained static HTML with no build step;
- `AGENTS.md` — source path, two-view contract, unresolved-item rule, and shared-brand pointer;
- `branding/logo.svg` — the shared logo link when available.

Follow the HTML markers and source-manifest schema in the artifact contract. Preserve unrelated user changes in an existing artifact.

## 7. Validate before presenting

Run:

```sh
node schema/skills/turn-doc-into-artifact/scripts/validate-artifact.mjs \
  --artifact "<artifact-dir>" \
  --source "<source-file>"
```

Then preview desktop and mobile widths. Verify:

- Human is the default and both switch buttons work with keyboard and pointer input;
- every source section is represented in the Agent manifest;
- Human sections follow the real sequence;
- the opening answers the declared job to be done, and every Human section answers its declared reader question;
- any stated count matches the number of peer elements rendered;
- facts, decisions, alternatives, and unresolved items retain their status;
- light and dark modes remain legible;
- no overflow, clipped controls, broken logo, console errors, or placeholder text remains;
- every use of color has an explicit purpose;
- every legend, when present, contains values from one named semantic dimension.

Treat browser comments as editing feedback. Apply clear comments literally; ask only when a comment would materially change meaning and its intent is ambiguous. Re-run validation after every revision.

## 8. Report the result

Leave the validated output directly in `artifact/`; the folder is already temporary. Do not classify ProductLab ownership, look up its catalog, move the output, or request a handoff as part of ordinary completion. A later explicit user request can enable the optional ProductLab integration. Preserve existing artifacts until the user requests a move or cleanup.

`artifact/_brand/` stays in Engram as the permanent design guide.

Report the artifact and source paths, Human and Agent section counts, unresolved items preserved, validation result, and whether deployment was intentionally skipped.

In Engram, run `git status --short --ignored` and confirm that artifact and wiki content remain ignored and no private knowledge became tracked.
