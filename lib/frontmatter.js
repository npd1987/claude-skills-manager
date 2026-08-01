'use strict';

// Minimal YAML-frontmatter parser. SKILL.md frontmatter is a flat map of
// scalars, so a full YAML engine would be overkill (and a dependency).

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return stripQuotes(value);
}

/**
 * Splits a document into { data, body }. Returns an empty `data` object when
 * the document has no frontmatter block.
 */
function parse(text) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized };
  }

  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { data: {}, body: normalized };
  }

  const block = normalized.slice(4, end);
  const body = normalized.slice(normalized.indexOf('\n', end + 1) + 1);
  const data = {};

  let pendingKey = null;
  let pendingLines = [];

  const flush = () => {
    if (pendingKey) {
      data[pendingKey] = pendingLines.join(' ').trim();
      pendingKey = null;
      pendingLines = [];
    }
  };

  for (const raw of block.split('\n')) {
    // A folded/literal scalar continues while lines stay indented.
    if (pendingKey && /^\s+\S/.test(raw)) {
      pendingLines.push(raw.trim());
      continue;
    }
    flush();

    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();

    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      pendingKey = key;
      pendingLines = [];
      continue;
    }
    data[key] = coerce(value);
  }
  flush();

  return { data, body };
}

module.exports = { parse };
