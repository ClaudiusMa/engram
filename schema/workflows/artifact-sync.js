export const meta = {
  name: 'artifact-sync',
  description: "Reconcile an Engram artifact or an explicitly requested external-project artifact (index.html primary, populated Human/ as supplement) against Engram knowledge added since the last sync; write ONE dated report into Human/. Incremental by default; proposes, never applies.",
  phases: [
    { title: 'Scope',              detail: 'grep-first log read; watermark + cumulative ledger from latest report; gate by mode (or forced pages)', model: 'sonnet' },
    { title: 'Reconcile & Report', detail: 'small delta (≤4 pages): ONE agent reads surfaces + pages, self-checks, writes the report', model: 'sonnet' },
    { title: 'Claims',             detail: 'large delta: read index.html + Human/ once → compact claims index', model: 'sonnet' },
    { title: 'Reconcile',          detail: 'large delta: batched subagents diff pages vs passed claims', model: 'sonnet' },
    { title: 'Verify',             detail: 'large delta: one subagent per page with contradicts/drift; refute those only', model: 'sonnet' },
    { title: 'Synthesize',         detail: 'large delta: merge survivors; write the single report', model: 'sonnet' },
  ],
}

// ───────────────────────── args ─────────────────────────
// { pksRoot, artifactPath, today,
//   mode: 'incremental'|'latest'|'backfill',   // required UNLESS preselectedPages is given (dispatcher sets it)
//   since?: 'YYYY-MM-DD',                       // optional explicit date floor
//   preselectedPages?: [{path,title}],          // force exactly these pages (scope still derives watermark/ledger)
//   maxPages? }
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
for (const k of ['pksRoot', 'artifactPath', 'today']) {
  if (!A[k]) throw new Error(`artifact-sync: missing required arg "${k}". Invoke with { pksRoot, artifactPath, today, mode }.`)
}
const forcePages = Array.isArray(A.preselectedPages) ? A.preselectedPages : []
if (!forcePages.length && !A.mode) throw new Error(`artifact-sync: "mode" required (incremental|latest|backfill) unless preselectedPages is given. The dispatcher asks latest-vs-backfill when no prior report exists.`)
if (A.mode && !['incremental', 'latest', 'backfill'].includes(A.mode)) throw new Error(`artifact-sync: bad mode "${A.mode}".`)
const pksRoot = A.pksRoot, artifactTarget = A.artifactPath, today = A.today, since = A.since || null
const mode = forcePages.length ? 'preselected' : A.mode
const ART = artifactTarget.startsWith('/') ? artifactTarget : `${pksRoot}/${artifactTarget}`
const HUMAN = `${ART}/Human`, WIKI = `${pksRoot}/wiki/main`
const INDEX_HTML = `${ART}/index.html`
const artifactName = ART.split('/').filter(Boolean).pop()
const artifactLabel = artifactTarget.startsWith('/') ? artifactName : artifactTarget
const reportPath = `${HUMAN}/knowledge-sync-${today}.md`

const SMALL_MAX = 4, BATCH_SIZE = 4, PER_PAGE_EST = 15000, HARD_MAX_PAGES = A.maxPages || 45
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r }

