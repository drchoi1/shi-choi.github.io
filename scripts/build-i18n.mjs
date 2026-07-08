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

await writeFile(path.join(root, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Calvin & Hee Joong</title>
  <link rel="icon" type="image/png" href="/assets/images/favicon.jpg">
  <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Noto+Serif+KR:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --parchment: #F3EEE6;
      --warm-brown: #6F5643;
      --deep-brown: #4A3529;
      --olive: #66724E;
      --soft-sage: #DDE5D1;
    }

    * {
      box-sizing: border-box;
    }

    body {
      align-items: center;
      background: var(--parchment);
      color: var(--deep-brown);
      display: flex;
      font-family: "Cormorant Garamond", Georgia, serif;
      justify-content: center;
      margin: 0;
      min-height: 100vh;
      padding: clamp(1.25rem, 4vw, 3rem);
    }

    main {
      align-items: center;
      display: flex;
      flex-direction: column;
      gap: clamp(1.25rem, 3vw, 2rem);
      max-width: min(92vw, 760px);
      text-align: center;
      width: 100%;
    }

    .landing-image {
      border-radius: 18px;
      box-shadow: 0 0 28px 16px var(--parchment), 0 18px 42px rgba(74, 53, 41, 0.12);
      display: block;
      height: auto;
      mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%), linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
      mask-composite: intersect;
      max-height: min(68vh, 720px);
      max-width: 100%;
      object-fit: contain;
      -webkit-mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%), linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
      -webkit-mask-composite: source-in;
    }

    .language-options {
      display: flex;
      flex-wrap: wrap;
      gap: 0.85rem;
      justify-content: center;
      width: 100%;
    }

    .language-options a {
      background: rgba(255, 255, 255, 0.52);
      border: 1px solid rgba(111, 86, 67, 0.32);
      color: var(--deep-brown);
      display: inline-flex;
      font-size: clamp(1rem, 2.2vw, 1.15rem);
      font-weight: 400;
      justify-content: center;
      letter-spacing: 0.02em;
      line-height: 1.2;
      min-width: 9.5rem;
      padding: 0.85rem 1.25rem;
      text-decoration: none;
      transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
    }

    .language-options a:hover,
    .language-options a:focus {
      background: var(--soft-sage);
      border-color: var(--olive);
      color: var(--deep-brown);
      outline: none;
    }

    .language-options a[lang="en"] {
      font-family: "Cormorant Garamond", Georgia, serif;
    }

    .language-options a[lang="ko"] {
      font-family: "Cormorant Garamond", "Noto Serif KR", serif;
    }

    .language-options a[lang="zh-Hans"] {
      font-family: "Songti SC", STSong, SimSun, "Times New Roman", serif;
      letter-spacing: 0;
    }
  </style>
</head>
<body>
  <main aria-label="Choose a language">
    <img class="landing-image" src="/assets/images/hunjie-focused.jpg" alt="Calvin and Hee Joong" loading="eager" fetchpriority="high" decoding="async">
    <nav class="language-options" aria-label="Language options">
      <a href="/en/index.html" lang="en">English</a>
      <a href="/ko/index.html" lang="ko">한국어</a>
      <a href="/zh/index.html" lang="zh-Hans">中文</a>
    </nav>
  </main>
</body>
</html>
`);

console.log(`Generated ${site.languages.map((language) => language.url).join(', ')} and /index.html`);
