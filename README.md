# Claude Skills Manager

A local interface for the skills in `~/.claude/skills` — see every skill you have
installed, what state each one is in, and change that state without hand-editing
`settings.json`.

Windows, macOS and Linux. Free, MIT licensed, and no dependencies: the whole app
is Node's standard library, down to the icon.

![The skills list, grouped by what each skill can actually do](https://raw.githubusercontent.com/npd1987/claude-skills-manager/main/docs/screenshot-main.png)

## Install

One command, the same on every platform:

```bash
npx claude-skills-manager
```

That's the whole thing — it downloads, starts, and opens in your browser. Needs
[Node.js](https://nodejs.org) 18 or newer, and nothing else.

Launching it again while it's already running reopens the existing tab rather
than starting a second copy.

**Stopping it.** Use **Quit** in the top right, or just close the tab — the page
checks in while it's open, and the server shuts itself down about 15 seconds
after the last one goes away. It never lingers in the background. Reloading is
safe.

### A shortcut instead of a command

If you would rather launch it from your Start menu, Dock or app launcher,
install it properly first so it has a permanent home:

```bash
npm i -g claude-skills-manager
claude-skills-manager install-shortcut
```

That writes a Start-menu entry on Windows, an app bundle in `~/Applications` on
macOS, and a `.desktop` entry on Linux. Add `--desktop` for a desktop copy too,
and `uninstall-shortcut` removes them again.

### Make it your own

The app can hand you your own copy to change in Claude Code — the sidebar's
**Modify this app** card walks you through it, including whether your version
sits alongside this one or replaces it.

![Choosing whether your copy sits alongside this one or replaces it](https://raw.githubusercontent.com/npd1987/claude-skills-manager/main/docs/screenshot-modify.png)

From a terminal, the same thing is:

```bash
npx claude-skills-manager dev
```

You get a full working copy plus a `CLAUDE.md` explaining the architecture, so
Claude Code can start changing it straight away rather than reading its way in.
See [CONTRIBUTING.md](CONTRIBUTING.md) if you want to send something back.

## Global and project skills

The **Global / Projects** switch at the top of the sidebar chooses between the
two places skills live. It sits above the filter list because it governs it —
switching scope re-computes every count below. Skills that ship with Claude Code
are never listed, because they aren't yours to manage here.

**Global** — `~/.claude/skills`, available in every project. Settings go in
`~/.claude/settings.json`.

**Projects** — skills inside a single folder's `.claude/skills`, which only
exist for Claude Code sessions run there. Cards are grouped by folder, and the
sidebar filters narrow across all folders at once. Settings go in that project's
`.claude/settings.local.json` — the gitignored file — so this app never dirties a
file your repo shares with other people.

Two badges only appear on project skills:

- **project only** — the name exists nowhere else
- **overrides global** — a global skill has the same name, and inside this folder
  the project one wins

Because project settings sit above global ones, setting a project skill to *Auto*
sometimes writes an explicit `"on"` rather than removing the entry — otherwise
the global value would show through. The app handles that for you.

### Which folders it looks in

Every folder you've run a Claude Code session in — it recovers the real paths
from the session records. A folder needs one session, ever; after that any skill
you add there shows up on the next Refresh.

For a folder Claude Code has never opened, use **Add folder** on the count line.
It opens the standard Windows folder picker (a browser can't be given a real
path by dragging, so a picker is the only reliable way). Added folders are
remembered in `data/folders.json`.

**Default Claude mode applies to global skills only.** Project skills are left
alone.

Skills are grouped by how they actually behave:

| Group | Meaning |
| :--- | :--- |
| **Auto** | Claude can decide to load the skill on its own, and `/name` works |
| **Name only** | Claude sees the skill's name but not its full description |
| **Slash only** | Runs only when you type `/name` — Claude never reaches for it |
| **Off** | Disabled entirely; the files stay on disk |

## The four settings

The buttons on each card write to `skillOverrides` in `~/.claude/settings.json`.
They carry the same four names as the sidebar, so a skill's button and its
section always agree:

| Button | Written as | Notes |
| :--- | :--- | :--- |
| **Auto** | *(no entry)* | Claude's default, so this removes the override |
| **Name only** | `"name-only"` | |
| **Slash only** | `"user-invocable-only"` | |
| **Off** | `"off"` | |

Buttons that a skill's own frontmatter rules out are **struck through and
disabled**, with a tooltip saying why. For a skill with
`disable-model-invocation: true` that's *Auto* and *Name only* — they'd behave
identically to *Slash only*, so offering them as real choices would be a lie.
Such a skill shows **Slash only** as its selected button even when it has no
override at all, because that is what it actually does.

### Sorting

The **Sort** control sits at the right of the count line: **Name (A–Z)**,
**Newest installed**, **Oldest installed**, or **Recently changed**. On the All
skills page it sorts *within* each section, so the grouping still reads first.
Your choice is remembered between sessions.

Install dates come from when a skill's folder appeared in `~/.claude/skills`, so
a skill copied in from elsewhere dates from the copy rather than from when it was
first written. Each card shows its date under the description.

### Descriptions and paths

Every view has a description folded away on the count line — *45 of 45 skills ·
**What this app does***. Click to expand it; it slides open and holds the
explanation, when to reach for that setting, and the folders involved
(**Skills folder** and **Settings file**, each with an *Open* button that reveals
it in Explorer). The Removed view shows the trash folder instead.

### Cards stay where you clicked them

Changing a setting saves immediately, but the card does **not** jump to its new
section. It stays put, shows the new setting, and picks up a blue
**moves to Off** tag telling you where it will land. The sidebar counts update
straight away, so the new grouping is visible there at once.

Press **Refresh** whenever you want the list itself regrouped. Switching views
regroups too.

### Undo and redo

**↶ Undo** and **Redo ↷** sit in the top bar — `Ctrl+Z` and `Ctrl+Y` also work.
Hovering either one tells you exactly what it will do, e.g.
*Undo: tdd: Slash only → Off*.

They cover setting changes, Default Claude mode, orphan cleanup, and removals —
undoing a removal puts the folder back *and* restores the setting it had. The
history survives a page reload and is cleared when you close the tab.

The single exception is **Delete forever** in the Removed view. That one really
is permanent, and the dialog says so; using it clears any history entries that
referred to the deleted folder.

### Two reasons a skill is slash-only

The difference matters:

1. **Your setting here** — changeable any time from this app.
2. **The skill's own frontmatter** — `disable-model-invocation: true` inside its
   `SKILL.md`. Cards showing a **locked to /** tag are in this category, and
   their *Auto* and *Name only* buttons are struck through: the skill's author
   ruled those out, and changing it means editing the `SKILL.md`.

The sidebar counts tell you how many of yours fall into each category.

## Default Claude mode

The sidebar switch turns every skill off in one move, for when you want plain
out-of-the-box Claude. Your per-skill settings are snapshotted to
`data/snapshot.json` first, and the panel then reads **Default Claude mode is
on**.

There are two equally good ways back, and both restore every skill to the exact
setting it had:

- **Bring my skills back** — the sidebar button.
- **Undo** — `Ctrl+Z`, or the button in the top bar.

They are the same operation, so they stay in step: undoing the restore puts you
back in Default Claude mode, snapshot and all, and redo works from either
direction. Both the settings and the snapshot are written by one request, which
is what keeps the sidebar switch from ever disagreeing with the skills
themselves.

## Removing skills

**Remove** moves a skill's folder to `~/.claude/skills-trash/` — it is never
unlinked. Restore it from **Removed** in the sidebar, or delete it for good from
there once you're sure.

If you only want Claude to stop using a skill, use **Off** instead. It keeps the
skill exactly where it is.

## Safety

- Every write to `settings.json` copies the old file to `~/.claude/backups/`
  first (the last 40 are kept), then writes atomically via a temp file + rename.
- If `settings.json` ever contains invalid JSON, the app refuses to write and
  tells you, rather than replacing a file it could not read.
- The server binds to `127.0.0.1` only and requires a random per-run token, so no
  other page or process on the machine can drive it.

## Restart Claude Code after changing settings

Claude Code reads `skillOverrides` when a session starts. Changes here apply to
your **next** session.

## Layout

```
server.js            HTTP server + JSON API
bin/                 the command-line entry point
lib/skills.js        scans both scopes, resolves effective state
lib/projects.js      finds project folders, remembers added ones
lib/settings.js      reads/writes skillOverrides, backups, atomic writes
lib/frontmatter.js   SKILL.md frontmatter parser
lib/paths.js         every path the app touches
lib/platform.js      every Windows/macOS/Linux difference
lib/shortcut.js      desktop shortcuts on the three platforms
lib/fork.js          making and managing your own copy
lib/app-info.js      what this copy is called, and how it was installed
public/              the interface
tools/make-icon.js   draws assets/icon.{ico,png,icns}
launch.vbs           windowless launcher used by the Windows shortcut
install-shortcut.ps1 creates/removes the Start menu shortcut
```

Your settings and folder list live outside the app, in
`~/.claude/skills-manager/`, so they survive an update:

```
snapshot.json        created only while Default Claude mode is on
folders.json         folders you added by hand
sessions/            one file per installed copy, recording the live instance
```

[CLAUDE.md](CLAUDE.md) goes further — the invariants a change must not break,
and how to test one.
