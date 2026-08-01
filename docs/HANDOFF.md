# Handoff

**As of 2026-08-01 · v1.0.1**

> **Check this stamp first.** If `package.json` no longer reads 1.0.1, or
> `git log --oneline --since=2026-08-01` shows commits that touched anything
> outside `docs/`, then this document describes an older state, so trust the
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

**The version on npm is behind the repository.** npm's latest is 1.0.1, and
1.0.1 is also what `package.json` says, but the working tree now carries the
whole Settings and updates feature described below. Nothing has been bumped or
published. **A version bump is the next decision**, and it should happen before
publishing, not after: the app reports its own `package.json` version, so an
unbumped publish would leave every installed copy unable to tell the two apart.

---

## Verified, and not

The section most likely to mislead if it goes stale, so every row carries the
version it was checked at.

| Area | Verified | How | At |
| :--- | :--- | :--- | :--- |
| Server, API, token guard | ✅ Windows | Headless start, `/api/state`, page load, bad-token 403 | 1.0.1 |
| Install from npm registry | ✅ Windows | Fresh install into a scratch dir, then run | 1.0.1 |
| Install via `npx github:` | ✅ Windows | Clean run from the public repo | 1.0.0 |
| Packed tarball contents | ⚠️ **Stale** | Was 26 files at 1.0.1; two lib files have been added since | 1.0.1 |
| Line endings in the tarball | ✅ | LF on everything POSIX executes; CRLF on the Windows launchers | 1.0.0 |
| Shortcut install/remove | ✅ Windows | Created under a custom name, target inspected, removed | 1.0.0 |
| Shortcut install/remove | ⚠️ **Untested** on macOS and Linux | Generated `.plist` / `.desktop` contents checked only | 1.0.0 |
| Folder picker, browser open, reveal | ⚠️ **Untested** on macOS and Linux | Code paths written to documented behaviour | 1.0.0 |
| Fork: clone, marker, rename, runs | ✅ Windows | Real copy made, ran under its own name | 1.0.0 |
| Fork: `manage` actions end-to-end | ⚠️ Partial | UI states driven with stubbed responses; the shortcut side not run for real | 1.0.1 |
| Two copies side by side | ✅ Windows | Distinct ports, distinct names, three consecutive runs | 1.0.0 |
| Data migration from legacy `data/` | ✅ | Sandboxed home; copies when empty, refuses to overwrite newer | 1.0.0 |
| Icon containers (ICO/PNG/ICNS) | ✅ | Parsed by an independent reader, decoded visually | 1.0.0 |
| Update check against live npm | ✅ Windows | Real request to the registry; compared, reported "up to date" correctly | unreleased |
| Consent gate | ✅ Windows | First run asks; no request made until answered | unreleased |
| Install-kind detection and button gate | ✅ | Every kind exercised against `installKind`; only `global` yields a button | unreleased |
| Release-notes rendering, including injection | ✅ Windows | Seeded a body containing `<img onerror>`; rendered as literal text, zero elements created | unreleased |
| GitHub release-fetch response shape | ✅ | Checked against a repo that publishes releases; **this repo has none**, so the live path here returns "no notes" | unreleased |
| **Installing a version (forward or back)** | ❌ **Never run** | Only the pre-flight gate is exercised. No npm install has ever been performed by the detached child | unreleased |
| Light and dark contrast | ✅ | Role colours computed against both light surfaces; all clear 4.5:1. Both themes viewed | unreleased |
| Sidebar banners | ⚠️ Partial | Rendered from simulated state, not by really arming Default Claude mode | unreleased |
| A copy's Settings, both options | ✅ Windows | Ran with a real marker pointing at a real folder; both commands rendered, and the missing-original case correctly withheld one | unreleased |

**macOS has never run this.** If something breaks there it will be in the `.app`
bundle, the `osascript` folder picker, or the `open -R` reveal. Linux is
closable whenever someone sets up WSL or a container; macOS needs real hardware.

**The installer is the biggest untested thing in the repository.** The detached
child in `lib/apply-update.js` waits for the app to exit, runs npm, and writes a
result file. Every part of that is written but none of it has been observed
end to end, because doing so needs a real global npm install of a version that
is not the current one. Until that is done, treat the button as unproven and say
so if asked.

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
*Reverses if* something genuinely cannot be done with the standard library,
nothing so far has come close.

**State lives in `~/.claude/skills-manager/`, not the install directory.** Under
`npx` the install directory is a cache npm replaces on every update. *Does not
reverse*, because this one is load-bearing.

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

**No background auto-update, only an auto-check.** The process lives about two
and a half minutes past the last open page, so there is no daemon to update on;
silently rewriting the install directory of an app whose whole job is editing
somebody's real `settings.json` is a trust problem rather than a convenience;
and for a fork it would be destructive by definition. The setting is worded
"check for updates automatically" because that is all it does. *Reverses if*
the app ever becomes a long-running service, which nothing currently wants.

**The network is opt-in, asked once, in the app.** Before this the app had never
made an outbound request, and being able to say so plainly was worth something
to anyone auditing it before letting it touch their config. *Does not reverse.*

**The update command is always on screen, button or no button.** A button that
silently replaces the thing it automates leaves people stuck when it fails.
Pre-flight checks decide whether the button appears at all, so a failure is
explained before it happens rather than reported after.

**A copy never gets an update button.** Structural rather than a policy check:
every install computes its kind from its own directory, and a copy lives in a
folder the user chose, which is never `global`. Each window can only ever change
the install it is running from. *Does not reverse.*

