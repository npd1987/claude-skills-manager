'use strict';

// Desktop shortcuts. This is the one place besides lib/platform.js allowed to
// branch on the operating system, because a .lnk, an .app bundle and a .desktop
// file have nothing in common to abstract over.
//
// Every function takes a `name`, so a modified copy of the app can install its
// own shortcut beside the original's instead of fighting over one.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { IS_WINDOWS, IS_MAC, detached, hasCommand } = require('./platform');
const { APP_DIR } = require('./paths');
const { NAME, VERSION } = require('./app-info');

// Which copy of the app a shortcut should point at. Defaults to this one, but
// the setup flow installs shortcuts for the *copy* it has just made, so every
// path is derived from an explicit directory rather than assumed.
const assetsIn = (dir) => path.join(dir, 'assets');

/** A filename-safe form of a display name, for .desktop files and icons. */
function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'claude-skills'
  );
}

/**
 * npx unpacks into a version-scoped cache directory that npm owns and replaces
 * on its own schedule. A shortcut pointing there would break on the next
 * release, so refuse rather than create one that quietly rots.
 */
function isEphemeral(dir = APP_DIR) {
  return /[\\/]_npx[\\/]/.test(dir);
}

function assertInstallable(dir) {
  if (!isEphemeral(dir)) return;
  throw new Error(
    'This copy is running from npm\'s temporary npx cache, which gets replaced on\n' +
    '  every update, so a shortcut to it would stop working. Install it properly first:\n\n' +
    '      npm i -g claude-skills-manager\n\n' +
    '  then run install-shortcut again.'
  );
}

/* ------------------------------------------------------------------ windows */

function runPowerShell(dir, args) {
  // Runs the target copy's own script, so $PSScriptRoot inside it resolves to
  // that copy and the shortcut points at the right launch.vbs.
  const ps1 = path.join(dir, 'install-shortcut.ps1');
  if (!fs.existsSync(ps1)) throw new Error(`Cannot find ${ps1}`);

  // -ExecutionPolicy Bypass because a script that arrived over the network is
  // blocked by default on a stock Windows install.
  const done = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
    { encoding: 'utf8' }
  );
  if (done.error) throw done.error;
  if (done.status !== 0) throw new Error(done.stderr.trim() || 'PowerShell reported a failure.');
  return String(done.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('Created ') || l.startsWith('Removed '))
    .map((l) => l.replace(/^(Created|Removed) /, ''));
}

/* ---------------------------------------------------------------------- mac */

function macAppPath(name) {
  return path.join(os.homedir(), 'Applications', `${name}.app`);
}

/**
 * A .app bundle is a directory with a particular shape, so it needs no build
 * tools, and three files is the whole thing.
 */
function macInstall(name, dir) {
  const bundle = macAppPath(name);
  const macos = path.join(bundle, 'Contents', 'MacOS');
  const resources = path.join(bundle, 'Contents', 'Resources');
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  // LSUIElement keeps it out of the Dock: there is no window to show, the UI is
  // the browser tab it opens, and it stops itself when that tab closes.
  fs.writeFileSync(
    path.join(bundle, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleDisplayName</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>dev.claudeskills.${slug(name)}</string>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`
  );

  // A GUI launch on macOS gets a minimal PATH that often lacks node, and
  // anything installed by nvm or Homebrew is invisible, so bake in the interpreter that
  // is running right now and only fall back to a PATH lookup.
  const runner = path.join(macos, 'run');
  fs.writeFileSync(
    runner,
    `#!/bin/sh
NODE="${process.execPath}"
[ -x "$NODE" ] || NODE="$(command -v node)"
exec "$NODE" "${path.join(dir, 'server.js')}"
`
  );
  fs.chmodSync(runner, 0o755);

  const icon = path.join(assetsIn(dir), 'icon.icns');
  if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(resources, 'icon.icns'));

  return [bundle];
}

/* -------------------------------------------------------------------- linux */

function desktopFilePath(name) {
  return path.join(os.homedir(), '.local', 'share', 'applications', `${slug(name)}.desktop`);
}

function linuxIconPath(name) {
  return path.join(
    os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps', `${slug(name)}.png`
  );
}

function linuxInstall(name, dir) {
  const written = [];

  const icon = path.join(assetsIn(dir), 'icon.png');
  if (fs.existsSync(icon)) {
    const dest = linuxIconPath(name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(icon, dest);
    written.push(dest);
  }

  const file = desktopFilePath(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `[Desktop Entry]
Type=Application
Version=1.0
Name=${name}
Comment=See and manage your Claude Code skills
Exec="${process.execPath}" "${path.join(dir, 'server.js')}"
Icon=${slug(name)}
Terminal=false
Categories=Development;Utility;
StartupNotify=false
`
  );
  fs.chmodSync(file, 0o755);
  written.push(file);

  // Makes it appear in the launcher without a re-login. Absent on some minimal
  // desktops, which is why this is best-effort rather than required.
  if (hasCommand('update-desktop-database')) {
    detached('update-desktop-database', [path.dirname(file)]);
  }

  return written;
}

/* ------------------------------------------------------------------- public */

/** Every shortcut path this platform would use for `name`, existing or not. */
function locations(name = NAME) {
  if (IS_WINDOWS) return [];
  if (IS_MAC) return [macAppPath(name)];
  return [desktopFilePath(name), linuxIconPath(name)];
}

/** Which of them are actually there, which is what Manage reports on. */
function find(name = NAME) {
  return locations(name).filter((p) => fs.existsSync(p));
}

function install({ desktop = false, name = NAME, dir = APP_DIR } = {}) {
  assertInstallable(dir);

  if (IS_WINDOWS) {
    const args = ['-Name', name];
    if (desktop) args.push('-Desktop');
    return runPowerShell(dir, args);
  }
  if (IS_MAC) return macInstall(name, dir);
  return linuxInstall(name, dir);
}

function uninstall({ name = NAME, dir = APP_DIR } = {}) {
  if (IS_WINDOWS) return runPowerShell(dir, ['-Name', name, '-Remove']);

  const removed = [];
  for (const target of locations(name)) {
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  return removed;
}

module.exports = { install, uninstall, find, locations, slug, isEphemeral };
