'use strict';

// The app's own preferences, in ~/.claude/skills-manager/prefs.json. This is
// not the user's Claude configuration and must never be confused with it:
// settings.json holds skillOverrides and belongs to Claude Code, and only
// lib/settings.js is allowed to touch it. Losing this file costs the user a
// couple of choices, so it is written plainly rather than through a backup.

const fs = require('fs');
const { DATA_DIR, PREFS_FILE } = require('./paths');

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(patch) {
  const next = { ...read(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PREFS_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

module.exports = { read, write };
