# Quitting, and a restart button that would work afterwards

**Investigated 2026-09-10 · against the 2026-09-10 working tree · nothing built**

An open item, written up so it can be picked up cold. **No code was changed for any of this.** The
first section is how the app behaves today, measured. The rest is what a Restart button would take,
and it is a design note, not a plan anybody has agreed to. See [OPEN-ITEMS.md](OPEN-ITEMS.md) OI-10.

## What the user asked for

Quit stops the server, which is right, and then the tab is left saying *"Claude Skills has stopped.
You can close this tab."* The user's point: the whole value of a Quit button is being able to stop
the app **without losing the window**, so the stopped page should be able to start it again.

Two requirements came with it, and both matter to the design:

- **Quit should still stop it straight away**, not enter a shutting-down state that hangs about.
- **The button should work indefinitely**, not for a few seconds while the process is still dying.

Together those two rule out anything that is really just a delayed exit.

## How it behaves today

| Action | What happens | Where |
| :--- | :--- | :--- |
| X out of the window or tab | `pagehide` sends a `sendBeacon` to `/api/bye`, which backdates `lastSeen` so the idle check stops the process at the next sweep | [public/app.js](../public/app.js) `pagehide`, [server.js](../server.js) `POST /api/bye` |
| Quit button | Confirms, posts `/api/quit`, which replies and then exits 150ms later | [server.js](../server.js) `POST /api/quit` |
| Nothing at all | `IDLE_LIMIT_MS` is 150 seconds, swept every 15 | [server.js](../server.js) |

**Measured 2026-09-10.** Window closed at 01:51:30, the process was gone by 01:51:56. **About 25
seconds**, not instant: the goodbye grace is 8 seconds and the sweep is every 15, so a close lands
somewhere between 8 and 23 seconds later. Worth knowing on its own, because relaunching within about
20 seconds of closing the window reaches the **old** server rather than starting a new one.

## Why the button cannot simply be added

Once `process.exit(0)` has run, the page is talking to nothing, and **a web page cannot start a
program.** That is the browser's whole security model rather than a gap in this app, and there is no
flag, permission or header that changes it. So a Restart button needs something that outlives the
quit and can hear a click. There are two candidates and no others.

## Route 1. The process does not actually leave

Quit stops the app, tears down everything it serves, and keeps a small listener alive that answers
only two things: the stopped page, and a start route that brings the app back.

- **Same tab, same address, same token, instant.** It works for as long as that tab is open, which
  satisfies "indefinitely" in the sense that matters day to day.
- **Roughly 30 lines.** No new machinery, no permissions, no platform code.
- **The honest problem: it makes Quit a lie.** The process is still there, holding the port and a few
  megabytes, and still visible in Task Manager. Quit would mean "stopped working" rather than "gone".

That last point is the whole of the objection, and it is the user's call rather than a technical one.

## Route 2. The operating system learns how to launch the app

Register a URL scheme, `claude-skills://`, the way Zoom and VS Code do. Quit then exits fully and
immediately, and the Restart button is a link to that scheme: the OS launches the app again, and it
still works a week later, because the OS is what is holding the door open rather than a process.

**This is the only route that gives a genuinely gone process and a button that still works.** It also
costs the most:

- **A registration per desktop.** A registry entry under `HKCU\Software\Classes` on Windows, a
  `CFBundleURLTypes` entry in the `.app` bundle on macOS, a `MimeType=x-scheme-handler/...` line in
  the `.desktop` file on Linux. Two thirds of that could not be run or proved here, which is OI-3
  all over again.
- **It only works for a copy at a stable path.** An `npx` run lives in a cache npm replaces on every
  update, so there is nothing durable to point a registration at. It would have to be offered to a
  global install and to a fork, and quietly withheld from `npx`.
- **Chrome prompts the first time.** An "Open Claude Skills?" dialog with a remember box. Unavoidable
  and probably fine, but it is the first thing to see for real rather than assume.
- **Getting back into the same tab costs more again.** A relaunched server mints a fresh token
  ([server.js](../server.js), `crypto.randomBytes(16)`) and the stopped tab is holding the dead one,
  so the tab would have to be let back in by a one-time ticket: written to the data directory as the
  app quits, carried in the scheme URL, redeemed once at startup, deleted. Buildable, and the part to
  think hardest about, because the token guard is what stops every other page in the browser from
  driving this app. **Do not weaken it casually.**
- Without the ticket, the cheap version of Route 2 is: the relaunched app opens its own new window,
  and the stopped tab says so and can be closed. A working Restart button, just not in place.

## What to prove first, if this is ever picked up

**The cheapest experiment, before writing anything:** register a throwaway scheme by hand on this
machine, point it at a script that writes a file, click a link to it from a local page, and see what
Chrome actually does. That answers the prompt question, the does-it-reach-the-program question and
the what-arguments-arrive question in one go. It is a registry write, so it was not done as part of
this investigation.

If that works, the order is: registration in `lib/shortcut.js` alongside the shortcut writing that
already knows how to point at this install, then the launch path, then the ticket, then the stopped
page.

## What was decided

**Nothing, deliberately.** The user asked for the finding to be written down and left. Route 1 is
cheap and dishonest, Route 2 is honest and expensive, and choosing between them is a product
decision about what the word Quit should mean.
