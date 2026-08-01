#!/usr/bin/env node
'use strict';

// Subcommands are required lazily: starting the server should not pay to load
// the shortcut writer, and `--help` should work even on a platform where some
// other part of the app cannot.

const { NAME, VERSION, PACKAGE_NAME } = require('../lib/app-info');

const HELP = `
  ${NAME} ${VERSION}

  Usage
    ${PACKAGE_NAME}                      start it and open the app
    ${PACKAGE_NAME} dev [folder]         make your own copy to change in Claude Code
    ${PACKAGE_NAME} install-shortcut     add a desktop/Start-menu shortcut
    ${PACKAGE_NAME} uninstall-shortcut   remove it again

  Options
    --desktop      install-shortcut: also put one on the desktop
    --name <name>  install-shortcut: name it something else, so a copy of the
                   app can sit alongside the original
    --help, --version

  Environment
    SKILLS_NO_OPEN=1   don't open a browser, just print the URL
`;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Pulls `--flag value` and bare `--flag` out of the remaining arguments. */
function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case undefined:
      return require('../server').start();

    case 'dev':
    case 'fork': {
      const fork = require('../lib/fork');
      const result = await fork.run({ dir: flags._[0], name: flags.name });
      console.log(fork.describe(result));
      return;
    }

    case 'install-shortcut': {
      const shortcut = require('../lib/shortcut');
      const created = shortcut.install({ desktop: Boolean(flags.desktop), name: flags.name });
      for (const line of created) console.log(`  Created ${line}`);
      console.log(`\n  Launch it by searching for "${flags.name || NAME}".\n`);
      return;
    }

    case 'uninstall-shortcut': {
      const shortcut = require('../lib/shortcut');
      const removed = shortcut.uninstall({ name: flags.name });
      if (!removed.length) return console.log('\n  Nothing to remove.\n');
      for (const line of removed) console.log(`  Removed ${line}`);
      console.log('');
      return;
    }

    case 'help':
    case '--help':
    case '-h':
      return console.log(HELP);

    case 'version':
    case '--version':
    case '-v':
      return console.log(VERSION);

    default:
      console.log(HELP);
      fail(`Unknown command: ${command}`);
  }
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
