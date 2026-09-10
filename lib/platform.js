'use strict';

// Everything that differs between Windows, macOS and Linux lives here, so the
// rest of the app never has to ask what it is running on. The one sanctioned
// exception is lib/shortcut.js, where the three desktops have nothing in common
// to abstract over.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

/* -------------------------------------------------------------------- paths */

// Windows and macOS treat paths case-insensitively; Linux does not, where
// ~/Proj and ~/proj are two genuinely different folders that must not collapse
// into one entry.
const CASE_INSENSITIVE = IS_WINDOWS || IS_MAC;

/** A comparable key for a path. Use this instead of calling toLowerCase(). */
function pathKey(p) {
  const resolved = path.resolve(String(p));
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved;
}

function samePath(a, b) {
  return pathKey(a) === pathKey(b);
}

/* ----------------------------------------------------------------- spawning */

/**
 * Fire and forget. A missing xdg-open on a bare Linux box must not take the
 * server down with it, and spawn reports that asynchronously, and an unhandled
 * 'error' event on a child process is fatal.
 */
function detached(cmd, args, env) {
  try {
    // Deliberately not windowsHide. It is not the no-op on a GUI program that
    // it looks like: Node passes it as the child's initial show state, and
    // explorer.exe hands that straight to the folder window it opens, so
    // reveal() spawned a real but invisible window and the click did nothing.
    // The console helper that wants hiding is hidden(), below.
    const options = { detached: true, stdio: 'ignore' };
    // Arguments carrying a window title would have to survive two levels of
    // quoting; the environment carries it verbatim.
    if (env) options.env = { ...process.env, ...env };
    const child = spawn(cmd, args, options);
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * A helper the user is never meant to see. Not detached, deliberately: on
 * Windows a detached process is given no console, and Windows PowerShell exits
 * zero without running a line when it has none. Handing it one through cmd does
 * work, and shows the user a console window while it runs, which is worse than
 * the problem. Without detached the console is suppressed properly and nothing
 * appears on screen.
 *
 * The cost is that the child does not outlive its parent, which suits a helper
 * that acts on a window the parent is serving anyway.
 */
function hidden(cmd, args, env) {
  try {
    const options = { stdio: 'ignore', windowsHide: true };
    if (env) options.env = { ...process.env, ...env };
    const child = spawn(cmd, args, options);
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Runs a command and resolves with its trimmed stdout, or null if it failed. */
function capture(cmd, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args);
    } catch {
      return resolve(null);
    }
    let out = '';
    child.on('error', () => resolve(null));
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('close', () => resolve(out.trim()));
  });
}

