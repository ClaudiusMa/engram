# Engram

**A memory for you and your AI.** Save what you read, watch, hear, and think. Your AI files it, connects it to what you already know, and remembers it, so every conversation starts from your own knowledge instead of from zero.

![Engram as a memory upgrade for a human working with AI](assets/engram-overview.png)

## See what's in your head

![The Engram Graph: a map of one person's ideas, people, stances, questions, projects, and sources](assets/engram-graph-demo.png)

*Sample Engram for Mia, who is training for a half-marathon, sleeping better, and writing a short story. Every dot is a page your AI wrote for you. Lines are connections it found. Click a dot to read it.*

Each colour is a kind of page:

| | Kind | What it holds | Example from Mia's Engram |
| --- | --- | --- | --- |
| 🔴 | **Ideas** | Concepts you keep running into | *Deep work*, *Sleep debt*, *Habit stacking* |
| 🔵 | **People & things** | People, places, tools, groups | *Sam (running coach)*, *Lisbon*, *Paper notebook* |
| ⚫ | **Stances** | What you believe, in your words | *Protect the first hour of the day* |
| 🟠 | **Open questions** | Things you are still figuring out | *Does coffee after 2pm hurt my sleep?* |
| 🟢 | **Projects** | What you are working toward | *Half-marathon in spring* |
| ⚪ | **Sources** | Articles, podcasts, books, videos, files you saved | *Podcast: Why We Nap* |
| 🟣 | **My notes** | Your own writing, kept exactly as you wrote it | *Lisbon trip reflections* |

## How it works

1. **Save something.** Give your AI a link, a PDF, a meeting transcript, or a thought: *"Digest this article."*
2. **Your AI files it.** It keeps the original, writes a short page about it, and links it to the ideas, people, and projects already in your Engram. It asks what *you* think and records your take only after you agree.
3. **Ask, and see.** Ask questions and get answers from your own saved knowledge, with links back to where each answer came from. Open **Engram Graph** to see everything at a glance.

Over time your Engram compounds: every new source makes the old ones more useful.

## Things you can say

| You say | Engram does |
| --- | --- |
| "Digest this podcast transcript." | Saves the original, writes a source page, links it, then asks what stood out to you |
| "File this as a note: …" | Saves your words as a note, untouched |
| "What do I know about sleep?" | Answers from your pages, and says which ones |
| "What changed this week?" | Writes a short weekly recap |
| "Check my Engram for loose ends." | Finds stale pages, missing links, and contradictions |
| "Turn this into a one-page visual." | Builds a shareable page from a finished document |

## Get started

You need a computer, about ten minutes, and an AI app that can work with files in a folder (for example Claude, Codex, or Cursor).

1. **Install Node.js** from [nodejs.org](https://nodejs.org/en/download). You only do this once.
2. **Create your Engram.** Open Terminal (on Windows, PowerShell), paste this line, and press Enter:

   ```sh
   npx github:ClaudiusMa/engram init ~/Engram
   ```

   This makes a folder called **Engram** in your home folder.
3. **Open that folder in your AI app** and say: *"Read AGENTS.md and help me get started."*
4. **Save your first thing:** *"Digest this article: (paste a link)"*.
5. **See your map:** on a Mac, double-click **Engram Graph** inside your Engram folder. (Elsewhere, ask your AI to run `npm run graph`.)

## Your knowledge stays yours

- Everything lives in plain files in your own folder. No account and no Engram server.
- What you save is never uploaded by Engram. If you use Git, your knowledge folder is excluded from the shareable part by default.
- Your originals are never changed or deleted. Your own notes and takes are never rewritten with ideas you did not have.
- The files are ordinary Markdown, so you can read them in any notes app, and they outlive any one tool.

## Staying up to date

Engram checks for improvements on its own: when you open **Engram Graph**, and when your AI starts a session. If an update is ready, it tells you and waits. **Nothing is installed until you say OK.**

An update only changes how Engram works. Your notes, sources, and pages are never touched. If you changed one of Engram's own instruction files, your version is kept, and the new one is saved beside it for your AI to merge with you.

Set up Engram before updates existed? Run the step 2 command once more in your Engram folder (`npx github:ClaudiusMa/engram init .`). It adds anything new and leaves your files alone.

<details>
<summary><strong>For builders: how Engram is put together</strong></summary>

### The idea

An LLM should not rediscover your knowledge from raw files every time. Instead it maintains a persistent wiki of plain Markdown: source pages, concept, entity, position, question, and project pages, an index, and a log. `AGENTS.md` routes each request to one workflow in `schema/workflows/`. No database, plugins, or vector search are required.

### Folder layout

```text
Engram/
├── AGENTS.md            # entry point every agent reads
├── Engram Graph.app     # double-click map (macOS)
├── bin/                 # setup, graph, and update tools
├── schema/              # workflows, templates, skills
├── artifact/            # temporary AI-made outputs (private)
└── wiki/main/           # your knowledge (private)
    ├── raw/             # originals, the source of truth
    ├── sources/  notes/  concepts/  entities/
    ├── positions/  questions/  projects/  human-skills/
    ├── index.md
    └── log.md
```

### Page types

- `source`: an annotation of one original in `raw/` (`file:` frontmatter plus a `## Source` embed), with a factual `## What's in this source` and the user's confirmed `## My take`. It never copies the original.
- `note`: user-authored text; the body is the user's voice. Digest requests always become sources, never notes.
- `concept` (idea), `entity` (person or thing), `position` (stance), `question`, `project` (a pointer to an external project, never its content).
- `human-skill`: a private playbook for something the human practices, loaded only through its own intent gate.

### Workflows

Ingest, note, clean transcript, query, lint, recap, artifact, artifact sync, connect project, human skill, and optional ProductLab integration. Each lives in `schema/workflows/`. System edits require showing the change and getting the user's consent first.

### Privacy model

In a default install the `.gitignore` ignores everything, then allows only public structure (`AGENTS.md`, `README.md`, `LICENSE`, `package.json`, `bin/`, `schema/`). `wiki/` and `artifact/` stay local.

### Graph and updates

- `npm run graph` (or the app) scans `wiki/main/` and writes a self-contained page to the system temp folder. `raw/`, `human-skills/`, `index.md`, and `log.md` are left out.
- `node bin/engram-update.mjs check|apply|later` checks GitHub at most about once a day, installs only on request, and records installed file fingerprints in `.engram/installed.json` to tell user edits from untouched files.

### Frontend notes

Markdown stays plain: `[[wikilinks]]` and `![[embeds]]`, no plugin syntax. The initializer ships conservative Obsidian defaults. Hide `raw/`, `index.md`, `log.md`, `artifact/`, and structure files from any graph view.

### Verify

```sh
npm test
```

</details>

## License

MIT