// ───────────────────────── schemas ─────────────────────────
const SCOPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    watermark:    { type:'string' },
    syncedThrough:{ type:'string' },
    artifactScope:{ type:'string' },
    surfaces: { type:'object', additionalProperties:false,
      properties:{ deliverable:{type:'boolean'}, human:{type:'boolean'} }, required:['deliverable','human'] },
    priorLedger: { type:'array', items:{type:'string'} },
    fanOut: { type:'array', items:{ type:'object', additionalProperties:false,
      properties:{ path:{type:'string'}, title:{type:'string'},
        type:{type:'string', enum:['source','note','concept','entity','position','question']},
        reason:{type:'string', enum:['new-since-watermark','changed-since-watermark','latest-date','backfill','since-date','preselected']} },
      required:['path','title','type','reason'] } },
    inScopeCount:{ type:'number' }, skipped:{ type:'array', items:{type:'string'} },
    priorReports:{ type:'array', items:{type:'string'} }, notes:{ type:'string' },
  },
  required:['watermark','syncedThrough','artifactScope','surfaces','priorLedger','fanOut','inScopeCount','skipped','priorReports','notes'],
}
const DELTA_PROPS = {
  kind:{type:'string', enum:['promotes','resolves','contradicts','drift','adds']},
  surface:{type:'string', enum:['deliverable','human','none']},
  anchor:{type:'string'}, proposal:{type:'string'},
  evidence:{type:'string'}, sourceTrace:{type:'string'}, tension:{type:'string'},
  whyMaterial:{type:'string'},
}
const CLAIMS_SCHEMA = { type:'object', additionalProperties:false, properties:{
  claims:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{
    id:{type:'string'}, surface:{type:'string', enum:['deliverable','human']},
    anchor:{type:'string'}, claim:{type:'string'}, citation:{type:'string'},
    citesPages:{type:'array', items:{type:'string'}} },
    required:['id','surface','anchor','claim','citation','citesPages'] } } }, required:['claims'] }
const RECONCILE_BATCH_SCHEMA = { type:'object', additionalProperties:false, properties:{
  pages:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{
    page:{type:'string'},
    deltas:{ type:'array', items:{ type:'object', additionalProperties:false, properties:DELTA_PROPS, required:['kind','surface','proposal','evidence','sourceTrace'] } },
    noted:{ type:'array', items:{type:'string'} },
  }, required:['page','deltas'] } } }, required:['pages'] }
const VERIFY_PAGE_SCHEMA = { type:'object', additionalProperties:false, properties:{
  survivingDeltas:{ type:'array', items:{ type:'object', additionalProperties:false, properties:DELTA_PROPS, required:['kind','surface','proposal','evidence','sourceTrace'] } } }, required:['survivingDeltas'] }
const REPORT_SCHEMA = { type:'object', additionalProperties:false, properties:{
  reportPath:{type:'string'}, written:{type:'boolean'}, deltaCount:{type:'number'}, summary:{type:'string'} },
  required:['reportPath','written','deltaCount','summary'] }

// ───────────────────────── prompts ─────────────────────────
const READONLY = `You are READ-ONLY. Do NOT write, edit, create, move, or delete any file. Return findings ONLY as structured output.`

const KINDS = `promotes (a cited assumption/open item now supported) · resolves (a cited open question answered) · contradicts (the page challenges what the artifact currently claims — FLAG, no overwrite) · drift (a Human/ entry no longer matches its OWN cited source — human surface only — FLAG) · adds (in-scope knowledge the artifact doesn't cover AND that clears the materiality bar; if it conflicts with another source, keep kind=adds + fill 'tension').
Every delta carries: surface ('deliverable' for index.html, 'human' for a Human/ file, 'none' for adds with no anchor), anchor ("index.html § <section>" or "<file>.md › <entry>", or "new"), a verbatim evidence quote, and sourceTrace = the Engram page path. A surviving add ALSO carries whyMaterial: one line naming the artifact gap or claim it serves.`

const MATERIALITY = `MATERIALITY BAR (adds only — the other kinds anchor to existing artifact claims and are material by construction): the artifact is a curated deliverable with an editorial line, NOT a mirror of the wiki. Propose an add ONLY if it would materially change what the artifact tells its reader — it fills a gap the artifact's own structure implies (a TODO/open section, a question it poses), or directly strengthens/updates/corrects one of the artifact's core claims. Topical adjacency is NOT material. When unsure, do not propose — demote to a ONE-LINE noted mention instead.`

