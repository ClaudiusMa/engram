# Artifact contract

Use this contract for every deliverable created or humanized by the skill.

## Source fidelity

The source document is authoritative. Generated copy is never evidence for later generated copy.

| Status | Meaning | Rendering rule |
| --- | --- | --- |
| Confirmed | The source records it as fact or a decided direction | State it directly without strengthening it |
| Exploration | The source records a possibility or alternative | Keep it visibly tentative |
| Unresolved | The source leaves a definition, choice, or evidence gap open | Preserve it as open; never silently choose |

Do not merge quantities with different definitions, populations, denominators, timeframes, or measurement systems. Do not infer causality from attribution or correlation.

## Two-view model

The **Agent view** is complete. Preserve all substantive source sections in order; exact values and definitions; confirmed jobs, problems, and decisions; questions and answers; alternatives and tradeoffs; unresolved limitations; and superseded options that explain the final decision. Visual organization may change; meaning and status may not.

The **Human view** is focused but not artificially compressed. Its structure follows the real source stages. Each stage should read as a short narrative: the user needs to accomplish something; the current experience creates a gap; the decision removes that gap in the smallest supported way; the grounded rationale and anything still open follow only when needed.

Avoid arbitrary three-step summaries, generic headings that erase real stages, invented jargon substitutes, redundant journey strips and closing recaps, decorative components with no reader job, and first-person claims the user never made.

## Required HTML markers

```html
<body data-view="human">
  <nav id="view-switch" aria-label="Artifact view">
    <button type="button" data-set-view="human" aria-pressed="true">Human</button>
    <button type="button" data-set-view="agent" aria-pressed="false">Agent</button>
  </nav>
  <section id="human-view" aria-labelledby="human-title">...</section>
  <main id="agent-view">...</main>
</body>
```

The switch changes `body.dataset.view`, updates `aria-pressed`, and remains visible in both views. Human is the initial state.

Include:

```html
<meta name="artifact-source" content="path/to/source.md" />
<meta name="artifact-color-meaning" content="blue=links, focus, and selected controls" />
```

Set `artifact-color-meaning` to `none` when no non-neutral color is used.

## Source manifest

Include near the end of `<body>`:

```html
<script type="application/json" id="artifact-source-manifest">
{
  "source": "path/to/source.md",
  "sourceSections": ["Purpose", "Step 1 — Alert"],
  "agentSectionsRendered": ["Purpose", "Step 1 — Alert"],
  "humanSections": ["Alert · Tell me what happened"],
  "unresolvedItems": ["The definition remains open"]
}
</script>
```

For Markdown, `sourceSections` lists every level 2–6 heading in order. For other sources, list the structural sections found during extraction. `agentSectionsRendered` contains every source section. `humanSections` follows user-facing stages and may omit administrative sections. Preserve unresolved items without changing their meaning.

## Visual discipline

Neutral is the default. Color is a semantic system, not a decoration kit.

Audit every accent: name its meaning, confirm that meaning is stable, pair it with text or shape, and remove it if the layout remains equally understandable without it. Use one interface accent. Additional colors require a real status or data distinction.

Create hierarchy in this order: sequence and layout; whitespace; typography; neutral surfaces and borders; semantic color only when the first four are insufficient.

## Final QA

- Human defaults correctly and tells the stages in order.
- Agent is complete and source statuses are intact.
- Toggle works with pointer, keyboard, and assistive technology.
- Body text meets WCAG AA contrast and mobile has no horizontal overflow.
- Reduced-motion preferences are respected.
- No TODOs, template labels, invented claims, or unresolved placeholders remain.
- Source manifest matches the source and both rendered views.
- Color metadata names every non-neutral family used.
- Deployment occurs only after a separate request.