**A copy does not update, and is not urged to.** A copy is made by cloning the
project, so `origin` points at it and a pull would merge newer upstream code
into work the user has been changing. Calling that "update" was wrong: for
something handed over to be made their own, the default has to be that it stays
as they left it. The pull is still offered, but folded away, under its own
heading, described as the merge it is. *Reverses if* forks turn out to strand
people on old versions in practice, in which case the answer is better merge
guidance rather than a louder button.

**A copy's window shows how to update the original, and does not do it.** The
marker records where the original lives and how it was installed, which is
enough to print the command. Running it from here would mean one window changing
a different install, which is the property that makes any of this predictable.
*Does not reverse.*

**No em dashes anywhere public.** The user's standing rule, covering the README,
the interface, package metadata and the comments. Rewrite the sentence rather
than substituting a character. Recorded in CLAUDE.md under *Writing*.

---

## Live threads

Nothing is blocking. These are the open ends, roughly in order of value.

- **Prove the installer.** See above. The way to do it is a real global install
  of an older version, then use the button to go forward. Nothing else in the
  repository is this untested.
- **Version bump and publish.** The repository is ahead of npm by a whole
  feature. Decide the number before publishing, not after.
- **No GitHub Releases exist**, only a `v1.0.1` tag. The *What's new* panel is
  built and works, but it has nothing to show until releases are published.
  Publishing one for the next version is what switches the feature on.
- **macOS and Linux verification.** The single biggest platform gap. Linux needs
  a WSL distro (~500 MB) or a container; the user deferred this once already, so
  ask rather than assume.
- **npm account email is a Gmail plus-alias** (`+npm`). Stripping the suffix
  gives the real address, so it filters mail but conceals nothing. The user was
  told and left it. Changing it properly means another publish-then-unpublish
  cycle.
- **The setup dialog says "around 2,000 lines".** It is further out than it was.
  Cosmetic, but it is the kind of claim that quietly stops being true.
- **No issue template.** Bug reports need OS, Node version, and install method
  (`npx` / `npm i -g` / clone), because those three decide which code path ran.
- **Screenshots** are `docs/screenshot-*.png` and now predate the Settings
  dialog, so the sidebar in them no longer matches the app. Regenerable, at the
  cost described in *Traps*.

---

## Traps

Things that cost time here and are not invariants, so they are not in CLAUDE.md.

**Publishing needs a browser, not a code.** The npm account uses a passkey, so
`npm publish` cannot prompt for a six-digit OTP. It prints a URL and waits for
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

**A running server does not pick up changes to `lib/`.** `require` caches, so
editing a module and then testing through the open page silently exercises the
old code. Restart the server after touching anything outside `public/`. This
produced a confusing "the feature does not work" for several minutes.

**Animated panels are keyed to the `explainer` class.** The open and close
transition lives on `.explainer.open .explainer-panel`, so a new collapsible
that copies only the inner markup will toggle its class and animate nothing.
Reuse the class rather than the structure.

**Escaping Windows paths through the shell into `node -e` is not worth it.**
An inline install-kind test came back all-wrong purely from backslash mangling
and briefly looked like a real bug. Write the script to a file instead.

---

## How the user works

- **Mockups before UI changes.** Any visual change gets drawn first, built with
  the app's real stylesheet so it is a true likeness, and approved before
  implementation. This has caught real problems more than once.
- **Thinks out loud, mid-task, and expects it to land.** Requirements arrive
  while work is in progress and often change what has just been built. Fold them
  in rather than deferring them, and say plainly when one contradicts an earlier
  decision.
- **Plain language over correct jargon.** "Uncommitted changes" and "a clone"
  both had to be rewritten. If a sentence in the interface assumes git, npm, or
  packaging knowledge, it is wrong, however accurate it is.
- **Wants the reasoning, not just the answer.** Pushback with evidence is
  welcomed; several good decisions came from it.
- **Prefers fewer, clearer options** over completeness. Two overlapping choices
  became one choice plus a checkbox at their prompting, and it was right.
- **Cost-sensitive.** The tool is free and should stay free to build and ship.
- **Asks "is this already handled?"** Answer honestly, including when it is not.

---

## Keeping this file honest

When asked to *do the handoff document*, follow the procedure in
[CLAUDE.md](../CLAUDE.md#the-handoff-document): re-read the repository,
regenerate every section above, append one line to the log below, and restamp
the header. Do not edit around stale text.

Not a slash command on purpose. A global `handoff` skill already exists and does
something different, compacting a conversation into a throwaway file in the OS
temp directory, so a project skill of the same name would shadow it here. This
file is the opposite: durable, versioned, and regenerated in place.

---

## Session log

Append-only. One line each, newest first.

- **2026-08-01, later.** Added updates: an opt-in version check against npm, an
  opt-in release-notes fetch from GitHub, version history with a way back to an
  older version, and an installer that runs detached after the app exits so npm
  can replace a folder Windows would otherwise hold open. Folded Default Claude
  mode and Modify this app into a Settings dialog, leaving the two states behind
  as sidebar banners that carry their own way out. Added a light and dark theme
  setting and fixed five role colours that had never met contrast on white.
  Removed every em dash from the repository as a standing rule. Corrected one
  overstatement found in review: `git pull` does not discard uncommitted work,
  it stops.
- **2026-08-01.** Made it cross-platform, packaged for npm, added the fork flow
  and the "Modify this app" UI, wrote the docs, published v1.0.0 then v1.0.1 to
  npm and GitHub. Fixed two bugs that would have shipped: a shared session file
  that made a modified copy reopen the original, and a name collision that gave
  two shortcuts the same label.
