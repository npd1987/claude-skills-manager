# How the app opens itself: launch mode, icon, and window shape

Everything about the window the app appears in: which kind of window it asks the browser for, what
the browser draws on its tab and taskbar button, and how it remembers the shape it was left in.
Built 2026-09-10, and finished the same day: section 4 was the last of it.

---

## 1. The launch setting

Before this, the app always opened in a tab. That was not a choice: `lib/platform.js` handed the URL
to the desktop with `start`, `open` or `xdg-open`, and none of those can express "in a window of its
own", so whatever browser was already running answered by opening a tab.

The Settings dialog now has a **How it opens** section offering three modes, stored as `launchMode`
in `~/.claude/skills-manager/prefs.json`:

| Mode | What it does | Which browsers |
| :--- | :--- | :--- |
| **A tab** | Hands the URL to the desktop, exactly as before. The default | All |
| **Its own window** | `--new-window` on Chromium, `-new-window` on Firefox | Chromium and Firefox |
| **An app window** | `--app=<url>`: no address bar, no tab strip | Chromium only |

Getting past the tab means finding the browser's own executable, which is three unrelated lookups,
one per desktop, all in `lib/platform.js`:

- **Windows**: the `UserChoice` ProgId in the registry, then that ProgId's `shell\open\command`,
  which gives an absolute path rather than a guess at where the browser installed.
- **macOS**: the http handler's bundle id out of the LaunchServices preferences, matched against a
  table of known browser bundle ids, then the binary inside the bundle. The binary rather than
  `open`, because `open --args` does not reliably reach a copy that is already running.
- **Linux**: `xdg-settings get default-web-browser`, then the first `Exec=` in that `.desktop` file
  with its field codes and any `env` wrapper stripped.

**Every one of them is allowed to fail, and failure falls back to the tab.** Opening in the wrong
shape is better than not opening.

**Only the Windows path has been run.** The macOS and Linux lookups are written to documented
behaviour and are unverified, which is [OPEN-ITEMS.md](OPEN-ITEMS.md) OI-3.

A mode the browser cannot deliver is struck through with the reason, rather than hidden, and the
section names the browser it detected so the struck-out option reads as a fact about the machine.
That was chosen off a mockup showing both treatments, and the reasoning is in
[DECISIONS.md](DECISIONS.md) under *How the app opens itself*.

## 2. The icon

The app had generated icons in `assets/` all along, drawn by `tools/make-icon.js` as an orange plate
with a white slash, but nothing on the page ever pointed at them: there was no `<link rel="icon">`,
and `assets/` is not under the web root. So the browser had nothing to draw and used a generic globe,
which is what a chrome-less app window shows in the taskbar.

Three things now point at the one file, so they cannot drift apart:

- `/icon.png` and `/icon.ico` are served from `assets/` by an explicit two entry map in `server.js`,
  rather than by exposing the folder. Path traversal still 404s.
- `public/index.html` carries the favicon link, which is also what Windows uses for the taskbar
  button of an app window.
- The mark in the top left of the page was a CSS gradient square imitating the icon, and is now the
  icon itself.

**Chrome caches favicons per profile**, so an app window that was open before this change keeps the
globe until it is closed and reopened.

## 3. Remembering the window's shape

Chrome will not restore the size and position of a window opened with `--app`. It writes the
placement down, under the host and path with the port and query string left out, and then never reads
it back, because an ad-hoc app window has no installed app to attach the record to. Measured: a new
placement record appeared for `127.0.0.1_/app` holding exactly the geometry the window was closed at,
and the next launch opened at Chrome's default anyway.

Chrome does allow one thing it refuses ordinary windows: **a page in an app window may resize and
move its own window.** So the app measures itself and puts itself back.

- The page reports its shape on the heartbeat and again on unload, and the server stores it as
  `windowShape` in `prefs.json`. It is cached in `localStorage` too, so a relaunch can act before the
  first request comes back.
- Restoring happens once per page. **The resize and the move cannot go in the same task.** A window
  that has only just opened is still settling, and a move issued too early is clamped: asking for
  y=180 while the window was still 1060 tall put it at y=20, where a 1060 tall window has to sit to
  fit the screen. The move now waits for the resize and checks its own work once.
- **Verified end to end**: closed at 1024x720 at (300,180), reopened at 1024x720 at (300,180).

**This works for the app window only.** Chrome refuses `resizeTo` on an ordinary browser window, and
a tab has no window of its own, so the setting says so on the app window option alone.

## 4. The maximize problem. Solved 2026-09-10

**The symptom, while it lasted.** When the saved shape was a maximized one, the window opened filling
the work area at 1920x1080 at (0,0), which looks nearly right but is not the operating system's
maximized state. A genuinely maximized window on this machine is **1936x1096 at (-8,-8) with
`IsZoomed` true**: the frame overhangs the work area by a border width on every edge. The eight
pixels are invisible, but the state is not, and on Windows 11 it shows as square corners rather than
rounded ones and different snap behaviour. The user rejected the near miss explicitly.

