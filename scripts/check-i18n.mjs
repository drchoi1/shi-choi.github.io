import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const site = JSON.parse(await readFile(path.join(root, 'src', 'data', 'site.json'), 'utf8'));
const missing = [];

for (const language of site.languages) {
  const file = path.join(root, language.url, 'index.html');
  const html = await readFile(file, 'utf8');
  const matches = html.matchAll(/data-deferred-src="\/([^"]+)"/g);

  for (const match of matches) {
    const assetPath = path.join(root, match[1]);
    try {
      await access(assetPath);
    } catch {
      missing.push(`${language.url}: /${match[1]}`);
    }
  }
}

if (missing.length) {
  console.error('Missing deferred image assets:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log('i18n check passed: generated pages reference existing deferred image assets.');
