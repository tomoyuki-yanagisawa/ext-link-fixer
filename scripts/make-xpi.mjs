import { copyFile, readFile } from 'node:fs/promises';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

const name = `link-fixer-${packageJson.version}-firefox`;
const source = `.output/${name}.zip`;
const target = `.output/${name}.xpi`;

await copyFile(source, target);
console.log(`Created ${target}`);
