# Handoff: what happened last, and what to do next

Written to be picked up cold, and **deliberately short**. Last updated 2026-09-10, by the handoff
method in **setup** mode.

## 0. Start here. **1.1.2 is published, and the round that produced it is closed**

| | |
| :--- | :--- |
| **START HERE NEXT** | **OI-2, prove the installer.** It is the biggest untested thing in the repository and it is now genuinely testable: 1.1.0 and 1.1.1 both exist, so a global install can be sent forwards and back. It needs the user's hands |
| **WHAT THE USER SAID ABOUT THE WORK** | On the launch setting and the icon: it works and looks right. On the maximize, before it landed: *"It really should be the real maximized window. Like, not like a fake version."* Then, watching the first version of the fix: *"you could see the actual, like, power shell window in front of it when it maximized. So it was not clean looking."* Both are fixed and measured. **Nothing since then has been seen by the user**, so the maximize is theirs to accept |
| **WHAT THIS SESSION BUILT, IN ONE LINE EACH** | See section 2. All of it is in [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md), except the rename design, which is [RENAME-SKILL.md](RENAME-SKILL.md), and this document set |
| **STILL OWED** | OI-1 the maximize, then OI-2 the installer and OI-3 the platform gap. All in [OPEN-ITEMS.md](OPEN-ITEMS.md) |

## 1. The tree

| | |
| :--- | :--- |
| Branch | `main`. `git log --oneline -5` is the truth about commits, never an id written here |
| Working tree | **Committed and pushed.** Two commits: the app, then the documents. `git status` is the truth |
| Pushed | **YES**, to `npd1987/claude-skills-manager`, branch `main`, which is public |
| Released | **YES. 1.1.1 and then 1.1.2, both published 2026-09-10 by the user.** 1.1.2 is documentation only. `npm view claude-skills-manager version` is the truth |
| Build | **There is no build step.** `node --check` passes on every file this round touched: `server.js`, `lib/platform.js`, `lib/prefs.js`, `lib/updates.js`, `public/app.js` |
| Checks run | The by-hand list in [CLAUDE.md](../CLAUDE.md) *Testing changes*: a skill state changed and restored, two backups confirmed in `~/.claude/backups/`, `settings.json` still valid JSON and byte identical afterwards. The launch setting, the icon, the modal header, the window shape restore and the maximize were each driven and measured, the maximize by watching the real window every 120ms through a real launch |
| Checks not run | **Anything on macOS or Linux**, which is every platform path added this round except the Windows one. The installer, still never run, OI-2 |
| New this session | `lib/prefs.js`. Documents: this file, `HANDOFF-METHOD.md`, `HANDOFF-HISTORY.md`, `OPEN-ITEMS.md`, `DECISIONS.md`, `LESSONS.md`, `WORKING-WITH-THE-USER.md`, `LAUNCH-AND-WINDOW.md`, `RENAME-SKILL.md` |
| `CLAUDE.md` | **201 lines before, 195 after.** The trade: the *The handoff document* section came out, into [HANDOFF-METHOD.md](HANDOFF-METHOD.md), and the cold start block went in |

## 2. What this session did