/** Whether a command exists on PATH. Used for both dialogs and `claude`. */
function hasCommand(name) {
  try {
    const probe = IS_WINDOWS
      ? spawnSync('where', [name], { stdio: 'ignore' })
      : spawnSync('/bin/sh', ['-c', `command -v ${name}`], { stdio: 'ignore' });
    return probe.status === 0;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------- shell */

/* ------------------------------------------------------------- web browser */

// Handing a URL to the desktop opens a tab in whatever is already running:
// none of `start`, `open` or `xdg-open` can express "in a window of its own".
// So a window, or a chrome-less app window, means finding the browser's own
// executable and starting it with its own flag. That is three unrelated
// lookups, one per desktop, and every one of them is allowed to fail. The
// fallback is the tab, which is what the app did before any of this existed.

const CHROMIUM = ['chrome', 'chromium', 'msedge', 'brave', 'vivaldi', 'opera', 'thorium'];
const FIREFOX = ['firefox', 'librewolf', 'waterfox', 'floorp'];

const PRETTY = {
  chrome: 'Google Chrome',
  'google-chrome': 'Google Chrome',
  'google-chrome-stable': 'Google Chrome',
  chromium: 'Chromium',
  msedge: 'Microsoft Edge',
  'microsoft-edge': 'Microsoft Edge',
  brave: 'Brave',
  'brave-browser': 'Brave',
  firefox: 'Firefox',
  librewolf: 'LibreWolf',
  vivaldi: 'Vivaldi',
  'vivaldi-stable': 'Vivaldi',
  opera: 'Opera',
  safari: 'Safari',
};

function execName(exec) {
  return path
    .basename(String(exec || ''))
    .toLowerCase()
    .replace(/\.exe$/, '');
}

/** Chromium takes --app and --new-window, Firefox only the window, Safari neither. */
function classify(exec) {
  const base = execName(exec);
  if (CHROMIUM.some((n) => base.includes(n))) return 'chromium';
  if (FIREFOX.some((n) => base.includes(n))) return 'firefox';
  return 'other';
}

function prettyName(exec) {
  const base = execName(exec);
  if (PRETTY[base]) return PRETTY[base];
  const known = Object.keys(PRETTY).find((n) => base.includes(n));
  return known ? PRETTY[known] : base.charAt(0).toUpperCase() + base.slice(1);
}

function describe(exec) {
  if (!exec) return null;
  return { name: prettyName(exec), family: classify(exec), exec };
}

/**
 * Windows keeps the user's choice of browser in the registry, as a ProgId that
 * in turn names the command line to run. Reading that command is what gives an
 * absolute path to the executable, rather than a guess at where it installed.
 */
async function detectWindows() {
  const choice = await capture('reg', [
    'query',
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
    '/v',
    'ProgId',
  ]);
  const progId = choice && (choice.match(/ProgId\s+REG_SZ\s+(\S+)/i) || [])[1];
  if (!progId) return null;

  const command = await capture('reg', ['query', `HKCR\\${progId}\\shell\\open\\command`, '/ve']);
  const line = command && (command.match(/REG_SZ\s+(.+)/) || [])[1];
  if (!line) return null;

  // Either "C:\path\browser.exe" %1, or an unquoted path with no spaces.
  const quoted = line.match(/^\s*"([^"]+)"/);
  const exec = quoted ? quoted[1] : line.trim().split(/\s+/)[0];
  return exec && fs.existsSync(exec) ? describe(exec) : null;
}

// Bundle ids are stable where executable names are not, so the default browser
// is recognised by id and only then looked for on disk.
const MAC_BUNDLES = {
  'com.google.chrome': 'Google Chrome',
  'com.microsoft.edgemac': 'Microsoft Edge',
  'com.brave.browser': 'Brave Browser',
  'org.mozilla.firefox': 'Firefox',
  'org.chromium.chromium': 'Chromium',
  'com.vivaldi.vivaldi': 'Vivaldi',
  'com.operasoftware.opera': 'Opera',
  'com.apple.safari': 'Safari',
};

async function detectMac() {
  const dump = await capture('defaults', [
    'read',
    'com.apple.LaunchServices/com.apple.launchservices.secure',
  ]);
  let bundle = null;
  if (dump) {
    // Each handler is a small block, and the one claiming http is the browser.
    for (const block of dump.match(/\{[^{}]*\}/g) || []) {
      if (!/LSHandlerURLScheme\s*=\s*https?;/.test(block)) continue;
      const role = block.match(/LSHandlerRoleAll\s*=\s*"?([^";]+)"?;/);
      if (role) {
        bundle = role[1].trim().toLowerCase();
        break;
      }
    }
  }

  const appName = bundle ? MAC_BUNDLES[bundle] : null;
  if (!appName) return null;

  const app = [
    path.join('/Applications', `${appName}.app`),
    path.join(os.homedir(), 'Applications', `${appName}.app`),
  ].find((candidate) => fs.existsSync(candidate));
  if (!app) return null;

  // The binary inside the bundle rather than `open`, because `open --args`
  // does not reliably reach a copy of the browser that is already running.
  let exec = null;
  try {
    const dir = path.join(app, 'Contents', 'MacOS');
    const entries = fs.readdirSync(dir);
    exec = entries.length ? path.join(dir, entries[0]) : null;
  } catch {
    return null;
  }
  if (!exec) return null;

  const described = describe(exec);
  // The family comes from the binary, but the name reads better from the table.
  return described && { ...described, name: appName.replace(/ Browser$/, '') };
}

