---
name: humanize-writing
description: |
  Edit Engram-facing prose so it does not read like model output. Use when
  writing a Human view, or when the user asks to humanize, de-AI, or make
  writing sound like a person. Practice adapted from jpeggdev/humanize-writing.
  Engram voice rules override any step that would invent opinions or experience.
---

# Humanize writing

Engram's own editing pass for prose a person will read. The pattern list is adapted from the public skill [jpeggdev/humanize-writing](https://github.com/jpeggdev/humanize-writing) (v2.0.0) and from the public "Signs of AI writing" notes that skill cites. This file is not a copy of that repository. Do not install the npm package or a second copy under a product folder.

Use it when the artifact skill builds a Human view, or when the user asks to humanize writing. It changes sentences. It does not change facts, decisions, or page contracts.

## What wins

Recorded user language and source fidelity win. Do not invent a first person, a reaction, a joke, a lived detail, or a stronger claim so the prose has "soul." If the user has no take, say the take is missing. Upstream pass 8, which adds opinions and experience, does not apply here.

"Harness" as a noun for agent scaffolding is a term in this repo. Do not treat that noun as an AI tell. Metaphorical verbs ("harness the power") still count.

## Passes

Run them in order. Skip a pass that finds nothing.

1. **Structure.** Do not give every section the same shape, the same list length, or a closing "takeaway" box. Fold the point into the paragraph. Some sections can be short.
2. **Inflation.** Delete pivotal, vital, groundbreaking, nestled, vibrant, testament, and "marking a shift" unless the source uses those words as claims. Put the fact in their place.
3. **Vocabulary.** Cut delve, tapestry, realm, myriad, plethora, and metaphorical landscape, leverage, navigate, ecosystem. A cluster of robust, seamless, nuanced, comprehensive, transformative is a tell. Restructure the sentence. Do not synonym-swap.
4. **Grammar.** If "serves as," "stands as," and "represents" are rotating in place of "is," use "is." Cut empty tails: highlighting, underscoring, showcasing, fostering. Do not pad a pair into three. Repeat the clearest noun instead of cycling synonyms. Do not write "from X to Y" unless X and Y sit on one scale.
5. **Rhythm.** Vary sentence length. Allow a short sentence. Count em dashes before cutting them. More than one per few paragraphs, or a dash used only as a dramatic aside, should become a period or a comma. Do not bold every label in a list. No emoji.
6. **Hedging and filler.** Cut "it's worth noting," "in order to," "due to the fact that," chatbot closers, and unnamed experts. Keep a hedge when the source is actually unresolved. Name the source or delete the claim.
7. **Connectives.** Drop Moreover, Furthermore, Additionally, In conclusion, That said, Moving forward. Start the next sentence, or use because, so, but, and.
8. **Voice, without invention.** Use phrases the user already wrote, including hedges and unfinished judgments. Do not smooth them into a tighter thesis. Do not add "I" they did not use.

## Keep

Numbers, names, dates, status labels, and the order of the argument. Light grammar fixes are fine. A meaning change is not.

## Afterward

Read it as if saying it aloud. If a sentence could describe any topic after a noun swap, rewrite it from the source. Do not append a changes table to an artifact. A changes table is only for a rewrite the user asked to review as an edit.