**Neither the page nor the launcher can do it.** Asked to report its own size while genuinely
maximized by hand, the page said 1920x1080 at (0,0): it cannot see the overhang, so it cannot
reproduce it, and `resizeTo` can fill the work area and never maximize. Chrome, for its part,
discards `--window-size`, `--window-position` and `--start-maximized` when it forwards a command
line to an instance that is already running, measured three times. So the maximize has to be asked
of the window manager, by a helper process, which is what `maximizeWindow(title)` does: it finds the
window by its exact title and sends it `WM_SYSCOMMAND` / `SC_MAXIMIZE`.

**The cause of the failure: a detached process on Windows is given no console, and Windows PowerShell
will not run without one.** `detached()` in `lib/platform.js` passes `detached: true`, which Node
turns into the `DETACHED_PROCESS` creation flag, and a process created that way inherits no console
at all. `powershell.exe` started with none exits **0 immediately, having run nothing**: no error, no
output, and an exit code that says it went fine. Every other caller of `detached()` hands off to
`cmd /c start`, `explorer.exe`, `open` or `xdg-open`, none of which needs a console, so nothing had
ever caught it.

**How it was proved.** The same script, the same arguments and the same environment, spawned five
ways from Node with a window open and waiting:

| Spawn options | Did the script run |
| :--- | :--- |
| `detached: true, stdio: 'ignore'` | **No.** Exit 0, not one line, no log file at all |
| `detached: true, stdio: 'inherit'` | **No** |
| `detached: true, stdio: 'pipe'` | **No** |
| `stdio: 'ignore'` | Yes |
| `stdio: 'ignore', windowsHide: true` | Yes |

**The foreground correlation was a coincidence.** Every successful run had been a console process
started by hand, and every failure had been spawned detached, so parentage looked like the variable
and never was. A child of a short lived Node process maximizes the window perfectly well, as long as
it is not detached.

**The fix, and why it is not the obvious one.** `cmd /c powershell ...` spawned detached also works,
because cmd is content without a console and gives its own child one. It was built that way first,
and it is wrong: the console cmd hands over is a **visible window**, which the user watched appear in
front of the app as it maximized. `windowsHide` does not suppress it, because that flag applies to
the process being spawned and not to a console its child goes on to allocate. So the helper is
spawned by `hidden()` instead, which is `detached()` without the detaching: `stdio: 'ignore'` and
`windowsHide: true`, then `unref`. Nothing appears on screen, and the child not outliving its parent
costs nothing to a helper that acts on a window the parent is serving anyway.

**Started at launch, not on request.** The helper polls for the window by title, so it can be started
before there is one. `openApp()` starts it as it opens the browser, whenever the saved shape is a
maximized one, which moves the process spawn and the `Add-Type` compile out of the visible part of
the launch. The page still asks through `POST /api/maximize` once it has loaded, as the backstop for
a browser that took longer to show a window than the helper waits.

**Measured end to end, through a real launch, watching the window every 120ms:**

| | Window appears | Genuinely maximized | A console ever visible |
| :--- | :--- | :--- | :--- |
| Asked for by the page | 1920x1080 at (0,0) | 1.9s later | Yes, when it went through cmd |
| Started at launch, hidden | 1920x1080 at (0,0) | **0.4s later** | **No** |

The window that results is 1936x1096 at (-8,-8) with `IsZoomed` true: the real thing, not the near
miss. A launch whose saved shape is **not** maximized was measured in the same way and is untouched:
it restores to its own size and position and spawns no helper.

**A trap that outlived the bug.** `detached()` and `hidden()` both return true when `spawn` did not
throw, which says nothing about whether the helper did anything, and `POST /api/maximize` returning
`{"maximized":true}` means only that the spawn was accepted. **Measure the window, not the call.**
Enumerate top level windows, match the title exactly (`Claude Skills`, with no ` - Google Chrome`
suffix, which is what distinguishes an app window from an ordinary one), and read `GetWindowRect` and
`IsZoomed`. See [LESSONS.md](LESSONS.md).

**Still unrun anywhere but Windows.** The macOS branch is an AppleScript setting `zoomed`, which
needs accessibility permission, and the Linux branch is `wmctrl`, which many desktops do not ship and
Wayland ignores. Neither has ever been executed, and neither goes near the console problem that this
was. OI-3.

## 5. What was changed

| File | What |
| :--- | :--- |
| `lib/prefs.js` | New. Reading and writing `prefs.json`, which `lib/updates.js` used to own privately and two things now need |
| `lib/updates.js` | Rewired onto `lib/prefs.js`, keeping only its own defaults |
| `lib/platform.js` | Browser detection for three desktops, `openBrowser(url, mode)`, `browserModes`, `maximizeWindow`, and `hidden()`, which is how the maximize helper is spawned |
| `server.js` | `POST /api/launch-mode`, `POST /api/shape`, `POST /api/maximize`, the `launch` block in the state payload, the icon routes, and the app path |
| `public/app.js` | The How it opens section, the shape measuring and restoring, the maximize request |
| `public/index.html` | The favicon link, the icon as the brand mark, the modal header |
| `public/styles.css` | The struck-out choice, the pinned modal header, the brand mark |
