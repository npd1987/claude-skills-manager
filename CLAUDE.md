# Claude Skills Manager: notes for Claude Code

A local web app for managing the skills in `~/.claude/skills`. A Node HTTP server
on `127.0.0.1` serves a single page; the page is the whole interface.

If you are reading this inside somebody's own copy, they made it through
**Settings → Modify this app → Set it up**, and they want to change something.
Read the invariants below before you do. Several of them protect a file the user
cannot afford to lose.

## Start here. Two files, then start work

1. **Read [docs/HANDOFF.md](docs/HANDOFF.md).** It is the current state of play: what the last
   session did, what is queued, what is waiting on you, and what to do next.
2. **Read the rest of this file.** How to build, where the code is, and the facts that stop a
   wrong turn.

**That is the whole cold start.** Open a feature document when you are about to touch that
feature, never to find out what happened last.

**No `docs/` folder here?** This copy came from the published package, which ships the app without
them. They are at <https://github.com/npd1987/claude-skills-manager/tree/main/docs>, a `git clone`
has them on disk, and nothing in the app depends on them.

| What you want | Where it is |
| :--- | :--- |
| The current state of play | [docs/HANDOFF.md](docs/HANDOFF.md) |
| Things owed and not done, across sessions | [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md). Never rewritten, never pruned |
| Locked decisions | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Traps that outlive the round that found them | [docs/LESSONS.md](docs/LESSONS.md), by grep |
| The last three states of play | [docs/HANDOFF-HISTORY.md](docs/HANDOFF-HISTORY.md) |
| How this project is handed off | [docs/HANDOFF-METHOD.md](docs/HANDOFF-METHOD.md) |
| How the user works, and what they expect | [docs/WORKING-WITH-THE-USER.md](docs/WORKING-WITH-THE-USER.md) |
| How a feature works and why | That feature's own document, listed in docs/HANDOFF.md section 9 |

## Run it

```bash
node server.js              # opens your browser
SKILLS_NO_OPEN=1 node server.js   # headless; prints the URL instead
```

There is no build step, no test suite, and **no dependencies**. The whole thing
is Node's standard library. `npm install` does nothing here.

## The files

```
server.js            HTTP server, routing, the JSON API
lib/skills.js        scans both scopes, resolves each skill's effective state
lib/projects.js      finds project folders, remembers ones added by hand
lib/settings.js      reads/writes skillOverrides: backups, atomic writes
lib/frontmatter.js   SKILL.md frontmatter parser
lib/paths.js         every path the app touches, plus legacy-data migration
lib/prefs.js         the preferences file: update consent, launch mode, window shape
lib/platform.js      every difference between Windows, macOS and Linux
lib/shortcut.js      desktop shortcuts on the three platforms
lib/fork.js          making and managing someone's own copy of the app
lib/app-info.js      what this copy is called, and how it was installed
lib/updates.js       the version check, consent, and per-install-kind advice
lib/apply-update.js  installing a version, forwards or back, from a detached child
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
route that skips the check, and do not bind to `0.0.0.0`, because any page in
any browser on the machine could then drive it.

**Two hosts, no more, and only after consent.** The update check in
`lib/updates.js` is the only thing this app sends anywhere. It is a GET to
`registry.npmjs.org` for the latest version number, and, only when that number
is ahead of this one, a GET to `api.github.com` for that release's notes. Both
are unauthenticated, both carry nothing about the machine or its skills, and
neither runs until the user has answered the first-run question.

The replies are data and never instruction. The version is matched against a
semver pattern before it is stored. The release body is truncated, escaped, and
rendered as plain text with `white-space: pre-wrap`; it is never parsed as
Markdown or HTML, because that would turn somebody else's writing into elements
in this page. The "Read it on GitHub" link is built from the repository slug and
the tag rather than taken from the reply, so a crafted response cannot choose
where it points, and the slug itself is only accepted when it is a github.com
URL. Every command the app offers is a literal in the source.

Do not add a third host, do not send the current version, and do not move either
request into `state()`, which is rebuilt after every ordinary click.

**Never update somebody's own copy for them.** `lib/apply-update.js` refuses
anything that is not a global npm install, and the Settings dialog offers a
clone or a fork the git command instead of a button. A fork is the user's own
code, and pulling over the top of it is the one update failure that loses work
rather than time.

**The installer runs after the app exits, not during.** npm replaces the very
folder the server runs out of, which on Windows fails outright while the files
are in use. `lib/apply-update.js` spawns a detached child that waits for the
parent to exit, installs, and leaves a result file the next launch reports on.
Do not be tempted to await the install in the route.

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
by a hash of the install directory. Shared, a modified copy hands you the
original's window and silently discards the user's work.

**Project settings go in `.claude/settings.local.json`.** The gitignored one, so
the app never dirties a file the user's repo shares with other people.

## Writing

**No em dashes.** Not in the README, not in the interface, not in anything that
ends up on GitHub or npm, and not in the comments either. Use a colon when the
second half explains the first, a comma or "because" when it qualifies, and a
full stop when it is really a new sentence. This is a standing rule for the
project, so a new file starts out following it rather than being swept later.

Sentence case for headings and buttons. The interface says what happened rather
than congratulating anyone for it.

## Node version

Node 18+. `server.js` uses global `fetch` and `AbortSignal.timeout`.

## Things worth knowing

- **State lives in `~/.claude/skills-manager/`**, not in the install directory.
  Under `npx` the install directory is a cache npm replaces on every update.
- **Effective state is computed, not stored.** A skill's setting comes from
  `skillOverrides` plus its own frontmatter, so `disable-model-invocation: true`
  rules out *Auto* and *Name only* no matter what the settings file says. See
  `lib/skills.js`.
- **Both themes are written out, and neither is the other one reused.** The light
  values are declared twice in `public/styles.css` on purpose, and collapsing
  that costs either a flash of the wrong theme or an override the user cannot
  undo. **Check any new colour against both.** The reasoning is in
  docs/DECISIONS.md, *Both themes are written out*.
- **The sidebar holds states, not settings.** Anything that is genuinely a
  setting belongs in the Settings dialog. Default Claude mode being on, and this
  being someone's own copy, stay in the sidebar as banners because they are
  things you must be able to see without going to look, and each banner carries
  the way out of itself.
- **The page renders from one `/api/state` payload.** Most actions post a change
  and get fresh state back, then re-render. Follow that pattern rather than
  mutating the DOM from a handler.
- **Undo/redo is client-side history over the same API.** See `pushHistory` and
  `applyEntry` in `public/app.js`.
- **The server stops on its own** once no page has checked in for ~2.5 minutes,
  because a shortcut launch leaves no window to close.

## Testing changes

There is no test suite. What is worth doing by hand after a change:

1. `SKILLS_NO_OPEN=1 node server.js`, then load the printed URL.
2. Change one skill's setting; confirm a new file appeared in
   `~/.claude/backups/` and `settings.json` is still valid JSON.
3. Undo it, and confirm the setting comes back.
4. Turn Default Claude mode on and off; confirm every skill returns to the
   setting it had.

**This app edits your real Claude Code configuration.** Testing carelessly has
consequences, though every write is backed up first, so mistakes are
recoverable from `~/.claude/backups/`.
