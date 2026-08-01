# Claude Skills Manager — notes for Claude Code

A local web app for managing the skills in `~/.claude/skills`. A Node HTTP server
on `127.0.0.1` serves a single page; the page is the whole interface.

If you are reading this inside somebody's own copy, they made it through
**Modify this app → Set it up**, and they want to change something. Read the
invariants below before you do — several of them protect a file the user cannot
afford to lose.

## Run it

```bash
node server.js              # opens your browser
SKILLS_NO_OPEN=1 node server.js   # headless; prints the URL instead
```

There is no build step, no test suite, and **no dependencies** — the whole thing
is Node's standard library. `npm install` does nothing here.

## The files

```
server.js            HTTP server, routing, the JSON API
lib/skills.js        scans both scopes, resolves each skill's effective state
lib/projects.js      finds project folders, remembers ones added by hand
lib/settings.js      reads/writes skillOverrides — backups, atomic writes
lib/frontmatter.js   SKILL.md frontmatter parser
lib/paths.js         every path the app touches, plus legacy-data migration
lib/platform.js      every difference between Windows, macOS and Linux
lib/shortcut.js      desktop shortcuts on the three platforms
lib/fork.js          making and managing someone's own copy of the app
lib/app-info.js      what this copy is called, and how it was installed
public/              the interface: index.html, app.js, styles.css
tools/make-icon.js   draws assets/icon.{ico,png,icns} from scratch
bin/                 the CLI entry point
```

## Invariants

These are the things a reasonable-looking change quietly breaks. Treat them as
constraints, not preferences.

**Zero runtime dependencies.** Deliberate, not an accident. It means the
published package is also the source, which is what lets someone fork it with a
file copy and no toolchain. Do not add one to solve a problem the standard
library can solve.

**Never write `settings.json` directly.** Go through `lib/settings.js`, which
copies the old file into `~/.claude/backups/` and then writes atomically via a
temp file and a rename. If the existing file is invalid JSON it refuses to write
rather than replacing something it could not read. This is the user's real
Claude Code configuration; a truncated write costs them their setup.

**Removing a skill moves it, never unlinks it.** Destination is
`~/.claude/skills-trash/` (or `.claude/skills-trash/` inside a project). The only
true delete is *Delete forever* in the Removed view, and it says so.

**The API is token-guarded and loopback-only.** The server binds `127.0.0.1` and
every `/api/` request must carry the per-run token from `server.js`. Do not add a
route that skips the check, and do not bind to `0.0.0.0` — any page in any
browser on the machine could then drive it.

**Reveal paths come from an allowlist.** `POST /api/reveal-path` only accepts
folders the app itself offered. Do not let it open an arbitrary path a request
names.

**All OS branching lives in `lib/platform.js`.** `lib/shortcut.js` is the one
exception, because a `.lnk`, an `.app` bundle and a `.desktop` file have nothing
in common to abstract. Anywhere else, use the helpers.

**Compare paths with `platform.samePath` / `pathKey`, never `.toLowerCase()`.**
Windows and macOS are case-insensitive; Linux is not, and lowercasing there
silently merges two genuinely different folders into one.

**The live-instance record is per install.** `lib/paths.js` keys the session file
by a hash of the install directory. Share it between copies and launching a
modified copy hands you the original's window instead, discarding every change
the user made without a word.

**Project settings go in `.claude/settings.local.json`.** The gitignored one, so
the app never dirties a file the user's repo shares with other people.

## Node version

Node 18+. `server.js` uses global `fetch` and `AbortSignal.timeout`.

## Things worth knowing

- **State lives in `~/.claude/skills-manager/`**, not in the install directory.
  Under `npx` the install directory is a cache npm replaces on every update.
- **Effective state is computed, not stored.** A skill's setting comes from
  `skillOverrides` plus its own frontmatter — `disable-model-invocation: true`
  rules out *Auto* and *Name only* no matter what the settings file says. See
  `lib/skills.js`.
- **The page renders from one `/api/state` payload.** Most actions post a change
  and get fresh state back, then re-render. Follow that pattern rather than
  mutating the DOM from a handler.
- **Undo/redo is client-side history over the same API.** See `pushHistory` and
  `applyEntry` in `public/app.js`.
- **The server stops on its own** once no page has checked in for ~2.5 minutes,
  because a shortcut launch leaves no window to close.

## The handoff document

[docs/HANDOFF.md](docs/HANDOFF.md) carries the state of play between sessions:
what is verified and what is not, which decisions still bind, what is open, and
the traps that are not invariants. When asked to **"do the handoff document"**:

1. **Re-read reality first.** Current `package.json` version, `git log -1`,
   `git status`. Never carry a claim forward without checking it.
2. **Regenerate every section**, rather than editing around what is there. Only
   the session log is append-only — add one line, newest first.
3. **Restamp the header** with today's date, the version, and the short commit
   SHA. That stamp is what lets the next session detect a stale file.
4. **Write down only what the repository cannot say.** If a fact lives in this
   file, the README, or `git log`, link to it instead of copying it.
5. **No line numbers, no code excerpts, no file trees.** They rot fastest, and
   the file map above already exists.
6. **Version-stamp every verification claim.** Say "unverified as of 1.0.1",
   never "works on macOS". Overstating here is the one failure that matters.
7. **The one-minute rule.** If a claim cannot be re-checked against the repo in
   under a minute, leave it out.

This is deliberately *not* a skill, because a global `handoff` skill already
exists and does something different — it compacts a conversation into a
throwaway file in the OS temp directory. A project skill of the same name would
shadow it here.

## Testing changes

There is no test suite. What is worth doing by hand after a change:

1. `SKILLS_NO_OPEN=1 node server.js`, then load the printed URL.
2. Change one skill's setting; confirm a new file appeared in
   `~/.claude/backups/` and `settings.json` is still valid JSON.
3. Undo it, and confirm the setting comes back.
4. Turn Default Claude mode on and off; confirm every skill returns to the
   setting it had.

**This app edits your real Claude Code configuration.** Testing carelessly has
consequences — though every write is backed up first, so mistakes are
recoverable from `~/.claude/backups/`.