const gatingClause = forcePages.length
  ? `FORCED SCOPE: ignore increment gating. Set fanOut to EXACTLY these pages (reason='preselected'); set skipped=[]. Still derive watermark, priorLedger, syncedThrough, artifactScope, surfaces as instructed above:\n${JSON.stringify(forcePages, null, 2)}`
  : `Gating mode: ${mode}${since ? ` (since=${since})` : ''}.

The unit of a delta is a knowledge INCREMENT (a log.md operation entry), NOT a single page. One ingest's delta spans EVERY page that entry Created/Updated — the source/note AND any concept/entity/question page it touched. Capture the full ripple, never just the source page.

Select increments by the [YYYY-MM-DD] in their headings:
- incremental → every increment dated ON OR AFTER the watermark (INCLUSIVE — the boundary day is re-examined, not assumed done). A prior sync can land mid-day and stamp the whole watermark day "Synced through" while only PART of that day was reconciled; never assume the entire watermark day is covered. Increments already reconciled drop out via the ledger subtraction below, so re-including the watermark day is safe (no double-work).
- latest → the increment(s) on the single MOST-RECENT log date.
- backfill → all increments (treat the whole history as the increment set).
- since set → increments dated on/after ${since}.

For each selected increment, judge RELEVANCE to this artifact: relevant if it touches a page within the artifact's topical scope (artifactScope) OR a page already in priorLedger. Skip irrelevant increments wholesale (e.g. an unrelated ingest) and name them in 'skipped'.

For each RELEVANT increment, fan out over ALL pages it Created/Updated — sources, notes, AND the concept/entity/question pages it changed — so a multi-page delta is fully captured. Then subtract pages already in priorLedger UNLESS the page was Created/Updated again by an increment on or after the watermark — those re-touched pages stay in scope. This ledger subtraction is the ONLY thing that keeps the already-synced part of the watermark day out of scope: a page on the watermark day is in scope iff (a) it is NOT in priorLedger, or (b) it changed again on/after the watermark. Within a relevant increment, drop only a page plainly unrelated to the artifact (note it in 'skipped').`

const scopePrompt = () => `${READONLY}
Derive what this sync run must reconcile. Use TARGETED reads only — never read a large file end-to-end when a grep + line-range read suffices.

1. Watermark + ledger. List ${HUMAN}/knowledge-sync-*.md (the folder may not exist — then there are no prior reports). Read ONLY the latest report (lexicographically last filename; the date prefix + optional -runN suffix make that ordering correct). watermark = its "Synced through:" date ("" if no reports). priorLedger = the page paths in its "## Ledger" section. If that ledger is NOT marked "(cumulative)" and older reports exist, also read the Ledger sections of the older reports and union all their page lists into priorLedger (one-time legacy migration; new reports are cumulative).

2. Artifact surfaces + topical scope. Check which claims surfaces exist and are non-empty: deliverable = ${INDEX_HTML} exists; human = ${HUMAN}/ contains at least one canonical *.md OTHER than knowledge-sync-*. Derive artifactScope (1-2 lines naming the artifact's topic) cheaply: grep the <title>/<h1>/<h2> tags out of ${INDEX_HTML} (e.g. grep -o -E '<title>[^<]*|<h[12][^>]*>[^<]{0,100}' | head -40) and read ${HUMAN}/brief.md ONLY if it exists. Do NOT read index.html in full.

3. Log increments. Run: grep -n '^## \\[' ${WIKI}/log.md — that lists EVERY entry heading with its date and line number, immune to file ordering. syncedThrough = the most-recent date across those headings (the new watermark to record). Select headings per the gating below, then read ONLY the selected entries' bodies by line range (sed -n 'A,Bp' or offset/limit reads; in backfill mode that may be most of the log — expected there, never elsewhere). Entry bodies list the pages each increment Created/Updated — that defines the fan-out. Do NOT read ${WIKI}/index.md.

${gatingClause}

Emit: watermark, syncedThrough, artifactScope, surfaces, priorLedger, fanOut (paths relative to ${WIKI} incl. subfolder + ".md"; type from the subfolder), inScopeCount, skipped, priorReports (filenames), notes.`

const surfaceReadList = (surf) => [
  surf.deliverable ? `- PRIMARY — ${INDEX_HTML}: the deliverable is this artifact's source of truth. Read it in full; its sections and claims are the dedup + contradiction surface, and deltas anchor to its sections.` : null,
  surf.human ? `- SUPPLEMENT — every canonical *.md in ${HUMAN}/ (brief, decisions, open_questions, reflections, onboarding; SKIP knowledge-sync-*): entries cite Engram pages via "Source:" lines — use that citation join for promotes/resolves/drift.` : null,
].filter(Boolean).join('\n')

