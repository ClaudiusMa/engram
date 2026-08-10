export const meta = {
  name: 'artifact-humanize-v1-archived',
  description: "Archived, inactive Humanizer v1. Preserved only as system history; do not dispatch new work here.",
  phases: [
    { title: 'Ground',  detail: "Resolve the artifact's cited PKS pages and build a claim ledger; prior generated Human blocks and world knowledge are forbidden", model: 'haiku' },
    { title: 'Draft',   detail: "Grimm selects one main point and 2–3 supporting sides; <=450 words, no mandatory cast, canonical terms preserved", model: 'haiku' },
    { title: 'Review',  detail: "Gretel cold-reads for coherence and independently checks every displayed sentence against the PKS ledger", model: 'haiku' },
    { title: 'Publish', detail: "Publish only a passing story, then verify exact story copy and Agent-view preservation; restore on failure", model: 'haiku' },
  ],
}

// ───────────────────────── args ─────────────────────────
// { pksRoot, artifactPath, maxRounds?, audience?, model? }
// maxRounds = revise cycles after the first review (default 2, max 3)
// audience = optional override; default is an intelligent, time-constrained adult outsider
// model = optional runtime-specific worker model; defaults to the lower-cost "haiku"
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
for (const k of ['pksRoot', 'artifactPath']) {
  if (!A[k]) throw new Error(`artifact-humanize: missing required arg "${k}". Invoke with { pksRoot, artifactPath }.`)
}
const pksRoot = A.pksRoot, artifactRel = A.artifactPath
const maxRevises = Math.max(0, Math.min(Number.isInteger(A.maxRounds) ? A.maxRounds : 2, 3))
const workerModel = (typeof A.model === 'string' && A.model.trim()) ? A.model.trim() : 'haiku'
const audience = (typeof A.audience === 'string' && A.audience.trim())
  ? A.audience.trim()
  : 'an intelligent, time-constrained adult who has no context about this project or domain'
const ART = `${pksRoot}/${artifactRel}`, INDEX_HTML = `${ART}/index.html`
const WIKI_INDEX = `${pksRoot}/wiki/main/index.md`, BRAND = `${pksRoot}/artifact/_brand`
const artifactName = artifactRel.split('/').filter(Boolean).pop()
const backupName = artifactName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artifact'
const BACKUP_HTML = `/tmp/pks-humanize-${backupName}-${Date.now()}.html`
const MAX_WORDS = 450, MAX_HOOK_WORDS = 30, MAX_TITLE_WORDS = 14
const MIN_BEATS = 2, MAX_BEATS = 3, REVISE_EST = 14000

// ───────────────────────── schemas ─────────────────────────
const EVIDENCE_STATUS = ['fact', 'proposal', 'open']
const EVIDENCE_ITEM = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string' },
  statement: { type: 'string' },
  status: { type: 'string', enum: EVIDENCE_STATUS },
  sourcePath: { type: 'string' },
  sourceTitle: { type: 'string' },
  support: { type: 'string' },
}, required: ['id', 'statement', 'status', 'sourcePath', 'sourceTitle', 'support'] }
const TERM_ITEM = { type: 'object', additionalProperties: false, properties: {
  term: { type: 'string' },
  description: { type: 'string' },
  evidenceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
}, required: ['term', 'description', 'evidenceIds'] }
const SOURCE_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  exists: { type: 'boolean' },
  artifactTitle: { type: 'string' },
  sourcePages: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    path: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' },
  }, required: ['path', 'title', 'type'] } },
  evidence: { type: 'array', items: EVIDENCE_ITEM },
  canonicalTerms: { type: 'array', items: TERM_ITEM },
  excludedArtifactClaims: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    claim: { type: 'string' }, reason: { type: 'string' },
  }, required: ['claim', 'reason'] } },
  notes: { type: 'string' },
}, required: ['exists', 'artifactTitle', 'sourcePages', 'evidence', 'canonicalTerms', 'excludedArtifactClaims', 'notes'] }