const DESKTOP_DIRS = [
  path.join(os.homedir(), '.local', 'share', 'applications'),
  '/usr/share/applications',
  '/usr/local/share/applications',
  '/var/lib/snapd/desktop/applications',
  '/var/lib/flatpak/exports/share/applications',
  path.join(os.homedir(), '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
];

async function detectLinux() {
  const entry = await capture('xdg-settings', ['get', 'default-web-browser']);
  if (!entry || !entry.endsWith('.desktop')) return null;

  const file = DESKTOP_DIRS.map((dir) => path.join(dir, entry)).find((candidate) =>
    fs.existsSync(candidate)
  );
  if (!file) return null;

  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  // Only the first Exec= counts: any later ones belong to the entry's actions.
  const exec = (text.match(/^Exec\s*=\s*(.+)$/m) || [])[1];
  if (!exec) return null;

  // Field codes like %u stand in for the URL and are not part of the command,
  // and a leading `env VAR=value` wrapper is not the browser either.
  const parts = exec
    .replace(/%[a-zA-Z]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (parts.length && (parts[0] === 'env' || parts[0].includes('='))) parts.shift();

  const command = parts[0];
  if (!command) return null;
  if (command.includes('/') ? !fs.existsSync(command) : !hasCommand(command)) return null;
  return describe(command);
}

let pending = null;
let detected = null;

/** Resolves once per run, and never throws: a failed lookup is simply no browser. */
function detectBrowser() {
  if (!pending) {
    const detect = IS_WINDOWS ? detectWindows : IS_MAC ? detectMac : detectLinux;
    pending = Promise.resolve()
      .then(detect)
      .catch(() => null)
      .then((found) => {
        detected = found || null;
        return detected;
      });
  }
  return pending;
}

/** The resolved browser, for callers that cannot wait. Null until detection runs. */
const knownBrowser = () => detected;

/**
 * Which of the three ways of opening can actually deliver with this browser.
 * The page uses this to strike out what it cannot offer rather than quietly
 * showing a shorter list, so the reason stays visible.
 */
function browserModes(browser) {
  const family = browser && browser.family;
  return {
    tab: true,
    window: family === 'chromium' || family === 'firefox',
    app: family === 'chromium',
  };
}

function modeArgs(browser, mode, url) {
  if (!browser || !browser.exec) return null;
  if (browser.family === 'chromium') {
    return mode === 'app' ? [`--app=${url}`] : ['--new-window', url];
  }
  // Firefox has no chrome-less mode, so `app` is never asked of it.
  if (browser.family === 'firefox' && mode === 'window') return ['-new-window', url];
  return null;
}

function openDefault(url) {
  if (IS_WINDOWS) return detached('cmd', ['/c', 'start', '', url]);
  if (IS_MAC) return detached('open', [url]);
  return detached('xdg-open', [url]);
}

/**
 * Opens the app. `mode` is 'tab', 'window' or 'app'. Anything that cannot be
 * done falls back to the tab rather than failing, because opening in the wrong
 * shape is better than not opening at all.
 */
async function openBrowser(url, mode = 'tab') {
  if (process.env.SKILLS_NO_OPEN) return false;

  if (mode === 'window' || mode === 'app') {
    const browser = await detectBrowser();
    const args = modeArgs(browser, mode, url);
    if (args && detached(browser.exec, args)) return true;
  }

  return openDefault(url);
}

/**
 * Shows a path in the desktop's file manager. Windows and macOS can highlight
 * a specific file; Linux has no way to do that which works across desktops, so
 * there we open the folder holding it.
 */
function reveal(target) {
  if (!fs.existsSync(target)) throw new Error(`Path does not exist: ${target}`);
  const isFile = fs.statSync(target).isFile();

  if (IS_WINDOWS) return detached('explorer.exe', isFile ? [`/select,${target}`] : [target]);
  if (IS_MAC) return detached('open', ['-R', target]);
  return detached('xdg-open', [isFile ? path.dirname(target) : target]);
}

/* ---------------------------------------------------------------- maximize */

// A maximized window is the window manager's to make, and only its own. A page
// can size itself to the work area, but that is not the same rectangle: Windows
// gives a maximized frame a border's overhang on every edge, and the page
// cannot see it. Measured here, a hand-maximized window is 1936x1096 at (-8,-8)
// while the page inside it reports 1920x1080 at (0,0), so a window built from
// what the page can see lands 16 pixels short in both directions and is not in
// the maximized state at all.
//
// So the app asks the desktop instead, once, just after opening the window.
// Every one of these can fail and none of them is worth an error: the window is
// already open and the wrong shape is not a broken app.

// Sent as the window manager's own maximize command. ShowWindow(SW_MAXIMIZE)
// is quietly ignored by Chrome, and so is a posted WM_SYSCOMMAND. Sent rather
// than posted, it is honoured, which is what the window manager does when you
// click the button yourself.
//
// The window is found by its exact title. An app window's title is the page's
// title alone, where an ordinary Chrome window appends " - Google Chrome", so
// an exact match cannot pick up a tab of the same page in a normal window.
const WINDOWS_MAXIMIZE = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class SkillsWindow {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb c, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint ms, out UIntPtr res);
  // Held in a field rather than passed as a temporary. A delegate handed
  // straight to EnumWindows can be collected between calls, and the second
  // lookup onwards then quietly finds nothing: the reason polling for a window
  // that had not opened yet never saw it arrive.
  static Cb keepAlive;
  public static IntPtr Find(string want) {
    IntPtr hit = IntPtr.Zero;
    keepAlive = (h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(400);
      GetWindowText(h, sb, 400);
      if (sb.ToString() == want) { hit = h; return false; }
      return true;
    };
    EnumWindows(keepAlive, IntPtr.Zero);
    return hit;
  }
}
"@
$want = $env:SKILLS_WINDOW_TITLE
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
  $h = [SkillsWindow]::Find($want)
  if ($h -ne [IntPtr]::Zero) {
    $res = [UIntPtr]::Zero
    # SMTO_ABORTIFHUNG, so a busy browser cannot hold this helper open.
    [void][SkillsWindow]::SendMessageTimeout($h, 0x0112, [IntPtr]0xF030, [IntPtr]::Zero, 2, 3000, [ref]$res)
    break
  }
  Start-Sleep -Milliseconds 250
}
`;

// AppleScript's "zoomed" is the green button, which is the maximize equivalent.
// System Events needs accessibility permission, which the user grants once to
// the terminal or app that runs it, and refuses silently until they do.
const MAC_MAXIMIZE = (title) => `
tell application "System Events"
  repeat 40 times
    try
      tell process "Google Chrome"
        repeat with w in windows
          if name of w is "${title}" then
            set value of attribute "AXFullScreen" of w to false
            set zoomed of w to true
            return
          end if
        end repeat
      end tell
    end try
    delay 0.25
  end repeat
