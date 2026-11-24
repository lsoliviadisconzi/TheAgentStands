"use strict";
/* ==========================================================================
   Sync Narrations from HTML Theme Files
   One-time migration script to extract narration text from themes/*.html
   into JSON files under data/narrations/
   ========================================================================== */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAll = syncAll;
exports.syncTheme = syncTheme;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const vm_1 = __importDefault(require("vm"));
const ROOT = path_1.default.join(__dirname, '..');
const THEMES_DIR = path_1.default.join(ROOT, 'themes');
const NARRATIONS_DIR = path_1.default.join(ROOT, 'data', 'narrations');
// ==========================================================================
// Helpers
// ==========================================================================
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
}
function slugifyTheme(theme) {
    return slugify(theme);
}
function slugifyReel(title) {
    return slugify(title);
}
function ensureDir(dir) {
    fs_1.default.mkdirSync(dir, { recursive: true });
}
function writeJson(file, data) {
    ensureDir(path_1.default.dirname(file));
    const tmp = file + '.tmp';
    fs_1.default.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs_1.default.renameSync(tmp, file);
}
function readThemeFile(file) {
    const html = fs_1.default.readFileSync(file, 'utf-8');
    const R_RE = /const R\s*=\s*(\[[\s\S]*?\]);/;
    const m = html.match(R_RE);
    if (!m)
        throw new Error('No `const R = [...]` array found in ' + path_1.default.basename(file));
    const reels = vm_1.default.runInNewContext('(' + m[1] + ')', Object.create(null), { timeout: 250 });
    return {
        title: (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '',
        sub: (html.match(/<p class="sub">([\s\S]*?)<\/p>/) || [])[1] || '',
        reels,
    };
}
// ==========================================================================
// Main Sync Logic
// ==========================================================================
function syncTheme(themeName) {
    const themeDir = path_1.default.join(THEMES_DIR, themeName);
    if (!fs_1.default.existsSync(themeDir))
        return;
    const themeSlug = slugifyTheme(themeName);
    const themeNarrDir = path_1.default.join(NARRATIONS_DIR, themeSlug);
    ensureDir(themeNarrDir);
    // Get all language files
    const prefix = `${themeName} - `;
    const langFiles = fs_1.default.readdirSync(themeDir)
        .filter(f => f.endsWith('.html') && f.startsWith(prefix))
        .map(f => ({ file: f, lang: f.slice(prefix.length, -5) }));
    if (langFiles.length === 0)
        return;
    const languages = {};
    const allReels = [];
    // Process each language
    for (const { file, lang } of langFiles) {
        const themeFile = path_1.default.join(themeDir, file);
        const parsed = readThemeFile(themeFile);
        const langDir = path_1.default.join(themeNarrDir, lang);
        ensureDir(langDir);
        const reelList = [];
        for (let i = 0; i < parsed.reels.length; i++) {
            const tr = parsed.reels[i];
            const reelSlug = slugifyReel(tr.n);
            const sceneData = tr.l.map((l, idx) => ({
                index: idx,
                direction: l.d || '',
                text: l.s,
                mood: l.m || 'flat',
                panel: l.log || [],
                holdMs: l.h ?? 1000,
                swatches: l.sw || [],
            }));
            const reelData = {
                theme: themeName,
                language: lang,
                reel: reelSlug,
                title: tr.n,
                hook: tr.hook,
                stamp: tr.stamp,
                next: tr.next,
                scenes: sceneData,
            };
            writeJson(path_1.default.join(langDir, `${reelSlug}.json`), reelData);
            reelList.push({ slug: reelSlug, title: tr.n, hook: tr.hook, sceneCount: tr.l.length });
            // Use first language to build master reel list
            if (lang === 'en' || (lang === langFiles[0].lang && i === 0)) {
                allReels.push({ slug: reelSlug, title: tr.n, hook: tr.hook, sceneCount: tr.l.length });
            }
        }
        // Write language index
        writeJson(path_1.default.join(langDir, 'index.json'), {
            theme: themeName,
            language: lang,
            reels: reelList,
        });
        languages[lang] = { code: lang, label: lang.toUpperCase(), reelCount: reelList.length };
    }
    // Write theme index
    writeJson(path_1.default.join(themeNarrDir, 'index.json'), {
        theme: themeName,
        title: themeName,
        languages,
    });
    console.log(`✓ Synced "${themeName}" → ${themeSlug} (${langFiles.length} languages, ${allReels.length} reels)`);
    return { slug: themeSlug, title: themeName, languages: Object.keys(languages) };
}
function syncAll() {
    console.log('🔄 Syncing narrations from HTML theme files...\n');
    ensureDir(NARRATIONS_DIR);
    const themes = fs_1.default.readdirSync(THEMES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    const themeIndex = {};
    for (const theme of themes) {
        const result = syncTheme(theme);
        if (result) {
            themeIndex[result.slug] = { title: result.title, languages: result.languages };
        }
    }
    // Write master index
    writeJson(path_1.default.join(NARRATIONS_DIR, 'index.json'), { themes: themeIndex });
    console.log('\n✅ Sync complete! Master index written to data/narrations/index.json');
}
// Run if executed directly
if (require.main === module) {
    syncAll();
}
