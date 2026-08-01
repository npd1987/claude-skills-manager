'use strict';

// What this copy of the app calls itself. Someone who takes the "keep both"
// route names their copy something else, and that name has to show up in the
// window and the browser tab. Two identical-looking windows would make running
// the two side by side pointless.

const fs = require('fs');
const path = require('path');

const PKG_FILE = path.join(__dirname, '..', 'package.json');
const pkg = require('../package.json');

/**
 * The name as it is on disk right now. Renaming a copy rewrites package.json
 * while the app is running, and require() caches, so reading it fresh is what
 * lets the window title change without a restart.
 */
function displayName() {
  try {
    const current = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
    return current.displayName || 'Claude Skills';
  } catch {
    return pkg.displayName || 'Claude Skills';
  }
}

// Marks a repository field that has never been filled in, so lib/fork.js knows
// to copy files rather than trying to clone from a placeholder.
const PLACEHOLDER = 'YOUR-GITHUB-USERNAME';

const repoUrl = (pkg.repository && pkg.repository.url) || '';

/**
 * How this copy got onto the machine, which decides what it is safe to tell
 * someone about removing it. Getting this wrong matters: deleting a global
 * npm install by hand leaves npm's records inconsistent, while deleting an npx
 * cache folder is completely safe.
 */
function installKind(dir) {
  const target = String(dir || '');
  if (/[\\/]_npx[\\/]/.test(target)) {
    return {
      kind: 'npx',
      advice: 'This is one of npm\'s cache folders, so deleting it is safe, and npm rebuilds it if you ever run the published version again.',
      command: null,
    };
  }
  if (/[\\/]node_modules[\\/]/.test(target)) {
    return {
      kind: 'global',
      advice: 'It was installed by npm. Removing the folder by hand would leave npm\'s records inconsistent, so let npm do it.',
      command: `npm rm -g ${pkg.name}`,
    };
  }
  return {
    kind: 'folder',
    advice: 'It\'s an ordinary folder, so delete it whenever you like.',
    command: null,
  };
}

module.exports = {
  NAME: pkg.displayName || 'Claude Skills',
  VERSION: pkg.version,
  PACKAGE_NAME: pkg.name,
  DESCRIPTION: pkg.description,
  REPO_URL: repoUrl.includes(PLACEHOLDER) ? '' : repoUrl,
  displayName,
  installKind,
};
