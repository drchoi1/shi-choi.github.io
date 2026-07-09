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
  const videoEmbedUrl = localizedValue(site.media.videoEmbedUrl, languageCode);
  const rsvpUrl = localizedValue(site.forms.rsvpUrl, languageCode);

  return html
    .replace(/https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]+/g, videoEmbedUrl)
    .replace(/(src|data-deferred-src)="https:\/\/forms\.office\.com\/r\/[^"]+"/, `data-deferred-src="${rsvpUrl}"`);
}

function applyLanguageSpecificContentRules(html, languageCode) {
  if (languageCode !== 'zh-Hans') {
    return html;
  }

  let localizedHtml = html.replace(
    /\n        <div id="directions-us-flights" class="travel-section">[\s\S]*?\n        <\/div>(?=\n\n        <div id="directions-nonstop-cxr")/,
    ''
  );

  for (const heading of ['From Korea', 'From Thailand', 'From Singapore', 'From Malaysia']) {
    localizedHtml = localizedHtml.replace(
      new RegExp(`\\n            <section>\\n              <h4>${heading}<\\/h4>[\\s\\S]*?\\n            <\\/section>`, 'g'),
      ''
    );
  }

  return localizedHtml.replace(
    /(\n            <section>\n              <h4>From China<\/h4>[\s\S]*?\n            <\/section>)/,
    `$1

            <div id="directions-china-visa-note" class="booking-note">
              <h3>申请越南签证</h3>
              <p>
                前往越南之前两周在 <a href="https://evisa.gov.vn/" target="_blank" rel="noopener">Vietnam National Electronic Visa system</a> 申请旅游的电子签证
              </p>
              <ul>
                <li>
                  申请流程与所需材料：
                  <ol>
                    <li>准备材料：有效期至少6个月的护照首页扫描件（清晰无反光）；一张4×6cm的白底证件照电子版（不戴眼镜）。</li>
                    <li>在线填写：访问官网填写申请表 <a href="https://evisa.gov.vn/" target="_blank" rel="noopener">Vietnam National Electronic Visa system</a></li>
                    <li>缴纳费用：单次入境25美元。支持Visa或Mastercard信用卡。</li>
                    <li>等待审批：标准处理时间为3-5个工作日。</li>
                    <li>下载打印：签证获批后会发至邮箱。务必打印两份纸质版随身携带，仅凭手机上的电子版通常不被接受。</li>
                  </ol>
                </li>
                <li>
                  入境越南注意事项
                  <ol>
                    <li>确保护照有效期至少6个月</li>
                    <li>飞机降落后， 请首先前往 VISA ON ARRIVAL 柜台，出示护照以及电子签证，在入境官柜台换取 “红色纸质签证”。 务必请将纸质签证与护照一并妥善保管。</li>
                    <li>拿红色纸质签证后再陆续排队入境</li>
                    <li>数字入境卡（新规）：自2026年4月起，要求旅客在抵达前72小时内通过官网 <a href="https://prearrival.immigration.gov.vn/" target="_blank" rel="noopener">prearrival.immigration.gov.vn</a> 填写“越南数字入境卡”，生成二维码入境</li>
                  </ol>
                </li>
              </ul>
            </div>`
  );
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

function polishLocalizedHtml(html, languageCode) {
  if (languageCode !== 'zh-Hans') {
    return html;
  }

  return html.replace(
    /<p>\n            请下载下方酒店房间预订表格，填写后发送邮件至\n            <a href="mailto:info@mianhatrang\.com">info@mianhatrang\.com<\/a> 和 <a href="mailto:sm@mianhatrang\.com">sm@mianhatrang\.com<\/a> <strong>请务必在2027年2月3日 前发送至酒店完成房间预订。房间可能会在截止日期前售罄，因此建议在行程确定后尽早预订。<\/strong>\.\n          <\/p>/,
    `<p>
            请下载下方酒店房间预订表格，填写后发送邮件至
            <a href="mailto:info@mianhatrang.com">info@mianhatrang.com</a> 和 <a href="mailto:sm@mianhatrang.com">sm@mianhatrang.com</a>。请务必在<strong>2027年2月3日</strong> 前发送至酒店完成房间预订。房间可能会在截止日期前售罄，因此建议在行程确定后尽早预订。
          </p>`
  );
}

function addRoomPriceEstimates(html, languageCode) {
  const estimate = localizedValue(site.exchangeEstimates, languageCode);
  const formatter = new Intl.NumberFormat(estimate.locale, {
    maximumFractionDigits: 0
  });

  return html.replace(/<b>VND ([\d,]+)<\/b>/g, (match, formattedVnd) => {
    const vnd = Number(formattedVnd.replaceAll(',', ''));
    const converted = Math.round((vnd / 1000000) * estimate.perMillionVnd);
    const xeUrl = `https://www.xe.com/currencyconverter/convert/?Amount=${vnd}&From=VND&To=${estimate.currency}`;
    const convertedLabel = `${estimate.estimateLabel} ${estimate.currency} ${formatter.format(converted)}`;

    return `<!-- price-conversion:${vnd} --><span class="price-conversion">
              <button type="button" class="price-conversion-trigger" aria-expanded="false"><b>VND ${formattedVnd}</b></button>
              <span class="price-conversion-bubble" role="tooltip">
                <span>${escapeHtml(convertedLabel)}</span>
                <a href="${xeUrl}" target="_blank" rel="noopener">${escapeHtml(estimate.linkLabel)}</a>
              </span>
            </span><!-- /price-conversion -->`;
  });
}

function removeRoomPriceEstimates(html) {
  return html.replace(
    /<!-- price-conversion:(\d+) --><span class="price-conversion">[\s\S]*?<\/span><!-- \/price-conversion -->/g,
    (match, vnd) => `<b>VND ${Number(vnd).toLocaleString('en-US')}</b>`
  );
}

function buildPage(language) {
  const locale = locales.get(language.code);
  let html = removeRoomPriceEstimates(sourceHtml);

  html = html.replace(/<html lang="[^"]+">/, `<html lang="${language.htmlLang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(locale.meta.title)}</title>`);
  html = injectLanguageSelector(html, language.code, locale);
  html = replaceNav(html, locale);
  html = replaceSectionHeadings(html, locale);
  html = replaceLanguageSpecificUrls(html, language.code);
  html = applyLanguageSpecificContentRules(html, language.code);
  html = applyLocaleReplacements(html, locale);
  html = polishLocalizedHtml(html, language.code);
  html = addRoomPriceEstimates(html, language.code);

  html = html.replace(/^[ \t]*<!-- generated-by-i18n -->\n?/gm, '');
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
  <style>
    @font-face {
      font-display: swap;
      font-family: "Cormorant Garamond";
      font-style: normal;
      font-weight: 400;
      src: url("/assets/fonts/cormorant-garamond/cormorant-garamond-400.woff2") format("woff2");
    }

    @font-face {
      font-display: swap;
      font-family: "Noto Serif KR";
      font-style: normal;
      font-weight: 400;
      src: url("/assets/fonts/noto-serif-kr/noto-serif-kr-400.woff2") format("woff2");
    }

    @font-face {
      font-family: "Wedding Songti Local";
      font-style: normal;
      font-weight: 400;
      src: local("Songti SC Regular"), local("Songti SC"), local("STSong");
    }

    @font-face {
      font-family: "Wedding Noto Serif SC";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("/assets/fonts/noto-serif-sc/noto-serif-sc-400.woff2") format("woff2");
    }

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
      font-family: "Wedding Songti Local", "Songti SC", STSong, "Wedding Noto Serif SC", SimSun, "Times New Roman", serif;
      font-synthesis: none;
      font-synthesis-weight: none;
      letter-spacing: 0;
    }
  </style>
</head>
<body>
  <main aria-label="Choose a language">
    <img class="landing-image" src="/assets/images/hunjie-focused.jpg" alt="Calvin and Hee Joong" loading="eager" fetchpriority="high" decoding="async">
    <nav class="language-options" aria-label="Language options">
      <a href="/en/" lang="en">English</a>
      <a href="/ko/" lang="ko">한국어</a>
      <a href="/zh/" lang="zh-Hans">中文</a>
    </nav>
  </main>
</body>
</html>
`);

console.log(`Generated ${site.languages.map((language) => language.url).join(', ')} and /index.html`);