- **A launch setting**: open in a tab, its own window, or a chrome-less app window, with modes the
  browser cannot deliver struck through and the detected browser named. [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 1.
- **Wired up the icon**, which existed in `assets/` and had never been pointed at, so the tab, the
  taskbar and the top left mark are now one drawing. [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 2.
- **The window remembers its shape** for the app window, verified closing and reopening at exactly
  1024x720 at (300,180). [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 3.
- **Found and fixed the true maximize.** It was never the parentage of the helper: a process spawned
  `detached` on Windows gets no console, and PowerShell exits 0 without running a line when it has
  none. [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 4.
- **A pinned Settings header with a close button**, and *How it opens* moved below *Updates*, both at
  the user's request off a screenshot.
- **Designed skill renaming and built none of it.** [RENAME-SKILL.md](RENAME-SKILL.md).
- **Investigated a Restart button for the page Quit leaves behind, and built none of it** at the
  user's instruction. [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md), and OI-10.
- **Set the project up for the handoff method**, folding the old handoff and the `CLAUDE.md` method
  section into these documents. [HANDOFF-METHOD.md](HANDOFF-METHOD.md).

## 3. The queue

1. **OI-2, prove the installer.** Newly testable, because there are now two versions to move
   between. Needs a real global install, so it needs the user.
2. **OI-2, prove the installer.** The biggest untested thing in the repository, and testable now that
   two versions exist. Needs the user, because it means a real global install.
3. **OI-3, macOS and Linux.** Now larger than it was: this round added browser detection and a window
   maximize helper for both, written and unrun.
4. **OI-4, build the rename.** Fully designed in [RENAME-SKILL.md](RENAME-SKILL.md), with two open
   questions in it that the user has not answered.

## 4. Waiting on the user

- **Whether to commit, push or release any of this.** None was asked for, so none was done. OI-9.
- **OI-2 and OI-3 both need their hands**, a global install and a machine this has never run on. The
  user deferred Linux once already, so ask rather than assume.
- **The two open questions inside [RENAME-SKILL.md](RENAME-SKILL.md)**: whether to ship the reference
  scan alone first, and whether renaming covers project skills in the first version.

## 5. Before you run anything

- **This app edits the user's real `~/.claude/settings.json`.** Only `lib/settings.js` may write it.
- **A running server does not pick up changes to `lib/`.** Restart it, or test old code by accident.
- **A spawn that returned true has only been accepted, not run.** This cost most of a round.
- The rest is in [LESSONS.md](LESSONS.md), by grep.

## 6. The state of this machine

- **A test server may still be running**, with an app window open and maximized. It stops on its own
  about two and a half minutes after the last page closes.
- **Any app window left open from this session points at a dead server** and will say the connection
  was refused. Relaunching from the Start Menu shortcut starts a fresh one.
- **`launchMode` is `app` and `windowShape` is a maximized one** in `~/.claude/skills-manager/prefs.json`,
  left that way deliberately because it is what the user wants. The next launch opens genuinely
  maximized, about 0.4 seconds after the window appears.
- The user closed several stray browser windows during testing that showed a token error. They were
  test artefacts and nothing depended on them.

## 7. What is committed, pushed and released

- **Committed:** YES.
- **Pushed:** YES, to `npd1987/claude-skills-manager` on `main`, tagged `v1.1.1`.
- **Released:** **YES, 1.1.2 on npm**, after 1.1.1 earlier the same day. Verified from the registry
  and from inside the published tarball: 29 files, 381kB unpacked, the corrected README.
- **Released on GitHub too**, on `v1.1.1` and `v1.1.2`, so *What's new* has notes for both. Each was
  checked through the same endpoint `lib/updates.js` uses: 200, not a draft, a body with text in it.

## 8. What no check can say

- **Whether any of this works on macOS or Linux.** Every platform path added this round other than
  Windows is written to documented behaviour and has never been executed. OI-3.
- **Whether the installer works.** OI-2.
- **How the launch setting feels to somebody whose default browser is Firefox or Safari.** The
  struck-out option was verified by forcing the state in the page, not by running that browser.
- **The full verification table from before this round** is preserved in
  [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md), and every row in it is still accurate: nothing this round
  changed what had been proved.

## 9. Where the detail lives

| What you want | Where it is |
| :--- | :--- |
| **The next thing** | [OPEN-ITEMS.md](OPEN-ITEMS.md), OI-9 then OI-2 |
| How the app opens itself, in full | [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) |
| The skill rename design | [RENAME-SKILL.md](RENAME-SKILL.md) |
| Why Quit cannot be undone from its own tab | [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md) |
| What is owed | [OPEN-ITEMS.md](OPEN-ITEMS.md) |
| Locked decisions | [DECISIONS.md](DECISIONS.md) |
| Traps | [LESSONS.md](LESSONS.md), by grep |
| How the user works | [WORKING-WITH-THE-USER.md](WORKING-WITH-THE-USER.md) |
| The last three states of play | [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md) |
| The handoff procedure | [HANDOFF-METHOD.md](HANDOFF-METHOD.md) |
| Structure, invariants, how to run it | [CLAUDE.md](../CLAUDE.md) |