const GROUNDED_TEXT = { type: 'object', additionalProperties: false, properties: {
  text: { type: 'string' },
  evidenceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
  status: { type: 'string', enum: EVIDENCE_STATUS },
}, required: ['text', 'evidenceIds', 'status'] }
const BEAT_ITEM = { type: 'object', additionalProperties: false, properties: {
  heading: GROUNDED_TEXT,
  lines: { type: 'array', items: GROUNDED_TEXT, minItems: 1, maxItems: 4 },
}, required: ['heading', 'lines'] }
const STORY_PROPS = {
  readerOutcome: { type: 'string' },
  corePoint: GROUNDED_TEXT,
  title: GROUNDED_TEXT,
  hook: GROUNDED_TEXT,
  beats: { type: 'array', items: BEAT_ITEM, minItems: MIN_BEATS, maxItems: MAX_BEATS },
  leftOut: { type: 'array', items: { type: 'string' } },
}
const DRAFT_SCHEMA = { type: 'object', additionalProperties: false,
  properties: { ready: { type: 'boolean' }, ...STORY_PROPS, notes: { type: 'string' } },
  required: ['ready', 'readerOutcome', 'corePoint', 'title', 'hook', 'beats', 'leftOut', 'notes'] }
const REVISE_SCHEMA = { type: 'object', additionalProperties: false,
  properties: STORY_PROPS, required: ['readerOutcome', 'corePoint', 'title', 'hook', 'beats', 'leftOut'] }
const ISSUE_ITEM = { type: 'object', additionalProperties: false, properties: {
  where: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' },
}, required: ['where', 'quote', 'why'] }
const REVIEW_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  retell: { type: 'string' },
  mainPoint: { type: 'string' },
  supportingSides: { type: 'array', items: { type: 'string' } },
  storyIssues: { type: 'array', items: ISSUE_ITEM },
  groundingIssues: { type: 'array', items: ISSUE_ITEM },
  verdict: { type: 'string', enum: ['pass', 'fail'] },
}, required: ['retell', 'mainPoint', 'supportingSides', 'storyIssues', 'groundingIssues', 'verdict'] }
const PUBLISH_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  written: { type: 'boolean' }, backupPath: { type: 'string' }, summary: { type: 'string' },
}, required: ['written', 'backupPath', 'summary'] }
const POSTFLIGHT_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  passed: { type: 'boolean' },
  restored: { type: 'boolean' },
  storyExact: { type: 'boolean' },
  agentViewPreserved: { type: 'boolean' },
  violations: { type: 'array', items: { type: 'string' } },
}, required: ['passed', 'restored', 'storyExact', 'agentViewPreserved', 'violations'] }

