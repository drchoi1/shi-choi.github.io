import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'en', 'index.html');
const site = JSON.parse(await readFile(path.join(root, 'src', 'data', 'site.json'), 'utf8'));
const locales = new Map();

for (const language of site.languages) {
  const localePath = path.join(root, 'src', 'locales', `${language.code}.json`);
  locales.set(language.code, JSON.parse(await readFile(localePath, 'utf8')));
}

const sourceHtml = await readFile(sourcePath, 'utf8');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function languageSelector(languageCode, locale) {
  const options = site.languages
    .map((language) => {
      const selected = language.code === languageCode ? ' selected' : '';
      return `      <option value="${language.url}"${selected}>${escapeHtml(language.label)}</option>`;
    })
    .join('\n');

  return `  <div class="language-selector" aria-label="${escapeHtml(locale.languageSelectorLabel || 'Language')}">
    <select onchange="location.href=this.value">
${options}
    </select>
  </div>`;
}

function injectLanguageSelector(html, languageCode, locale) {
  const selector = languageSelector(languageCode, locale);
  html = html.replace(/\n\s*<!--\n\s*<div class="language-selector">[\s\S]*?<\/div>\n\s*-->\n/g, '\n');

  const visibleSelector = /  <div class="language-selector" aria-label="[^"]*">\n    <select onchange="location\.href=this\.value">[\s\S]*?\n  <\/div>\n\n/;
  if (visibleSelector.test(html)) {
    return html.replace(visibleSelector, `${selector}\n\n`);
  }

  return html.replace(
    /(<div class="menu-toggle"[\s\S]*?<\/div>\n)/,
    `$1\n${selector}\n`
  );
}

function replaceNav(html, locale) {
  const nav = locale.nav || {};

  return html
    .replace(/<li><a href="#home">[\s\S]*?<\/a><\/li>/, `<li><a href="#home">${escapeHtml(nav.home)}</a></li>`)
    .replace(/<li><a href="#story">[\s\S]*?<\/a><\/li>/, `<li><a href="#story">${escapeHtml(nav.story)}</a></li>`)
    .replace(/<li><a href="#rsvp">[\s\S]*?<\/a><\/li>/, `<li><a href="#rsvp">${escapeHtml(nav.rsvp)}</a></li>`)
    .replace(/<li><a href="#hotel">[\s\S]*?<\/a><\/li>/, `<li><a href="#hotel">${escapeHtml(nav.hotel)}<span class="sidebar-link-subtitle">${escapeHtml(nav.hotelSubtitle)}</span></a></li>`)
    .replace(/<li><a href="#directions">[\s\S]*?<\/a><\/li>/, `<li><a href="#directions">${escapeHtml(nav.directions)}</a></li>`)
    .replace(/<li><a href="#registry">[\s\S]*?<\/a><\/li>/, `<li><a href="#registry">${escapeHtml(nav.registry)}</a></li>`);
}

function replaceSectionHeadings(html, locale) {
  const sections = locale.sections || {};

  return html
    .replace(/(<section id="story"[\s\S]*?<div class="inner">\n\s*)<h2>[\s\S]*?<\/h2>/, `$1<h2>${escapeHtml(sections.story)}</h2>`)
    .replace(/(<section id="rsvp"[\s\S]*?<div class="inner">\n\s*)<h2>[\s\S]*?<\/h2>/, `$1<h2>${escapeHtml(sections.rsvp)}</h2>`)
    .replace(/(<section id="hotel"[\s\S]*?<div class="inner">\n\s*)<h2>[\s\S]*?<\/h2>/, `$1<h2>${escapeHtml(sections.hotel)}</h2>`)
    .replace(/(<section id="directions"[\s\S]*?<div class="inner">\n\s*)<h2>[\s\S]*?<\/h2>/, `$1<h2>${escapeHtml(sections.directions)}</h2>`)
    .replace(/(<section id="registry"[\s\S]*?<div class="inner">\n\s*)<h2>[\s\S]*?<\/h2>/, `$1<h2>${escapeHtml(sections.registry)}</h2>`);
}

function localizedValue(values, languageCode) {
  return values[languageCode] || values[site.defaultLanguage];
}

function replaceLanguageSpecificUrls(html, languageCode) {
  const youtubeId = localizedValue(site.media.youtubeId, languageCode);
  const rsvpUrl = localizedValue(site.forms.rsvpUrl, languageCode);

  return html
    .replace(/https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]+/g, `https://www.youtube-nocookie.com/embed/${youtubeId}`)
    .replace(/src="https:\/\/forms\.office\.com\/r\/[^"]+"/, `src="${rsvpUrl}"`);
}

function applyLocaleReplacements(html, locale) {
  const replacements = locale.replacements || {};
  const scriptStart = html.indexOf('\n  <script src="/assets/js/jquery.min.js">');
  const translatableHtml = scriptStart === -1 ? html : html.slice(0, scriptStart);
  const scriptHtml = scriptStart === -1 ? '' : html.slice(scriptStart);

  const entries = Object.entries(replacements).sort((a, b) => b[0].length - a[0].length);
  let translatedHtml = translatableHtml;

  for (const [source, replacement] of entries) {
    translatedHtml = translatedHtml.replaceAll(source, replacement);
  }

  return `${translatedHtml}${scriptHtml}`;
}

function buildPage(language) {
  const locale = locales.get(language.code);
  let html = sourceHtml;

  html = html.replace(/<html lang="[^"]+">/, `<html lang="${language.htmlLang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(locale.meta.title)}</title>`);
  html = injectLanguageSelector(html, language.code, locale);
  html = replaceNav(html, locale);
  html = replaceSectionHeadings(html, locale);
  html = replaceLanguageSpecificUrls(html, language.code);
  html = applyLocaleReplacements(html, locale);

  html = html.replace(/<!-- generated-by-i18n -->\n?/g, '');
  html = html.replace('</head>', '  <!-- generated-by-i18n -->\n</head>');

  return html;
}

for (const language of site.languages) {
  const outDir = path.join(root, language.url);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), buildPage(language));
}

const defaultLanguage = site.languages.find((language) => language.code === site.defaultLanguage);
await writeFile(path.join(root, 'index.html'), `<!DOCTYPE html>
<html lang="${defaultLanguage.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${defaultLanguage.url}">
  <title>Calvin & Hee Joong</title>
  <script>
    window.location.replace('${defaultLanguage.url}');
  </script>
</head>
<body>
  <p>Redirecting to <a href="${defaultLanguage.url}">${escapeHtml(defaultLanguage.label)}</a>.</p>
</body>
</html>
`);

console.log(`Generated ${site.languages.map((language) => language.url).join(', ')} and /index.html`);
