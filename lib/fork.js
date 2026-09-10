'use strict';

// Making someone their own copy of the app to change, and keeping track of what
// that did so it can be undone. Shared by the "Modify this app" dialog and the
// `dev` subcommand, so the two can never drift apart.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { APP_DIR } = require('./paths');
const { NAME, VERSION, REPO_URL, installKind } = require('./app-info');
const { hasCommand, IS_WINDOWS } = require('./platform');
const shortcut = require('./shortcut');

// Written into a copy's own folder rather than a central registry, so the
// record travels with the copy: move it, and it still knows what it is.
const MARKER = '.claude-skills-copy.json';

// Everything a working copy needs. Deliberately a list rather than "everything
// except node_modules": the app has no dependencies, and an explicit list can
// never sweep up somebody's unrelated files.
const CONTENTS = [
  'bin', 'lib', 'public', 'assets', 'tools', 'docs',
  'server.js', 'launch.vbs', 'install-shortcut.ps1', 'package.json',
  'README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'LICENSE',
  '.gitattributes', '.gitignore',
];

/* ------------------------------------------------------------------ marker */

function markerPath(dir = APP_DIR) {
  return path.join(dir, MARKER);
}

/** What this running copy is, or null if it's an original. */
function readMarker(dir = APP_DIR) {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath(dir), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeMarker(dir, value) {
  fs.writeFileSync(markerPath(dir), JSON.stringify(value, null, 2), 'utf8');
}

/* -------------------------------------------------------------------- copy */

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

function copyInto(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of CONTENTS) {
    const from = path.join(APP_DIR, name);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dest, name), { recursive: true });
  }
}

/**
 * Prefers a clone, so later improvements can be pulled in with `git pull`.
 * Falls back to copying the installed files, which works because nothing here
 * is compiled or bundled, and the published package *is* the source.
 */
function materialise(dest) {
  const canClone = REPO_URL && hasCommand('git');

  if (canClone) {
    const url = REPO_URL.replace(/^git\+/, '');
    const done = spawnSync('git', ['clone', '--depth', '1', url, dest], { encoding: 'utf8' });
    if (done.status === 0) return 'clone';
    // A private, renamed or not-yet-created repo shouldn't block anyone.
    try {
      fs.rmSync(dest, { recursive: true, force: true });
    } catch { /* nothing to undo */ }
  }

  copyInto(dest);

  // Give them a repository anyway, so their first edit is diffable against
  // where they started.
  if (hasCommand('git')) {
    spawnSync('git', ['init', '--quiet'], { cwd: dest });
    spawnSync('git', ['add', '-A'], { cwd: dest });
    spawnSync('git', ['-c', 'user.email=copy@localhost', '-c', 'user.name=Claude Skills',
      'commit', '--quiet', '-m', 'Your own copy of Claude Skills'], { cwd: dest });
  }

  return canClone ? 'copy-after-failed-clone' : 'copy';
}

/** Points the copy's package.json at its new name. */
function renameCopy(dest, name) {
  const file = path.join(dest, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    pkg.displayName = name;
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  } catch {
    // A copy that runs under the default name beats refusing to finish.
  }
}

/* --------------------------------------------------------------------- run */

/**
 * @param {object} options
 * @param {string} [options.into]  parent folder; the copy goes in a subfolder
 * @param {string} [options.dir]   exact destination folder
 * @param {string} [options.name]  what the copy calls itself
 * @param {'both'|'replace'} [options.mode]
 */
function run({ into, dir, name, mode = 'both', desktop = false } = {}) {
  // Replacing means taking the original's identity, not just its shortcut.
  // The copy has to call itself the same thing, or the window title and the
  // Start-menu entry would disagree about what you are running.
  const copyName = mode === 'replace'
    ? NAME
    : (name && String(name).trim()) || `${NAME} (mine)`;

  const dest = path.resolve(
    dir || path.join(into || process.cwd(), shortcut.slug(name || copyName))
  );

  if (dest === APP_DIR) throw new Error('That is the folder this app is already running from.');
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
    throw new Error(`${dest} already exists and is not empty.`);
  }

  const how = materialise(dest);
  renameCopy(dest, copyName);

  // `name` here is what the original calls itself, which Manage needs later to
  // label the shortcut it would hand back.
  const original = { dir: APP_DIR, name: NAME, ...installKind(APP_DIR) };

  writeMarker(dest, {
    name: copyName,
    mode,
    createdAt: new Date().toISOString(),
    fromVersion: VERSION,
    original,
  });

  // Shortcuts are best-effort: a copy you cannot launch from the Start menu is
  // still a copy you can run, and refusing to finish over it would be worse.
  const shortcuts = { created: [], removed: [], error: null };
  try {
    if (mode === 'replace') {
      shortcuts.removed = shortcut.uninstall({ name: NAME, dir: APP_DIR });
      shortcuts.created = shortcut.install({ name: NAME, dir: dest, desktop });
    } else {
      shortcuts.created = shortcut.install({ name: copyName, dir: dest, desktop });
    }
  } catch (err) {
    shortcuts.error = err.message;
  }

  return {
    dest,
    name: copyName,
    mode,
    how,
    files: countFiles(dest),
    shortcuts,
    original,
    claudeOnPath: hasCommand('claude'),
  };
}