// ───────────────────────── deterministic checks ─────────────────────────
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean)
const displayedStoryLines = (st) => [
  st.title, st.hook,
  ...(st.beats || []).flatMap(b => [b.heading, ...(b.lines || [])]),
].filter(Boolean)
const storyLines = (st) => [st.corePoint, ...displayedStoryLines(st)].filter(Boolean)
const storyText = (st) => [
  `# ${st.title.text}`, '', st.hook.text,
  ...(st.beats || []).map(b => `\n## ${b.heading.text}\n${(b.lines || []).map(x => x.text).join(' ')}`),
].join('\n')
const checkStory = (st, evidence) => {
  const issues = []
  const ledger = new Map((evidence || []).map(e => [e.id, e]))
  const visibleWords = words(displayedStoryLines(st).map(x => x.text).join(' ')).length
  if (visibleWords > MAX_WORDS) issues.push(`story is ${visibleWords} words; maximum is ${MAX_WORDS}`)
  if (words(st.hook && st.hook.text).length > MAX_HOOK_WORDS) issues.push(`hook exceeds ${MAX_HOOK_WORDS} words`)
  if (words(st.title && st.title.text).length > MAX_TITLE_WORDS) issues.push(`title exceeds ${MAX_TITLE_WORDS} words`)
  if (!st.beats || st.beats.length < MIN_BEATS || st.beats.length > MAX_BEATS) issues.push(`story must have ${MIN_BEATS}–${MAX_BEATS} supporting beats`)

  const seen = new Set()
  for (const line of storyLines(st)) {
    const normalized = String(line.text || '').trim().toLowerCase()
    if (normalized && seen.has(normalized)) issues.push(`repeated displayed text: "${line.text}"`)
    if (normalized) seen.add(normalized)
    const refs = (line.evidenceIds || []).map(id => ledger.get(id)).filter(Boolean)
    const missing = (line.evidenceIds || []).filter(id => !ledger.has(id))
    if (missing.length) issues.push(`"${line.text}" cites unknown evidence: ${missing.join(', ')}`)
    if (!refs.length) issues.push(`"${line.text}" has no valid PKS evidence`)
    const statuses = refs.map(r => r.status)
    if (line.status === 'fact' && statuses.some(x => x !== 'fact')) issues.push(`"${line.text}" promotes non-fact evidence to fact`)
    if (line.status === 'proposal' && !statuses.includes('proposal')) issues.push(`"${line.text}" is labeled proposal without proposal evidence`)
    if (line.status === 'open' && !statuses.includes('open')) issues.push(`"${line.text}" is labeled open without open-question evidence`)
  }
  return { issues, visibleWords, hookWords: words(st.hook && st.hook.text).length, beats: (st.beats || []).length }
}

// ───────────────────────── prompts ─────────────────────────
const READONLY = `You are READ-ONLY. Do NOT write, edit, create, move, or delete any file. Return findings ONLY as structured output.`

const sourcePrompt = () => `${READONLY}
You are the grounding editor for ${artifactName}. Build the ONLY evidence Grimm may use.

SOURCE OF TRUTH:
1. Read ${WIKI_INDEX} first.
2. Read ${INDEX_HTML}, but the existing Agent view is only a map to relevant PKS pages — it is NOT evidence by itself.
3. Completely ignore every prior workflow-owned element: #pks-human-view, #pks-view-switch, #pks-view-style, #pks-view-script, and anything carrying data-pks-owned="artifact-humanize". Those blocks are generated output and can never ground a later run.
4. From the remaining Agent view, collect the exact wiki page titles named in data-src attributes and the Sources section. Resolve them through index.md. Read only those relevant wiki pages plus an explicitly linked entity/concept page when needed to define an essential term.
5. A ledger item is allowed only when a PKS page directly supports it. Put the exact supporting wording in support and its wiki-relative path in sourcePath. Classify it as fact, proposal, or open without promotion.

ABSOLUTE PROHIBITIONS:
- No world knowledge, plausible inference, prior Human-view language, HTML comments, CSS, or visual guesswork as evidence.
- Never expand an acronym, rename jargon, reclassify a system, or invent a friendly substitute unless the PKS directly supports that exact wording.
- If an Agent-view claim lacks PKS support, put it in excludedArtifactClaims. Do not rescue it.
- Canonical terms must preserve PKS spelling and capitalization. Their descriptions must also be PKS-grounded.

If ${INDEX_HTML} is missing, return exists:false with empty collections. Otherwise return exists:true and a compact evidence ledger sufficient for one short story.`