end tell
`;

/**
 * Asks the desktop to maximize the window the app has just opened. Fire and
 * forget: it polls for the window in its own process, because the window does
 * not exist yet at the moment the browser is asked for it.
 *
 * Windows does this properly. macOS needs accessibility permission and stays
 * unmaximized without it. Linux needs wmctrl, which many desktops do not ship
 * and Wayland ignores, so there it is offered and not promised.
 */
function maximizeWindow(title) {
  if (!title) return false;

  if (IS_WINDOWS) {
    // Encoded rather than quoted: the script carries quotes, braces and
    // newlines, and every one of them is a way for a command line to go wrong.
    const encoded = Buffer.from(WINDOWS_MAXIMIZE, 'utf16le').toString('base64');
    // Through hidden() rather than detached(). A detached process gets no
    // console and Windows PowerShell quietly exits without one, which is the
    // whole reason this helper worked by hand for a year of afternoons and
    // never once through the server. See hidden().
    return hidden(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { SKILLS_WINDOW_TITLE: title }
    );
  }

  if (IS_MAC) return detached('osascript', ['-e', MAC_MAXIMIZE(title)]);

  if (!hasCommand('wmctrl')) return false;
  return detached('/bin/sh', [
    '-c',
    // Polled the same way, because the window is no more instant here.
    `for i in $(seq 1 40); do ` +
      `wmctrl -r "$SKILLS_WINDOW_TITLE" -b add,maximized_vert,maximized_horz 2>/dev/null && break; ` +
      `sleep 0.25; done`,
  ], { SKILLS_WINDOW_TITLE: title });
}

/* ------------------------------------------------------------ folder picker */

const PICK_PROMPT = 'Choose a folder that contains .claude/skills';

const WINDOWS_PICKER = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  `$d.Description = "${PICK_PROMPT}"`,
  '$d.UseDescriptionForTitle = $true',
  '$d.ShowNewFolderButton = $false',
  'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }',
].join('; ');

// `try`/`end try` turns a cancelled dialog into empty output rather than
// osascript's error -128, which would otherwise look like a failure.
const MAC_PICKER = [
  '-e', 'try',
  '-e', `POSIX path of (choose folder with prompt "${PICK_PROMPT}")`,
  '-e', 'end try',
];

/**
 * Opens the desktop's native folder chooser.
 *
 * Resolves to { path } when one is chosen, { cancelled: true } when the dialog
 * is dismissed, or { unsupported: true } on a Linux box with neither zenity nor
 * kdialog installed, where the caller falls back to asking for a typed path.
 */
async function pickFolder() {
  let chosen = null;

  if (IS_WINDOWS) {
    chosen = await capture('powershell', [
      '-STA', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', WINDOWS_PICKER,
    ]);
  } else if (IS_MAC) {
    chosen = await capture('osascript', MAC_PICKER);
  } else if (hasCommand('zenity')) {
    chosen = await capture('zenity', ['--file-selection', '--directory', `--title=${PICK_PROMPT}`]);
  } else if (hasCommand('kdialog')) {
    chosen = await capture('kdialog', ['--getexistingdirectory', os.homedir()]);
  } else {
    return { unsupported: true };
  }

  if (chosen === null) return { unsupported: true };
  if (!chosen) return { cancelled: true };
  return { path: chosen };
}

module.exports = {
  IS_WINDOWS,
  IS_MAC,
  pathKey,
  samePath,
  detached,
  hidden,
  capture,
  hasCommand,
  openBrowser,
  detectBrowser,
  knownBrowser,
  browserModes,
  maximizeWindow,
  reveal,
  pickFolder,
};
