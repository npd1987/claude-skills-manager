# Locked decisions

Every item here was decided deliberately with the user. Treat as settled. If a decision needs
revisiting, say why and ask, do not quietly change it. **A reversed decision is corrected in place
with the correction visible**: mark it SUPERSEDED, keep the old wording, and say what replaced it and
why, because the reasoning is what stops it being re-argued.

Each entry says what would reverse it, so it can be revisited on evidence rather than re-argued from
scratch.

## Packaging and distribution

| Decision | Detail |
| :--- | :--- |
| **No Electron, Tauri or signed installers** | Certificates cost hundreds a year, and unsigned binaries trigger operating system warnings scarier to a newcomer than a terminal command. *Reverses if* the project ever has a budget and a non-technical audience |
| **Zero runtime dependencies** | This is what makes the published package also the source, which is what lets someone fork it with a file copy and no toolchain. *Reverses if* something genuinely cannot be done with the standard library. Nothing has come close |
| **State lives in `~/.claude/skills-manager/`, not the install directory** | Under `npx` the install directory is a cache npm replaces on every update. *Does not reverse*, this one is load bearing |
| **The session record is keyed per install** | Sharing it made a modified copy reopen the original's window and silently discard the user's work. *Does not reverse* |
| **The npm package carries the app, not the project's working notes** | `docs/*.md` is 27kB nobody running the app needs, and *Modify this app* prefers a `git clone`, which takes the whole repository whatever the app was installed with. `CLAUDE.md` says where the documents are for the no-git fallback. Decided 2026-09-10. *Reverses if* the fallback ever becomes the common path |
| **Large `.ico` entries are PNG** | 372kB to 48kB, and the shell reads them. Decided 2026-09-10 with the user, who asked for the package to be as lean as possible. *Reverses if* something in the toolchain turns out to need uncompressed entries |

## Updating, and the network

| Decision | Detail |
| :--- | :--- |
| **No background auto-update, only an auto-check** | The process lives about two and a half minutes past the last open page, so there is no daemon to update on. Silently rewriting the install directory of an app whose whole job is editing somebody's real `settings.json` is a trust problem rather than a convenience, and for a fork it would be destructive by definition. *Reverses if* the app becomes a long running service, which nothing wants |
| **The network is opt-in, asked once, in the app** | Before this the app had never made an outbound request, and being able to say so plainly was worth something to anyone auditing it before letting it touch their config. *Does not reverse* |
| **The update command is always on screen, button or no button** | A button that silently replaces the thing it automates leaves people stuck when it fails. Pre-flight checks decide whether the button appears, so a failure is explained before it happens rather than reported after |
| **A copy never gets an update button** | Structural rather than a policy check: every install computes its kind from its own directory, and a copy lives in a folder the user chose, which is never `global`. Each window can only ever change the install it is running from. *Does not reverse* |
| **A copy does not update, and is not urged to** | A copy is a clone, so `origin` points at it and a pull would merge newer upstream code into work the user has been changing. For something handed over to be made their own, the default has to be that it stays as they left it. The pull is still offered, folded away, described as the merge it is. *Reverses if* forks strand people on old versions in practice, and the answer then is better merge guidance rather than a louder button |
| **A copy's window shows how to update the original, and does not do it** | The marker records where the original lives and how it was installed, which is enough to print the command. Running it from here would mean one window changing a different install, which is the property that makes any of this predictable. *Does not reverse* |

## Forking

| Decision | Detail |
| :--- | :--- |
| **Replace takes over the shortcut; it never deletes the original's files** | Under `npx` the original lives in a cache npm owns, and running `npm rm -g` on someone's behalf can leave them with no working app. *Reverses if* the app ever learns to install itself somewhere it fully controls |
| **A copy that holds the original's name cannot simply be renamed** | It would leave the original with no shortcut and no way to launch it, silently. The way out is always "give the name back" first |

## How the app opens itself

| Decision | Detail |
| :--- | :--- |
| **Three launch modes, and the browser decides which are offered** | A tab, its own window, or a chrome-less app window. Decided 2026-09-10 off a mockup. Chromium can do all three, Firefox cannot do the app window, and a browser the app cannot identify can do none but the tab. See [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 1 |
| **An unavailable mode is struck through, not hidden** | The user chose this from a mockup showing both. It follows what the skill cards already do for states a skill's own frontmatter rules out: a list that quietly changes length hides the reason it changed, and a mode named with its reason explains itself six months later. The detection line naming the browser is what makes the struck-out option read as a fact about the machine rather than something the app decided |
| **No "show me" preview button for the launch modes** | Offered and declined: the Settings dialog is already dense |
| **No timing note in the launch setting's copy** | The setting applies to the next launch, not the window reading it. Offered and declined: the user judged that people would assume it |
| **The app window opens at its own path, `/app`** | Chrome files a window's remembered placement under the host and path, with the port and query string left out, so at `/` the slot is shared with every other local tool that has ever opened a window on 127.0.0.1. The token gate that guards `/` guards `/app` too |
| **The window shape is remembered for the app window only** | Chrome refuses `resizeTo` on an ordinary browser window, and a tab has no window of its own. Measured 2026-09-10 |
| **Not registering as an installed Chrome app** | It was the route to a true maximize, and it was rejected: Chrome would add a second Start Menu entry, and that entry would be broken, because it only opens a URL and the server exits about two and a half minutes after the last page closes. The app's own shortcut has to stay the launcher. *Reverses if* the app ever gains a way to start the server from a URL |

## Both themes are written out

**Decided 1.1.0, and moved here from `CLAUDE.md` on 2026-09-10 when that file needed a line back.**
The role colours (`--on`, `--nameonly`, `--slash`, `--danger`, `--accent`) were drawn for a near
black background and fall below 4.5:1 on white, the amber worst of all. So `public/styles.css`
declares the light values **twice**: once under `prefers-color-scheme` for anyone who has never
opened Settings, and once under `:root[data-theme="light"]` for anyone who has chosen. Collapsing
those into one costs either a flash of the wrong theme on load or an override the user cannot undo.
*Does not reverse.* **Check any new colour against both.**

## Writing

| Decision | Detail |
| :--- | :--- |
| **No em dashes anywhere public** | The user's standing rule, covering the README, the interface, package metadata, the comments and these documents. Rewrite the sentence rather than substituting a character. Also recorded in `CLAUDE.md` under *Writing* |
| **Sentence case for headings and buttons** | The interface says what happened rather than congratulating anyone for it |