const GRIMM = `You are Grimm, the editorial storyteller. Write for ${audience}. This is an adult audience: clear does not mean childish.

ONE-STORY CONTRACT:
- Choose exactly ONE core point. Everything displayed must advance it.
- Support it with only 2–3 sides. A side can orient, reveal tension, provide decisive evidence, show an implication, or name what remains open. It is not permission to cover another topic.
- The whole visible story must be <=${MAX_WORDS} words. The hook is one sentence and <=${MAX_HOOK_WORDS} words. Prefer much shorter.
- No cast section. Introduce only an essential actor, in context, when the core point cannot be understood without them.
- The Human view is not a prose copy of the Agent view. Deliberately leave details out and record them in leftOut.

LANGUAGE + PROVENANCE:
- Use ONLY the supplied PKS evidence ledger. Every displayed title, heading, hook, and sentence cites evidence IDs.
- Preserve canonical names, acronyms, and jargon exactly. You may explain a term only with the ledger's grounded description. Otherwise keep the real term or cut it.
- Never replace a domain term with a cute or generic label. No "boss team," "computer program," "not a real robot," "fraud-catcher," "scoreboard," or similar paraphrase unless that exact characterization is in the ledger.
- Do not add qualitative or temporal strength — words such as "fast," "slow," "quickly," "always," "only," or "completely" — unless the cited PKS support states that strength directly.
- Never turn a proposal or open question into a fact. Keep each displayed line's status current.
- Plain language comes from short syntax and clean sequencing, not altered terminology or invented analogies.
- Each lines[].text is exactly one displayed sentence.`

const draftPrompt = (source) => `${READONLY}
${GRIMM}

PKS EVIDENCE LEDGER (JSON):
${JSON.stringify(source, null, 2)}

Draft the story. readerOutcome states what the reader should understand or be able to discuss after reading. corePoint is the one sentence every beat supports. title and hook are displayed. beats are the only 2–3 supporting sides. leftOut must name major artifact threads deliberately omitted.

Return ready:false if the ledger cannot support one coherent story without guessing. Otherwise return ready:true.

SELF-CHECK: delete any line that cannot point to its evidence IDs; delete any side that does not advance the single core point; restore every canonical term you paraphrased.`

const reviewPrompt = (story, source, checks, round) => `${READONLY}
You are Gretel, an independent cold reader and grounding editor. The final audience is an intelligent adult, not a child. You know nothing about this project before reading.

First cold-read only the story below. Retell its ONE main point and the 2–3 sides that support it. Flag every place that is confusing, repetitive, patronizing, too detailed, off the main thread, or uses an unexplained term. A term being unfamiliar is NOT permission to rename it: it must be briefly defined from PKS evidence or cut.

Then audit every displayed title, heading, hook, and sentence against the PKS ledger. Do not trust the ledger's self-attestation: reopen every file listed in sourcePages from disk and verify that each cited support passage and evidence statement is actually present or directly supported there. A missing/unreadable page, fabricated support passage, unsupported wording, invented label, changed jargon, reclassified system, causal leap, unsupported qualitative/temporal strength, or proposal/open question presented as fact is a grounding issue.

Pass only when:
- one main point is unmistakable and every side advances it;
- the story is cohesive, short, respectful, and non-repetitive;
- all terminology stays canonical;
- every displayed statement is supported and its fact/proposal/open status is preserved;
- all deterministic checks pass.

REVIEW ROUND: ${round}

STORY:
---
${storyText(story)}
---

STRUCTURED STORY (JSON):
${JSON.stringify(story, null, 2)}

DETERMINISTIC CHECKS (JSON):
${JSON.stringify(checks, null, 2)}

PKS EVIDENCE LEDGER (JSON):
${JSON.stringify(source, null, 2)}`

const revisePrompt = (story, source, checks, review, round) => `${READONLY}
${GRIMM}

Revise the full story after review round ${round}/${maxRevises}.
- Handle every deterministic, story, and grounding issue by cutting, reordering, or rewriting from the same PKS evidence.
- Do not add a new point to repair a gap. If evidence is insufficient, cut the line or side.
- If a canonical term confused Gretel, define it briefly from canonicalTerms or cut it. Never rename it.
- Where the retell got the main point wrong, simplify the spine rather than adding explanation.

CURRENT STORY (JSON):
${JSON.stringify(story, null, 2)}

CHECKS (JSON):
${JSON.stringify(checks, null, 2)}

REVIEW (JSON):
${JSON.stringify(review, null, 2)}

PKS EVIDENCE LEDGER (JSON):
${JSON.stringify(source, null, 2)}

Return the FULL revised story.`

