'use strict';

const fs = require('fs');
const path = require('path');
const frontmatter = require('./frontmatter');
const settings = require('./settings');
const projects = require('./projects');
const { SKILLS_DIR, COMMANDS_DIR, TRASH_DIR, SETTINGS_FILE } = require('./paths');

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function measure(dir) {
  let files = 0;
  let bytes = 0;
  let newest = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        try {
          const stat = fs.statSync(full);
          bytes += stat.size;
          if (stat.mtimeMs > newest) newest = stat.mtimeMs;
        } catch {
          /* ignore unreadable file */
        }
      }
    }
  };
  try {
    walk(dir);
  } catch {
    /* ignore unreadable dir */
  }
  return { files, bytes, updatedAt: newest ? new Date(newest).toISOString() : null };
}

/**
 * Resolves how a skill actually behaves, combining its own frontmatter
 * declaration with the user's skillOverrides setting.
 */
function resolveBehavior(meta, state) {
  const declaredSlashOnly = meta.disableModelInvocation === true;
  const declaredNoSlash = meta.userInvocable === false;

  if (state === 'off') {
    return { auto: false, slash: false, nameOnly: false, group: 'off' };
  }

  const slash = !declaredNoSlash;
  const auto = !declaredSlashOnly && state !== 'user-invocable-only';
  const nameOnly = state === 'name-only';

  let group;
  if (!auto && slash) group = 'slash-only';
  else if (auto && nameOnly) group = 'name-only';
  else if (auto) group = 'auto';
  else group = 'off';

  return { auto, slash, nameOnly, group };
}

/**
 * Not every setting means something for every skill. A SKILL.md that sets
 * `disable-model-invocation: true` makes On and Name only produce exactly the
 * behavior of / only, so offering them as distinct choices would be a lie.
 */
function unavailableStates(meta) {
  const blocked = [];
  if (meta.disableModelInvocation === true) blocked.push('on', 'name-only');
  // Without a /command, restricting the skill *to* /commands leaves no way in.
  if (meta.userInvocable === false) blocked.push('user-invocable-only');
  return blocked;
}

function displayState(meta, state, behavior) {
  if (behavior.group === 'off') return 'off';
  if (meta.disableModelInvocation === true) return 'user-invocable-only';
  return state;
}

/**
 * Reads one skill folder. `scope` describes where it lives and which settings
 * file owns it, so the rest of the app can treat every skill the same way.
 */
function readSkill(name, skillsRoot, scope) {
  const dir = path.join(skillsRoot, name);
  const file = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(file)) return null;

  let raw = '';
  let parseError = null;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    parseError = err.message;
  }

  const { data } = frontmatter.parse(raw);
  const meta = {
    declaredName: typeof data.name === 'string' ? data.name : null,
    description: typeof data.description === 'string' ? data.description : '',
    disableModelInvocation: data['disable-model-invocation'] === true,
    userInvocable: data['user-invocable'] !== false,
    allowedTools: typeof data['allowed-tools'] === 'string' ? data['allowed-tools'] : null,
  };

  // Claude keys skillOverrides by the directory name.
  const state = scope.overrides[name] || 'on';
  const behavior = resolveBehavior(meta, state);
  const { files, bytes, updatedAt } = measure(dir);

  // The folder's creation time is the closest thing to an install date. It is
  // when the folder appeared here, so a skill copied in from elsewhere dates
  // from the copy rather than from whenever it was originally written.
  let installedAt = null;
  try {
    installedAt = fs.statSync(dir).birthtime.toISOString();
  } catch {
    /* ignore */
  }

  return {
    kind: 'skill',
    id: `${scope.id}:${name}`,
    scope: scope.kind,
    projectDir: scope.projectDir || null,
    projectName: scope.projectName || null,
    settingsFile: scope.settingsFile,
    dir,
    file,
    name,
    declaredName: meta.declaredName,
    // A frontmatter name that disagrees with the folder is worth surfacing:
    // the folder name is what skillOverrides matches on.
    nameMismatch: Boolean(meta.declaredName && meta.declaredName !== name),
    description: meta.description,
    allowedTools: meta.allowedTools,
    declaredSlashOnly: meta.disableModelInvocation,
    declaredNoSlash: !meta.userInvocable,
    state,
    displayState: displayState(meta, state, behavior),
    unavailableStates: unavailableStates(meta),
    behavior,
    files,
    bytes,
    installedAt,
    updatedAt,
    parseError,
    missingDescription: !meta.description,
  };
}

function readCommands() {
  if (!fs.existsSync(COMMANDS_DIR)) return [];
  return fs
    .readdirSync(COMMANDS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      const file = path.join(COMMANDS_DIR, e.name);
      const name = e.name.replace(/\.md$/, '');
      let description = '';
      try {
        const { data } = frontmatter.parse(fs.readFileSync(file, 'utf8'));
        if (typeof data.description === 'string') description = data.description;
      } catch {
        /* ignore */
      }
      return { kind: 'command', id: `command:${name}`, name, file, dir: COMMANDS_DIR, description };
    });
}