const reportRules = (surf, watermark, syncedThrough, inScopeCount, skipped, reconciledCount, cumulativeLedger) => {
  const surfLine = [surf.deliverable ? 'index.html (primary)' : null, surf.human ? 'Human/ canonical files (supplement)' : null].filter(Boolean).join(' + ')
  return `Structure of ${reportPath} (markdown; PROPOSAL only):
# Knowledge Sync — ${today}
- Artifact: ${artifactLabel}
- Mode: ${mode}${since ? ` (since ${since})` : ''}. **Synced through: ${syncedThrough}** (prior watermark: ${watermark || 'none — first sync'}).
- Reconciled against: ${surfLine}.
- One-line summary of the delta this run.

## Coverage
"${inScopeCount} in scope; ${reconciledCount} reconciled this run (mode=${mode}); ${skipped.length} skipped as adjacency-only." Deliberate scoping, not truncation.

## Proposed changes
Order: Promotes, Resolves, Contradicts/Drift (⚠), Adds (⚠ on any with 'tension'). Each item: the anchor ("index.html § <section>" or "<file>.md › <entry>", or "new" for adds), the proposed change, the verbatim evidence quote, the Engram source page. Adds also carry their whyMaterial line.

## Reconciled — no surviving delta
List reconciled pages that produced nothing.

## Noted, not proposed
In-scope adds dropped by the materiality bar — ONE line each (Engram page + gist), no evidence blocks. Omit this section entirely if there are none.

## Ledger (cumulative)
- Synced through: ${syncedThrough}
- Pages reconciled (cumulative): list EXACTLY these paths, one bullet each:
${cumulativeLedger.map(p => `  - ${p}`).join('\n')}

## Footer
"Proposed, not applied. Fold approved items into the artifact by hand — index.html via the artifact's own agent/session, Human/ files directly — then rebuild/redeploy the deliverable as needed."`
}

const smallPrompt = (fo, scope, rules) => `You may write EXACTLY ONE file: ${reportPath} (create the Human/ folder if it doesn't exist). Nothing else — do NOT edit canonical Human/ files, ${ART}/Agents/, or the deliverable. Read-only except that one report.

Reconcile ${fo.length} Engram page(s) against the ${artifactName} artifact, then write the sync report yourself.

Artifact scope: ${scope}

Claims surfaces — read in full, ONCE:
${surfaceReadList(surfaces)}

Engram pages to reconcile — read in full (only these):
${fo.map(p => `- ${WIKI}/${p.path}  (title "${p.title}", ${p.type})`).join('\n')}

Classify deltas per page: ${KINDS}

SELF-CHECK every delta — you are the only checker on this run:
- grounded in a verbatim quote actually present in the Engram page;
- in scope for this artifact;
- non-duplicate: NEVER propose adding what index.html or Human/ already states;
- for contradicts/drift, actively try to refute yourself first — is it a REAL conflict with what the artifact says, or merely new detail? New detail does NOT count. Keep only what survives your own refutation.

${MATERIALITY}
Adds that fail the bar go in the report's "Noted, not proposed" section as one-liners (Engram page + gist) — never as full proposals.

Then write the report. ${rules}
Return reportPath, written:true, deltaCount (deltas that survived), one-line summary.`

const claimsPrompt = (fo) => `${READONLY}
Build the ${artifactName} artifact's claims index. Read ONCE:
${surfaceReadList(surfaces)}

Emit one claim per distinct assertion the artifact makes (compact — faithful 1-2 lines each, with its anchor). For human-surface claims, citation = the entry's "Source:" line ("" for deliverable claims, which carry no citations). citesPages = the paths from this list that the citation refers to (empty if none):
${fo.map(p => `- ${p.path}  ("${p.title}")`).join('\n')}`

