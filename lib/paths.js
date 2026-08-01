'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { pathKey } = require('./platform');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

// Where this copy of the app is installed. Not a place to keep anything: run
// from npx it is a version-scoped cache folder that npm replaces wholesale.
const APP_DIR = path.join(__dirname, '..');

// App state lives beside the other things the app manages, so it survives an
// upgrade and is findable by hand.
const DATA_DIR = path.join(CLAUDE_DIR, 'skills-manager');

// Held here before the app could be installed from npm.
const LEGACY_DATA_DIR = path.join(APP_DIR, 'data');

/**
 * The live-instance record is per install, not per machine. Two copies — the
 * published one and someone's modified clone — must each reuse only themselves,
 * or launching the clone would hand you the original's window and quietly
 * discard every change you had made.
 */
const INSTALL_KEY = crypto.createHash('sha1').update(pathKey(APP_DIR)).digest('hex').slice(0, 12);
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

/**
 * Moves state written by a pre-npm version into its new home. Runs once: it
 * only fills in files that are not already there, so it can never overwrite
 * newer state with older.
 *
 * session.json is deliberately not carried across — it is throwaway runtime
 * state, and it now lives per install under sessions/.
 */
function migrateLegacyData() {
  if (!fs.existsSync(LEGACY_DATA_DIR)) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const name of ['snapshot.json', 'folders.json']) {
    const from = path.join(LEGACY_DATA_DIR, name);
    const to = path.join(DATA_DIR, name);
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
    } catch {
      // A copy that fails is not worth refusing to start over.
    }
  }
}

module.exports = {
  CLAUDE_DIR,
  APP_DIR,
  SKILLS_DIR: path.join(CLAUDE_DIR, 'skills'),
  COMMANDS_DIR: path.join(CLAUDE_DIR, 'commands'),
  PLUGINS_DIR: path.join(CLAUDE_DIR, 'plugins'),
  SETTINGS_FILE: path.join(CLAUDE_DIR, 'settings.json'),
  BACKUPS_DIR: path.join(CLAUDE_DIR, 'backups'),
  // Removed skills land here instead of being unlinked, so a mistaken
  // delete is always recoverable.
  TRASH_DIR: path.join(CLAUDE_DIR, 'skills-trash'),
  DATA_DIR,
  LEGACY_DATA_DIR,
  SNAPSHOT_FILE: path.join(DATA_DIR, 'snapshot.json'),
  SESSIONS_DIR,
  SESSION_FILE: path.join(SESSIONS_DIR, `${INSTALL_KEY}.json`),
  migrateLegacyData,
};