const publishPrompt = (story, checks) => `You may write ${INDEX_HTML} and the temporary backup ${BACKUP_HTML}. Nothing else.

You are publishing the accepted Human view of ${artifactName}.

1. Before editing, copy ${INDEX_HTML} byte-for-byte to ${BACKUP_HTML}.
2. Read ${INDEX_HTML} in full and read ${BRAND}/design.md plus ${BRAND}/design.dark.md.
3. The existing content outside workflow-owned blocks is the Agent view. Preserve it byte-for-byte. Never reformat, rewrap, or reorder it.
4. Add or replace only these owned blocks, each marked data-pks-owned="artifact-humanize":
   - #pks-view-switch — fixed top-right Human / Agent switch, visible in both views.
   - #pks-human-view — title, one-sentence hook, then exactly ${story.beats.length} narrative beats. No cast section and no extra narrative copy.
   - #pks-view-style and #pks-view-script — default Human, persistent switch using localStorage key "pks-view".
5. COPY every story string below EXACTLY. Do not paraphrase, polish, summarize, add transitions, add labels, or invent captions during HTML rendering. Evidence IDs and statuses are not displayed.
6. Render one continuous visual story. Each beat gets one clear takeaway and modest source-grounded visual structure; do not create screenshots, characters, metaphors, or new facts.
7. The only fixed copy you may add is the switch labels and one quiet final line linking to the Agent view for full detail.

ACCEPTED STORY (JSON):
${JSON.stringify(story, null, 2)}

ACCEPTED CHECKS (JSON):
${JSON.stringify(checks, null, 2)}

Return written:true, backupPath:"${BACKUP_HTML}", and a one-line summary.`

const postflightPrompt = (story, backupPath) => `You may write exactly one file only if restoration is required: ${INDEX_HTML}. Otherwise you are read-only.

Audit the published artifact against the backup ${backupPath || BACKUP_HTML}.
1. Confirm every accepted story string appears exactly once inside #pks-human-view and no narrative text was added beyond the permitted fixed footer.
2. Confirm the Human view has no cast and exactly ${story.beats.length} narrative beats.
3. Compare the before/after HTML after excluding #pks-human-view, #pks-view-switch, #pks-view-style, #pks-view-script and data-pks-owned="artifact-humanize" blocks from both. The remaining Agent view must be byte-for-byte identical.
4. Confirm all four current owned blocks carry data-pks-owned="artifact-humanize".

If ANY check fails, immediately restore ${INDEX_HTML} byte-for-byte from the backup before returning. Report passed:false and restored:true. Never try to repair the story in place.

ACCEPTED STORY (JSON):
${JSON.stringify(story, null, 2)}`

// ───────────────────────── Stage 1: GROUND ─────────────────────────
phase('Ground')
const source = await agent(sourcePrompt(), { label: 'ground:pks-ledger', phase: 'Ground', model: workerModel, schema: SOURCE_SCHEMA })
if (!source || source.exists === false) {
  log(`⚠ No deliverable: ${artifactRel} has no index.html. Nothing to humanize.`)
  return { written: false, artifact: artifactRel, note: 'missing deliverable' }
}
if (!source.evidence || !source.evidence.length) {
  log('⚠ No PKS-backed evidence resolved. Publication blocked.')
  return { written: false, artifact: artifactRel, note: 'no PKS-backed evidence', excludedArtifactClaims: source.excludedArtifactClaims || [] }
}
log(`Grounded: ${source.evidence.length} PKS-backed evidence item(s) from ${source.sourcePages.length} page(s); ${source.excludedArtifactClaims.length} unsupported artifact claim(s) excluded.`)