const reconcileBatchPrompt = (batch, claimsForBatch, compactIndex) => `${READONLY}
Reconcile a SMALL BATCH of Engram pages against the artifact's claims. Do NOT read index.html or Human/ files — everything you need is below.

Pages to read IN FULL (only these):
${batch.map(p => `- ${WIKI}/${p.path}  (title "${p.title}", ${p.type})`).join('\n')}

Claims whose citations point at these pages (diff against these for promotes/resolves/drift):
${JSON.stringify(claimsForBatch, null, 2)}

Compact index of ALL artifact claims (dedup + contradiction surface — never re-add what's here):
${compactIndex}

Classify deltas per page: ${KINDS}
${MATERIALITY}
SELF-CHECK adds/promotes/resolves (no downstream verifier for those): include only if grounded in a verbatim quote, in scope for the ${artifactName} artifact, and non-duplicate. Drop weak ones yourself. Do NOT drop contradicts/drift — a verifier checks those.
Adds that fail the materiality bar: return each in that page's 'noted' array as a one-line gist (the page path is prefixed for you). Never return them as deltas.`

const verifyPagePrompt = (pagePath, cd) => `${READONLY}
Adversarially verify the contradicts/drift deltas for ONE page. Read it ONCE: ${WIKI}/${pagePath}. Try to REFUTE each; default to dropping if not clearly grounded.
Deltas (JSON):
${JSON.stringify(cd, null, 2)}
For each: evidence actually present & supporting? real conflict vs merely new detail (then it does NOT survive)? kind right? Return survivingDeltas only.`

const synthPrompt = (survivors, noted, fo, rules) => `You may write EXACTLY ONE file: ${reportPath} (create the Human/ folder if it doesn't exist). Nothing else. Do NOT edit canonical Human/ files, ${ART}/Agents/, or the deliverable. Read-only except that one report.

Write the reconciliation report from the verified deltas — faithful transcription into the structure below, no new analysis.
Verified surviving deltas (JSON): ${JSON.stringify(survivors, null, 2)}
Noted, not proposed (one-liners, JSON): ${JSON.stringify(noted, null, 2)}
Pages reconciled this run (JSON): ${JSON.stringify(fo, null, 2)}

${rules}
Return reportPath, written:true, deltaCount=${survivors.length}, one-line summary.`

// ───────────────────────── Stage 1: SCOPE (always runs — cheap: grep-first, latest report only) ─────────────────────────
phase('Scope')
const s = await agent(scopePrompt(), { label: 'scope', phase: 'Scope', model: 'sonnet', schema: SCOPE_SCHEMA })
let fanOut    = (s && s.fanOut) || []
const surfaces      = (s && s.surfaces) || { deliverable: false, human: false }
const artifactScope = (s && s.artifactScope) || artifactName
const priorLedger   = (s && s.priorLedger) || []
const skipped       = (s && s.skipped) || []
const inScopeCount  = (s && s.inScopeCount) || fanOut.length
const priorReports  = (s && s.priorReports) || []
const watermark     = (s && s.watermark) || ''
const syncedThrough = (s && s.syncedThrough) || today
log(`Scope[${mode}]: watermark="${watermark || 'none'}", ${fanOut.length} to reconcile, ${skipped.length} skipped, surfaces={deliverable:${surfaces.deliverable}, human:${surfaces.human}}, ledger=${priorLedger.length} pages, ${priorReports.length} prior reports.`)

if (!fanOut.length) {
  log(`Nothing to reconcile in mode=${mode} (watermark="${watermark || 'none'}"). No report written.`)
  return { reportPath: null, written: false, deltaCount: 0, reconciled: 0, note: `up-to-date (mode=${mode})` }
}
if (!surfaces.deliverable && !surfaces.human) {
  log(`⚠ No claims surface: ${ART} has no index.html and no populated Human/. Nothing to reconcile against — no report written.`)
  return { reportPath: null, written: false, deltaCount: 0, reconciled: 0, note: 'no claims surface (no index.html, empty/missing Human/)' }
}
let cap = HARD_MAX_PAGES
if (budget.total) cap = Math.min(cap, Math.max(BATCH_SIZE, Math.floor(budget.remaining() / PER_PAGE_EST)))
if (fanOut.length > cap) { log(`⚠ Capping ${fanOut.length}→${cap}. Deferred: ${fanOut.slice(cap).map(p => p.path).join(', ')}`); fanOut = fanOut.slice(0, cap) }

