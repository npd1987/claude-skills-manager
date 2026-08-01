# Handoff

**As of 2026-08-01 · v1.0.1**

> **Check this stamp first.** If `package.json` no longer reads 1.0.1, or
> `git log --oneline --since=2026-08-01` shows commits that touched anything
> outside `docs/`, then this document describes an older state — trust the
> repository over anything below, and regenerate it (see *Keeping this file
> honest*).
>
> Deliberately no commit SHA: a stamp can never name the commit that writes it,
> so exact-SHA matching would report a false staleness forever. Date plus
> version is checkable and does not lie.

Nothing here restates the code. Structure and invariants live in
[CLAUDE.md](../CLAUDE.md); how to install and use it lives in
[README.md](../README.md); what changed lives in `git log`. This file holds only
what those cannot tell you.

---

## Where it stands

Shipped and public. A local web app for managing `~/.claude/skills`, published to
npm as `claude-skills-manager` and to GitHub at
[npd1987/claude-skills-manager](https://github.com/npd1987/claude-skills-manager),
MIT, zero runtime dependencies. `npx claude-skills-manager` installs and runs it
on Windows, macOS and Linux.

It began as a Windows-only personal tool and was made cross-platform, packaged,
and given a supported way for other people to fork and modify it from inside the
app itself.

---

## Verified, and not

The section most likely to mislead if it goes stale, so every row carries the
version it was checked at.

| Area | Verified | How | At |
| :--- | :--- | :--- | :--- |
| Server, API, token guard | ✅ Windows | Headless start, `/api/state`, page load, bad-token 403 | 1.0.1 |
| Install from npm registry | ✅ Windows | Fresh install into a scratch dir, then run | 1.0.1 |
| Install via `npx github:` | ✅ Windows | Clean run from the public repo | 1.0.0 |
| Packed tarball contents | ✅ | 26 files, no local settings, no `data/` | 1.0.1 |
| Line endings in the tarball | ✅ | LF on everything POSIX executes; CRLF on the Windows launchers | 1.0.0 |
| Shortcut install/remove | ✅ Windows | Created under a custom name, target inspected, removed | 1.0.0 |
| Shortcut install/remove | ⚠️ **Untested** on macOS and Linux | Generated `.plist` / `.desktop` contents checked only | 1.0.0 |
| Folder picker, browser open, reveal | ⚠️ **Untested** on macOS and Linux | Code paths written to documented behaviour | 1.0.0 |
| Fork: clone, marker, rename, runs | ✅ Windows | Real copy made, ran under its own name | 1.0.0 |
| Fork: `manage` actions end-to-end | ⚠️ Partial | UI states driven with stubbed responses; the shortcut side not run for real | 1.0.1 |
| Two copies side by side | ✅ Windows | Distinct ports, distinct names, three consecutive runs | 1.0.0 |
| Data migration from legacy `data/` | ✅ | Sandboxed home; copies when empty, refuses to overwrite newer | 1.0.0 |
| Icon containers (ICO/PNG/ICNS) | ✅ | Parsed by an independent reader, decoded visually | 1.0.0 |

**macOS has never run this.** If something breaks there it will be in the `.app`
bundle, the `osascript` folder picker, or the `open -R` reveal. Linux is
closable whenever someone sets up WSL or a container; macOS needs real hardware.

---

## Decisions that still bind

Each says what would reverse it, so they can be revisited on evidence rather
than re-argued from scratch.

**No Electron, Tauri, or signed installers.** Certificates cost hundreds a year
and unsigned binaries trigger OS warnings scarier to a newcomer than a terminal
command. *Reverses if* the project ever has a budget and a non-technical
audience.

**Zero runtime dependencies.** This is what makes the published package also the
source, which is what lets someone fork it with a file copy and no toolchain.
*Reverses if* something genuinely cannot be done with the standard library —
nothing so far has come close.

**State lives in `~/.claude/skills-manager/`, not the install directory.** Under
`npx` the install directory is a cache npm replaces on every update. *Does not
reverse* — this one is load-bearing.

**The session record is keyed per install.** Sharing it made a modified copy
reopen the original's window and silently discard the user's work. *Does not
reverse.*

**Replace takes over the shortcut; it never deletes the original's files.**
Under `npx` the original lives in a cache npm owns, and running `npm rm -g` on
someone's behalf can leave them with no working app. *Reverses if* the app ever
learns to install itself somewhere it fully controls.

**A copy that holds the original's name cannot simply be renamed.** It would
leave the original with no shortcut and no way to launch it, silently. The way
out is always "give the name back" first.

---

## Live threads

Nothing is blocking. These are the open ends, roughly in order of value.

- **macOS and Linux verification.** The single biggest gap. Linux needs a WSL
  distro (~500 MB) or a container; the user deferred this once already, so ask
  rather than assume.
- **npm account email is a Gmail plus-alias** (`+npm`). Stripping the suffix
  gives the real address, so it filters mail but conceals nothing. The user was
  told and left it. Changing it properly means another publish-then-unpublish
  cycle.
- **The setup dialog says "around 2,000 lines".** It is closer to 2,800. Cosmetic
  but it is the kind of claim that quietly stops being true.
- **No issue template.** Bug reports need OS, Node version, and install method
  (`npx` / `npm i -g` / clone) — those three decide which code path ran.
- **Screenshots** are `docs/screenshot-*.png`, regenerable (see *Traps*).

---

## Traps

Things that cost time here and are not invariants, so they are not in CLAUDE.md.

**Publishing needs a browser, not a code.** The npm account uses a passkey, so
`npm publish` cannot prompt for a six-digit OTP — it prints a URL and waits for
a browser approval. It must be run by the account holder; it cannot be automated
from here.

**Unpublish order matters.** Removing the only published version deletes the
package and locks the name for 24 hours. Always publish the new version first,
then unpublish the old one.

**`npm view` hides emails; the raw registry document does not.** To see what is
genuinely public, fetch `https://registry.npmjs.org/<pkg>` and read it. Checking
with `npm view` alone once produced a false all-clear.

**Screenshots must never come from the real `~/.claude`.** The header shows the
skills path, which contains a Windows username, and the real skill list is
personal. The published images were captured against a throwaway home with
fabricated demo skills, driven through Chrome's DevTools protocol for exact-size
retina captures. Regenerating them means rebuilding that demo home first.

**`npm pack` ships the working tree, not git's normalised copy.** `.gitattributes`
will not save a CRLF shebang. Check line endings in the packed tarball, not just
in the repo.

**The browser pane screenshot tool is unreliable** when the pane is not
displayed. Reading the DOM is more dependable than screenshotting, and geometry
assertions (`getBoundingClientRect`) beat eyeballing a picture.

---

## How the user works

- **Mockups before UI changes.** Any visual change gets drawn first — built with
  the app's real stylesheet so it is a true likeness — and approved before
  implementation. This has caught real problems more than once.
- **Wants the reasoning, not just the answer.** Pushback with evidence is
  welcomed; several good decisions came from it.
- **Prefers fewer, clearer options** over completeness. Two overlapping choices
  became one choice plus a checkbox at their prompting, and it was right.
- **Cost-sensitive.** The tool is free and should stay free to build and ship.
- **Asks "is this already handled?"** — answer honestly, including when it is not.

---

## Keeping this file honest

When asked to *do the handoff document*, follow the procedure in
[CLAUDE.md](../CLAUDE.md#the-handoff-document): re-read the repository,
regenerate every section above, append one line to the log below, and restamp
the header. Do not edit around stale text.

Not a slash command on purpose. A global `handoff` skill already exists and does
something different — it compacts a conversation into a throwaway file in the OS
temp directory — so a project skill of the same name would shadow it here. This
file is the opposite: durable, versioned, and regenerated in place.

---

## Session log

Append-only. One line each, newest first.

- **2026-08-01** — Made it cross-platform, packaged for npm, added the fork flow
  and the "Modify this app" UI, wrote the docs, published v1.0.0 then v1.0.1 to
  npm and GitHub. Fixed two bugs that would have shipped: a shared session file
  that made a modified copy reopen the original, and a name collision that gave
  two shortcuts the same label.
