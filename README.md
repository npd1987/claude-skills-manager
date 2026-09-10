# Claude Skills Manager

A small web app for managing the skills in `~/.claude/skills`. It runs on your
own machine and opens in your browser: see every skill you have installed, what
state each one is in, and change that state without hand-editing `settings.json`.

Nothing is hosted anywhere and nothing is uploaded. The server runs on
`127.0.0.1` for as long as you have the page open, reads and writes files in your
own `~/.claude` folder, and stops on its own once you close the tab.

Windows, macOS and Linux. Free, MIT licensed, and no dependencies: the whole app
is Node's standard library, down to the icon.

![The skills list, grouped by what each skill can actually do](https://raw.githubusercontent.com/npd1987/claude-skills-manager/main/docs/screenshot-main.png)

## Install

One command, the same on every platform:

```bash
npx claude-skills-manager
```

That is the whole thing. It downloads, starts, and opens in your browser. Needs
[Node.js](https://nodejs.org) 18 or newer, and nothing else.

Launching it again while it's already running reopens the existing tab rather
than starting a second copy.

**Stopping it.** Use **Quit** in the top right, or just close the tab. Quit
stops it at once. Closing the tab takes a little longer: the page says goodbye on
its way out, and the server then stops at its next check, which is within about
half a minute. It never lingers in the background, and reloading is safe.

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

### How it opens

By default the app opens in a tab of whatever browser you already have running.
**Settings** has a **How it opens** section with three choices:

| Choice | What you get |
| :--- | :--- |
| **A tab** | The default, and the only one that works whatever your browser is |
| **Its own window** | A browser window of its own, with the address bar and tabs |
| **An app window** | No address bar and no tabs, so it looks like a desktop app |

The last two mean the app has to start your browser itself rather than handing
the address to your system, so it works out which browser is your default and
starts that. A choice your browser cannot deliver is **struck through with the
reason** rather than hidden, and the section names the browser it found, so a
missing option reads as a fact about your machine rather than something the app
decided.

**An app window remembers its shape.** It reopens at the size and position you
left it, and if you left it maximized it opens maximized: the real thing your
window manager does, not a window stretched to fill the screen, which is a
different state and looks it. On macOS that asks for accessibility permission
the first time, and on Linux it needs `wmctrl`.

### Light or dark

**Settings** has an **Appearance** choice: follow your system, or pin light or
dark. Both are drawn properly rather than one being the other with the colours
inverted, so nothing goes faint in either.

### Make it your own

The app can hand you your own copy to change in Claude Code. **Settings** in the
sidebar has a **Modify this app** section that walks you through it, including
whether your version sits alongside this one or replaces it.

![Choosing whether your copy sits alongside this one or replaces it](https://raw.githubusercontent.com/npd1987/claude-skills-manager/main/docs/screenshot-modify.png)

From a terminal, the same thing is:

```bash
npx claude-skills-manager dev
```

You get a full working copy plus a `CLAUDE.md` explaining the architecture, so
Claude Code can start changing it straight away rather than reading its way in.
See [CONTRIBUTING.md](CONTRIBUTING.md) if you want to send something back.

## Updates

Nothing updates itself. **Settings** shows the version you are running and, if
you ask it to, whether a newer one has been published.

**The check is off until you say yes.** The first time you open the app it asks
once, in the sidebar, whether it may check for new versions. Until you answer,
nothing leaves your machine. Saying yes means one check a day at most: npm for
the latest version number, and GitHub for that release's notes when there is a
newer version to describe. Neither carries anything about you, your skills or
your settings, and **Check now** works either way. You can change your mind in
Settings at any time.

**What's new** in Settings expands to show the release notes for the version
being offered, taken from its GitHub release. Notes only appear for versions
published as a GitHub release; a tag on its own has nothing to show.

**How you update depends on how you installed it**, and Settings says which case
you are in and gives you the exact command:

| Installed with | To update |
| :--- | :--- |
| `npx` | Start it with `npx claude-skills-manager@latest`. A plain `npx` can reuse a cached copy. |
| `npm i -g` | `npm i -g claude-skills-manager@latest`, or press the button in Settings. |
| a git clone | `git -C "<folder>" pull`. Settings gives you this with the folder already filled in, so it can be pasted into any terminal. |

The button only appears for a global npm install, and only when the app has
checked in advance that it would actually work: npm has to be on its `PATH`, and
npm's global folder has to be one your account can write to. When either is not
true you get a plain sentence saying so instead of a button that fails. The
command is on screen either way, so you never have to use the button.

Pressing it closes the app and hands the install to a separate process, because
npm is about to replace the folder the app is running out of. Open the app again
a moment later and it tells you how it went, including exactly what npm said if
it did not work.

**Copies update separately.** If you have made your own copy through **Modify
this app**, the two are independent installs in different folders. Each window
only ever reports on, and can only ever change, the copy it is running from.
Updating the published app cannot touch your copy, and there is no button in a
copy's window at all, because once you have started changing it, what to take
from a new version is your decision rather than the app's.

**Going back.** Settings lists the versions this install has been through. If a
new version turns out worse than the one before it, put the old one back the same
way you updated. Published versions stay published, so going back is an ordinary
install of an older number. Your skills and settings are not affected either way:
they live in your own `~/.claude` folder, not in the app.

## Global and project skills

The **Global / Projects** switch at the top of the sidebar chooses between the
two places skills live. It sits above the filter list because it governs it:
switching scope re-computes every count below. Skills that ship with Claude Code
are never listed, because they aren't yours to manage here.

**Global** is `~/.claude/skills`, available in every project. Settings go in
`~/.claude/settings.json`.

**Projects** are skills inside a single folder's `.claude/skills`, which only
exist for Claude Code sessions run there. Cards are grouped by folder, and the
sidebar filters narrow across all folders at once. Settings go in that project's
`.claude/settings.local.json`, the gitignored file, so this app never dirties a
file your repo shares with other people.

Two badges only appear on project skills:

- **project only**, meaning the name exists nowhere else
- **overrides global**, meaning a global skill has the same name, and inside this
  folder the project one wins

Because project settings sit above global ones, setting a project skill to *Auto*
sometimes writes an explicit `"on"` rather than removing the entry. Otherwise the
global value would show through. The app handles that for you.

### Which folders it looks in

Every folder you've run a Claude Code session in. It recovers the real paths from
the session records. A folder needs one session, ever; after that any skill you
add there shows up on the next Refresh.

For a folder Claude Code has never opened, use **Add folder** on the count line.
It opens the standard Windows folder picker (a browser can't be given a real
path by dragging, so a picker is the only reliable way). Added folders are
remembered in `folders.json`.

**Default Claude mode applies to global skills only.** Project skills are left
alone.

Skills are grouped by how they actually behave:

| Group | Meaning |
| :--- | :--- |
| **Auto** | Claude can decide to load the skill on its own, and `/name` works |
| **Name only** | Claude sees the skill's name but not its full description |
| **Slash only** | Runs only when you type `/name`, and Claude never reaches for it |
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
`disable-model-invocation: true` that means *Auto* and *Name only*: they would
behave identically to *Slash only*, so offering them as real choices would be a
lie. Such a skill shows **Slash only** as its selected button even when it has no
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

Every view has a description folded away on the count line, reading *45 of 45
skills · **What this app does***. Click to expand it; it slides open and holds
the explanation, when to reach for that setting, and the folders involved
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

**↶ Undo** and **Redo ↷** sit in the top bar, and `Ctrl+Z` and `Ctrl+Y` also
work. Hovering either one tells you exactly what it will do, for example
*Undo: tdd: Slash only → Off*.

They cover setting changes, Default Claude mode, orphan cleanup, and removals.
Undoing a removal puts the folder back *and* restores the setting it had. The
history survives a page reload and is cleared when you close the tab.

The single exception is **Delete forever** in the Removed view. That one really
is permanent, and the dialog says so; using it clears any history entries that
referred to the deleted folder.

### Two reasons a skill is slash-only

The difference matters:

1. **Your setting here**, changeable any time from this app.
2. **The skill's own frontmatter**, meaning `disable-model-invocation: true`
   inside its `SKILL.md`. Cards showing a **locked to /** tag are in this
   category, and their *Auto* and *Name only* buttons are struck through: the
   skill's author ruled those out, and changing it means editing the `SKILL.md`.

The sidebar counts tell you how many of yours fall into each category.

## Default Claude mode

**Settings** turns every skill off in one move, for when you want plain
out-of-the-box Claude. Your per-skill settings are snapshotted to
`snapshot.json` first, and a banner then appears in the sidebar reading **Default
Claude mode is on**, so you always know why everything is off.

There are two equally good ways back, and both restore every skill to the exact
setting it had:

- **Bring back**, the button on that banner.
- **Undo**, with `Ctrl+Z` or the button in the top bar.

They are the same operation, so they stay in step: undoing the restore puts you
back in Default Claude mode, snapshot and all, and redo works from either
direction. Both the settings and the snapshot are written by one request, which
is what keeps the banner from ever disagreeing with the skills themselves.

## Removing skills

**Remove** moves a skill's folder to `~/.claude/skills-trash/`. It is never
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
- The update check is the only request this app ever makes to the internet. It
  goes to npm and GitHub and nowhere else, it does not run until you have said
  yes, and release notes are shown as plain text rather than rendered, so
  nothing fetched can become part of the page.

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
lib/prefs.js         the small preferences file the app keeps for itself
lib/updates.js       the version check, and what to do about a new one
lib/apply-update.js  installing a version, forwards or back
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
prefs.json           whether the update check may run and what it last found,
                     how the app opens, and the shape its window was left in
last-update.json     how the last install went, read once and cleared
sessions/            one file per installed copy, recording the live instance
```

[CLAUDE.md](CLAUDE.md) goes further, covering the invariants a change must not
break and how to test one.
