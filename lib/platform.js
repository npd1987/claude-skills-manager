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
function detached(cmd, args) {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
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

function openBrowser(url) {
  if (process.env.SKILLS_NO_OPEN) return;
  if (IS_WINDOWS) return detached('cmd', ['/c', 'start', '', url]);
  if (IS_MAC) return detached('open', [url]);
  return detached('xdg-open', [url]);
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
  capture,
  hasCommand,
  openBrowser,
  reveal,
  pickFolder,
};