/* ------------------------------------------------------------------ manage */

/**
 * Which actions make sense depends on what this copy currently is, so the two
 * states have different ones rather than one list where half the entries are
 * inapplicable:
 *
 *   this copy holds the original's name (mode 'replace')
 *     giveBack   hands the name back; `keepShortcut` decides whether this copy
 *                  takes one of its own. Those differ by exactly one boolean,
 *                  which is why they are not two separate actions.
 *
 *   this copy sits alongside the original (mode 'both')
 *     rename     calls this copy something else
 *     takeover   makes this copy the main one, taking the original's name
 *
 * Deliberately absent: renaming a copy that holds the original's name without
 * handing that name back. It would leave the original on disk with no shortcut
 * pointing at it and no way to launch it, and nothing on screen would say so.
 */
function manage({ action, name, keepShortcut = true } = {}) {
  const marker = readMarker();
  if (!marker) throw new Error('This is not a copy, so there is nothing to manage.');

  const originalDir = marker.original && marker.original.dir;
  const originalName = (marker.original && marker.original.name) || NAME;
  const originalGone = !originalDir || !fs.existsSync(path.join(originalDir || '', 'server.js'));

  const newName = (name && String(name).trim()) || `${originalName} (mine)`;
  const result = { action, created: [], removed: [], originalGone, name: newName };

  // Restoring anything needs the original to still be there. An npx copy can
  // have been swept up by npm's cache since, and saying so beats pointing a
  // shortcut at nothing.
  const needsOriginal = action === 'giveBack' || action === 'takeover';
  if (needsOriginal && originalGone) {
    throw new Error(
      'The original app is no longer on disk, so its shortcut cannot be restored.\n' +
      'Reinstall it with `npm i -g claude-skills-manager`, then try again.'
    );
  }

  // Two shortcuts with the same label would be indistinguishable in the Start
  // menu, so a copy that keeps one needs a name of its own.
  const wantsOwnName = (action === 'giveBack' && keepShortcut) || action === 'rename';
  if (wantsOwnName && newName === originalName) {
    throw new Error(`Your copy needs a different name from "${originalName}".`);
  }

  if (action === 'giveBack') {
    // Free the name before handing it over, or the two would collide.
    result.removed = shortcut.uninstall({ name: marker.name, dir: APP_DIR });
    result.created = shortcut.install({ name: originalName, dir: originalDir });

    if (keepShortcut) {
      result.created = result.created.concat(shortcut.install({ name: newName, dir: APP_DIR }));
      renameCopy(APP_DIR, newName);
      writeMarker(APP_DIR, { ...marker, name: newName, mode: 'both' });
    } else {
      // No shortcut, but it still has to stop calling itself by the original's
      // name or its window would claim to be the app it just handed back to.
      renameCopy(APP_DIR, newName);
      writeMarker(APP_DIR, { ...marker, name: newName, mode: 'none' });
    }
    return result;
  }

  if (action === 'rename') {
    result.removed = shortcut.uninstall({ name: marker.name, dir: APP_DIR });
    result.created = shortcut.install({ name: newName, dir: APP_DIR });
    renameCopy(APP_DIR, newName);
    writeMarker(APP_DIR, { ...marker, name: newName });
    return result;
  }

  if (action === 'takeover') {
    // The reverse of a replace, chosen after the fact.
    result.removed = shortcut.uninstall({ name: marker.name, dir: APP_DIR })
      .concat(shortcut.uninstall({ name: originalName, dir: originalDir }));
    result.created = shortcut.install({ name: originalName, dir: APP_DIR });
    renameCopy(APP_DIR, originalName);
    writeMarker(APP_DIR, { ...marker, name: originalName, mode: 'replace' });
    result.name = originalName;
    return result;
  }

  throw new Error(`Unknown action: ${action}`);
}

/* -------------------------------------------------------------- cli output */

function describe(result) {
  const lines = [
    '',
    `  Copied ${result.files} files to`,
    `    ${result.dest}`,
    '',
  ];

  if (result.shortcuts.error) {
    lines.push(`  No shortcut was created: ${result.shortcuts.error}`, '');
  } else if (result.shortcuts.created.length) {
    lines.push(`  Shortcut: ${result.name}`, '');
  }

  lines.push('  Open it in Claude Code:', '', `    cd "${result.dest}"`);
  if (result.claudeOnPath) {
    lines.push('    claude', '');
  } else {
    lines.push(
      '',
      '  The `claude` command is not on your PATH. Open that folder from the',
      '  Claude Code app, or install the CLI from https://claude.com/code',
      ''
    );
  }

  return lines.join('\n');
}

module.exports = { run, manage, readMarker, describe, MARKER, CONTENTS };