// ───────────────────────── Stage 2: DRAFT ─────────────────────────
phase('Draft')
const draft = await agent(draftPrompt(source), { label: 'grimm:draft', phase: 'Draft', model: workerModel, schema: DRAFT_SCHEMA })
if (!draft || draft.ready === false) {
  log('⚠ PKS evidence could not support one cohesive story without guessing. Publication blocked.')
  return { written: false, artifact: artifactRel, note: 'story not supportable from PKS evidence' }
}
let story = {
  readerOutcome: draft.readerOutcome,
  corePoint: draft.corePoint,
  title: draft.title,
  hook: draft.hook,
  beats: draft.beats || [],
  leftOut: draft.leftOut || [],
}
let checks = checkStory(story, source.evidence)
log(`Draft: "${story.title.text}" — ${checks.visibleWords} words, ${checks.beats} beat(s), ${story.leftOut.length} thread(s) left to Agent view.`)

// ───────────────────────── Stage 3: REVIEW + revise ─────────────────────────
phase('Review')
let review = await agent(reviewPrompt(story, source, checks, 1), { label: 'gretel:review-1', phase: 'Review', model: workerModel, schema: REVIEW_SCHEMA })
let reviews = 1, revises = 0
const passes = () => review && review.verdict === 'pass' && !checks.issues.length && !review.storyIssues.length && !review.groundingIssues.length
log(`Review 1: ${passes() ? 'pass' : 'fail'} — ${checks.issues.length} deterministic, ${review ? review.storyIssues.length : 0} story, ${review ? review.groundingIssues.length : 0} grounding issue(s).`)

while (!passes() && revises < maxRevises && (!budget.total || budget.remaining() > REVISE_EST)) {
  revises++
  const revised = await agent(revisePrompt(story, source, checks, review, revises), { label: `grimm:revise-${revises}`, phase: 'Review', model: workerModel, schema: REVISE_SCHEMA })
  if (revised) story = { ...revised, beats: revised.beats || [], leftOut: revised.leftOut || [] }
  checks = checkStory(story, source.evidence)
  reviews++
  review = await agent(reviewPrompt(story, source, checks, reviews), { label: `gretel:review-${reviews}`, phase: 'Review', model: workerModel, schema: REVIEW_SCHEMA })
  log(`Revise ${revises} → Review ${reviews}: ${passes() ? 'pass' : 'fail'} — ${checks.issues.length} deterministic, ${review ? review.storyIssues.length : 0} story, ${review ? review.groundingIssues.length : 0} grounding issue(s).`)
}

if (!passes()) {
  log('⚠ Story did not pass every gate. index.html remains unchanged.')
  return {
    written: false,
    artifact: artifactRel,
    title: story.title && story.title.text,
    rounds: { reviews, revises },
    note: 'quality gate failed',
    deterministicIssues: checks.issues,
    storyIssues: (review && review.storyIssues) || [],
    groundingIssues: (review && review.groundingIssues) || [],
    excludedArtifactClaims: source.excludedArtifactClaims || [],
  }
}

// ───────────────────────── Stage 4: PUBLISH + postflight ─────────────────────────
phase('Publish')
const published = await agent(publishPrompt(story, checks), { label: 'grimm:publish', phase: 'Publish', model: workerModel, schema: PUBLISH_SCHEMA })
if (!published || !published.written) {
  return { written: false, artifact: artifactRel, note: 'publisher did not write', rounds: { reviews, revises } }
}
const postflight = await agent(postflightPrompt(story, published.backupPath), { label: 'publish:postflight', phase: 'Publish', model: workerModel, schema: POSTFLIGHT_SCHEMA })
if (!postflight || !postflight.passed) {
  log(`⚠ Postflight failed${postflight && postflight.restored ? '; original artifact restored' : ''}.`)
  return {
    written: false,
    artifact: artifactRel,
    note: 'postflight failed',
    restored: (postflight && postflight.restored) || false,
    violations: (postflight && postflight.violations) || ['postflight returned no result'],
  }
}

return {
  written: true,
  artifact: artifactRel,
  title: story.title.text,
  corePoint: story.corePoint.text,
  words: checks.visibleWords,
  beats: checks.beats,
  rounds: { reviews, revises },
  sourcePages: source.sourcePages,
  excludedArtifactClaims: source.excludedArtifactClaims,
  leftOut: story.leftOut,
  summary: published.summary,
}