const cumulativeLedger = Array.from(new Set([...priorLedger, ...fanOut.map(p => p.path)]))
const rules = reportRules(surfaces, watermark, syncedThrough, inScopeCount, skipped, fanOut.length, cumulativeLedger)

// ───────────────────────── Small delta (routine): ONE agent reconciles + writes the report ─────────────────────────
if (fanOut.length <= SMALL_MAX) {
  phase('Reconcile & Report')
  const out = await agent(smallPrompt(fanOut, artifactScope, rules), { label: 'reconcile+report', phase: 'Reconcile & Report', model: 'sonnet', schema: REPORT_SCHEMA })
  return { reportPath, written: (out && out.written) || false, deltaCount: (out && out.deltaCount) || 0, reconciled: fanOut.length, mode, syncedThrough, summary: (out && out.summary) || '' }
}

// ───────────────────────── Large delta / backfill: Claims → Reconcile (batched) → Verify (CD only) → Synthesize ─────────────────────────
phase('Claims')
const c = await agent(claimsPrompt(fanOut), { label: 'claims', phase: 'Claims', model: 'sonnet', schema: CLAIMS_SCHEMA })
const claims = (c && c.claims) || []
const compactIndex = claims.length ? claims.map(cl => `[${cl.id}] (${cl.surface} — ${cl.anchor}) ${cl.claim}${cl.citation ? ` — cites: ${cl.citation}` : ''}`).join('\n') : '(none)'
log(`Claims: ${claims.length} extracted (${claims.filter(cl => cl.surface === 'deliverable').length} deliverable, ${claims.filter(cl => cl.surface === 'human').length} human).`)

phase('Reconcile')
const perBatch = await pipeline(
  chunk(fanOut, BATCH_SIZE),
  (batch, _b, idx) => {
    const paths = new Set(batch.map(p => p.path))
    const claimsForBatch = claims.filter(cl => (cl.citesPages || []).some(p => paths.has(p)))
    return agent(reconcileBatchPrompt(batch, claimsForBatch, compactIndex), { label: `reconcile:batch${idx + 1}`, phase: 'Reconcile', model: 'sonnet', schema: RECONCILE_BATCH_SCHEMA })
  },
  async (recon) => {
    const pages = (recon && recon.pages) || []
    const cdPages = pages.filter(p => (p.deltas || []).some(d => d.kind === 'contradicts' || d.kind === 'drift'))
    const verified = {}
    if (cdPages.length) {
      const vr = await parallel(cdPages.map(p => () => {
        const cd = p.deltas.filter(d => d.kind === 'contradicts' || d.kind === 'drift')
        return agent(verifyPagePrompt(p.page, cd), { label: `verify:${p.page}`, phase: 'Verify', model: 'sonnet', schema: VERIFY_PAGE_SCHEMA }).then(v => ({ page: p.page, surviving: (v && v.survivingDeltas) || [] }))
      }))
      for (const r of vr.filter(Boolean)) verified[r.page] = r.surviving
    }
    const out = [], noted = []
    for (const p of pages) {
      for (const d of (p.deltas || [])) if (d.kind !== 'contradicts' && d.kind !== 'drift') out.push({ ...d, page: p.page })
      for (const d of (verified[p.page] || [])) out.push({ ...d, page: p.page })
      for (const n of (p.noted || [])) noted.push(`${p.page} — ${n}`)
    }
    return { deltas: out, noted }
  }
)
const batchOut = perBatch.filter(Boolean)
const survivors = batchOut.flatMap(r => r.deltas || [])
const notedLines = batchOut.flatMap(r => r.noted || [])
log(`Reconcile+Verify: ${survivors.length} surviving deltas; ${notedLines.length} noted (not proposed).`)

phase('Synthesize')
const out = await agent(synthPrompt(survivors, notedLines, fanOut, rules), { label: 'synthesize', phase: 'Synthesize', model: 'sonnet', schema: REPORT_SCHEMA })
return { reportPath, written: (out && out.written) || false, deltaCount: survivors.length, reconciled: fanOut.length, mode, syncedThrough, summary: (out && out.summary) || '' }