function readTrash(trashDir, skillsRoot) {
  if (!fs.existsSync(trashDir)) return [];
  return listDirs(trashDir)
    .map((entry) => {
      const dir = path.join(trashDir, entry);
      const match = entry.match(/^(.*)__(\d{4}-\d{2}-\d{2}T[\d-]+Z)$/);
      const name = match ? match[1] : entry;
      let removedAt = null;
      try {
        removedAt = fs.statSync(dir).mtime.toISOString();
      } catch {
        /* ignore */
      }
      return { id: entry, dir, name, removedAt, canRestore: !fs.existsSync(path.join(skillsRoot, name)) };
    })
    .sort((a, b) => String(b.removedAt).localeCompare(String(a.removedAt)));
}

/** The user-scope skills in ~/.claude/skills. */
function scanGlobal() {
  const overrides = settings.readOverrides();
  const scope = {
    id: 'global',
    kind: 'global',
    overrides,
    settingsFile: SETTINGS_FILE,
  };
  return listDirs(SKILLS_DIR)
    .map((name) => readSkill(name, SKILLS_DIR, scope))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Project settings win over user settings, and a project's settings.local.json
 * wins over its settings.json — so a project skill's effective state has to be
 * resolved across all three layers.
 */
function projectScope(project) {
  const projectSettings = path.join(project.dir, '.claude', 'settings.json');
  const localSettings = path.join(project.dir, '.claude', 'settings.local.json');

  const inherited = {
    ...settings.readOverrides(),
    ...settings.overridesIn(projectSettings),
  };

  return {
    id: project.dir,
    kind: 'project',
    projectDir: project.dir,
    projectName: project.name,
    // Personal preferences belong in the gitignored file, not the shared one.
    settingsFile: localSettings,
    inherited,
    overrides: { ...inherited, ...settings.overridesIn(localSettings) },
  };
}

function scanProjects(globalNames) {
  const shadowable = globalNames || new Set(scanGlobal().map((s) => s.name));
  const out = [];

  for (const project of projects.list()) {
    if (!fs.existsSync(project.skillsDir)) continue;
    const scope = projectScope(project);
    const skills = listDirs(project.skillsDir)
      .map((name) => readSkill(name, project.skillsDir, scope))
      .filter(Boolean)
      .map((skill) => ({ ...skill, shadowsGlobal: shadowable.has(skill.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!skills.length) continue;
    out.push({
      dir: project.dir,
      name: project.name,
      manual: project.manual,
      skillsDir: project.skillsDir,
      settingsFile: scope.settingsFile,
      trashDir: path.join(project.dir, '.claude', 'skills-trash'),
      skills,
      trash: readTrash(path.join(project.dir, '.claude', 'skills-trash'), project.skillsDir),
    });
  }
  return out;
}

function counts(skills) {
  return {
    total: skills.length,
    auto: skills.filter((s) => s.behavior.group === 'auto').length,
    nameOnly: skills.filter((s) => s.behavior.group === 'name-only').length,
    slashOnly: skills.filter((s) => s.behavior.group === 'slash-only').length,
    off: skills.filter((s) => s.behavior.group === 'off').length,
  };
}

function scan() {
  const globalSkills = scanGlobal();
  const globalNames = new Set(globalSkills.map((s) => s.name));
  const projectGroups = scanProjects(globalNames);
  const projectSkills = projectGroups.flatMap((g) => g.skills);

  const commands = readCommands();
  const overrides = settings.readOverrides();

  // skillOverrides entries pointing at nothing installed. These are dead —
  // or worse, silently apply to a built-in skill of the same name.
  const orphans = Object.entries(overrides)
    .filter(([name]) => !globalNames.has(name))
    .map(([name, state]) => ({ name, state }));

  // Two things claiming the same /slash name within the personal scope.
  const bySlash = new Map();
  for (const item of [...globalSkills, ...commands]) {
    if (!bySlash.has(item.name)) bySlash.set(item.name, []);
    bySlash.get(item.name).push(item.kind === 'skill' ? 'skill' : 'command');
  }
  const collisions = [...bySlash.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([name, sources]) => ({ name, sources }));

  return {
    skills: globalSkills,
    projects: projectGroups,
    projectSkills,
    watchedFolders: projects.list().map((p) => ({ dir: p.dir, name: p.name, manual: p.manual })),
    commands,
    orphans,
    collisions,
    trash: readTrash(TRASH_DIR, SKILLS_DIR),
    counts: counts(globalSkills),
    projectCounts: counts(projectSkills),
  };
}

module.exports = { scan, scanGlobal, projectScope, readTrash };
