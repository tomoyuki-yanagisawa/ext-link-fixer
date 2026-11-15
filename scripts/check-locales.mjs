import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = '.output';

/** メッセージが参照する置換トークンを集める（`$1` と `{name}`）。 */
function tokensOf(message) {
  return new Set([
    ...[...message.matchAll(/\$([1-9])/g)].map((match) => `$${match[1]}`),
    ...[...message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(
      (match) => `{${match[1]}}`,
    ),
  ]);
}

function placeholdersOf(entry) {
  return new Map(
    Object.entries(entry.placeholders ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      value.content,
    ]),
  );
}

async function readMessages(dir) {
  const file = path.join(dir, 'messages.json');
  const messages = JSON.parse(await readFile(file, 'utf8'));
  const entries = new Map();

  for (const [key, value] of Object.entries(messages)) {
    if (typeof value?.message !== 'string') {
      throw new Error(`${file}: "${key}" has no message`);
    }

    entries.set(key, {
      tokens: tokensOf(value.message),
      placeholders: placeholdersOf(value),
    });
  }

  return entries;
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function compare(reference, target, locale) {
  const problems = [];

  for (const key of reference.keys()) {
    if (!target.has(key)) {
      problems.push(`missing key in ${locale}: ${key}`);
    }
  }

  for (const key of target.keys()) {
    if (!reference.has(key)) {
      problems.push(`extra key in ${locale}: ${key}`);
    }
  }

  for (const [key, expected] of reference) {
    const actual = target.get(key);
    if (!actual) {
      continue;
    }

    if (!sameSet(expected.tokens, actual.tokens)) {
      problems.push(`placeholder mismatch in ${locale}: ${key}`);
    }

    const expectedNames = new Set(expected.placeholders.keys());
    const actualNames = new Set(actual.placeholders.keys());

    if (!sameSet(expectedNames, actualNames)) {
      problems.push(`placeholder names mismatch in ${locale}: ${key}`);
      continue;
    }

    for (const [name, content] of expected.placeholders) {
      if (actual.placeholders.get(name) !== content) {
        problems.push(`placeholder mapping mismatch in ${locale}: ${key} (${name})`);
      }
    }
  }

  return problems;
}

async function checkOutput(dirName) {
  const root = path.join(OUTPUT_DIR, dirName);
  const manifest = JSON.parse(
    await readFile(path.join(root, 'manifest.json'), 'utf8'),
  );
  const defaultLocale = manifest.default_locale;

  if (!defaultLocale) {
    throw new Error('manifest.json has no default_locale');
  }

  const localesDir = path.join(root, '_locales');
  const locales = (await readdir(localesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (!locales.includes(defaultLocale)) {
    throw new Error(`_locales has no ${defaultLocale}`);
  }

  const reference = await readMessages(path.join(localesDir, defaultLocale));
  const problems = [];

  for (const locale of locales) {
    if (locale === defaultLocale) {
      continue;
    }

    problems.push(
      ...compare(reference, await readMessages(path.join(localesDir, locale)), locale),
    );
  }

  console.log(
    `check-locales: ${dirName}: ${locales.join(', ')} (${reference.size} messages)`,
  );

  return problems;
}

async function defaultLocaleOf(dirName) {
  const manifest = JSON.parse(
    await readFile(path.join(OUTPUT_DIR, dirName, 'manifest.json'), 'utf8'),
  );
  return manifest.default_locale;
}

async function checkTemplates(reference) {
  const files = await readdir('entrypoints', { recursive: true });
  const problems = [];
  let count = 0;

  for (const file of files) {
    if (!file.endsWith('.html')) {
      continue;
    }

    const html = await readFile(path.join('entrypoints', file), 'utf8');

    for (const match of html.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      count += 1;
      if (!reference.has(match[1])) {
        problems.push(`missing key in ${file}: ${match[1]}`);
      }
    }
  }

  console.log(`check-locales: HTML: ${count} placeholders`);

  return problems;
}

const dirs = (await readdir(OUTPUT_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.endsWith('-mv3'))
  .map((entry) => entry.name)
  .sort();

if (!dirs.length) {
  console.error('check-locales: no build output found. Run a build first.');
  process.exit(1);
}

let failed = false;
let defaultMessages = null;

for (const dir of dirs) {
  try {
    const problems = await checkOutput(dir);

    if (defaultMessages === null) {
      defaultMessages = await readMessages(
        path.join(OUTPUT_DIR, dir, '_locales', await defaultLocaleOf(dir)),
      );
    }

    for (const problem of problems) {
      console.error(`check-locales: ${dir}: ${problem}`);
    }

    failed ||= problems.length > 0;
  } catch (error) {
    console.error(`check-locales: ${dir}: ${error.message}`);
    failed = true;
  }
}

if (defaultMessages !== null) {
  const problems = await checkTemplates(defaultMessages);

  for (const problem of problems) {
    console.error(`check-locales: HTML: ${problem}`);
  }

  failed ||= problems.length > 0;
}

if (failed) {
  process.exit(1);
}
