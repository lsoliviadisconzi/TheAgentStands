#!/usr/bin/env python3
"""
Generate translated HTML files for 5 base files × 4 languages (de, fr, pl, sr-Latn)
"""

import re
import os
import json

# Read the translation data
with open('/Users/leandrodisconzi/Downloads/copy-ready translation pack - de . fr . pl. sr-Latn.md', 'r', encoding='utf-8') as f:
    translation_content = f.read()

# Find all language sections with their positions
lang_sections = []
for m in re.finditer(r'### (de|fr|pl|sr-Latn)\s*\n\s*```js\s*\n(\{[\s\S]*?\n\})\s*\n```', translation_content):
    lang = m.group(1)
    js_text = m.group(2)
    pos = m.start()
    lang_sections.append((pos, lang, js_text))

print(f"Found {len(lang_sections)} language sections")

# Find file headers with positions
file_headers = []
for m in re.finditer(r'## \d+\\?\) `([^`]+)`', translation_content):
    file_headers.append((m.start(), m.group(1)))

print(f"Found {len(file_headers)} file headers:")
for pos, name in file_headers:
    print(f"  {name} at position {pos}")

# Associate each lang section with the closest preceding file header
translations = {}
for pos, lang, js_text in lang_sections:
    best_file = None
    best_pos = -1
    for fpos, fname in file_headers:
        if fpos < pos and fpos > best_pos:
            best_pos = fpos
            best_file = fname
    if best_file:
        if best_file not in translations:
            translations[best_file] = {}
        translations[best_file][lang] = js_text
        print(f"Associated {lang} with {best_file}")
    else:
        print(f"Could not associate {lang} section at {pos}")

# Read base HTML files
base_files = {
    'Elected By Rule.html': '/Users/leandrodisconzi/repos/TheAgentStands/AI-Models/Elected By Rule.html',
    'Right Model, Right Job.html': '/Users/leandrodisconzi/repos/TheAgentStands/AI-Models/Right Model, Right Job.html',
    'The Denial Came First.html': '/Users/leandrodisconzi/repos/TheAgentStands/AI-Models/The Denial Came First.html',
    'The-Denial-Came-First-Vol-II.html': '/Users/leandrodisconzi/repos/TheAgentStands/AI-Models/The-Denial-Came-First-Vol-II.html',
    'The-Denial-Came-First-Vol-III.html': '/Users/leandrodisconzi/repos/TheAgentStands/AI-Models/The-Denial-Came-First-Vol-III.html',
}

base_htmls = {}
for name, path in base_files.items():
    with open(path, 'r', encoding='utf-8') as f:
        base_htmls[name] = f.read()

lang_suffix = {'de': 'de', 'fr': 'fr', 'pl': 'pl', 'sr-Latn': 'sr-Latn'}
lang_html = {'de': 'de', 'fr': 'fr', 'pl': 'pl', 'sr-Latn': 'sr-Latn'}

file_configs = {
    'Elected By Rule.html': {
        'tag_bg': '#ffb454', 'tag_color': '#2a1a05', 'badge_fill': '#2a1a05',
        'panel_color': '#ffd699', 'room_bg': '#1d1b24',
        'lamp_gradient': 'rgba(255,225,170,.26),rgba(255,225,170,0) 70%',
        'focus_color': '#ffb454', 'selected_bg': '#ffb454', 'selected_color': '#2a1a05', 'selected_border': '#ffb454',
    },
    'Right Model, Right Job.html': {
        'tag_bg': '#3ddc97', 'tag_color': '#0b2018', 'badge_fill': '#0b2018',
        'panel_color': '#8df0c0', 'room_bg': '#14211d',
        'lamp_gradient': 'rgba(190,255,225,.26),rgba(190,255,225,0) 70%',
        'focus_color': '#3ddc97', 'selected_bg': '#3ddc97', 'selected_color': '#0b2018', 'selected_border': '#3ddc97',
    },
    'The Denial Came First.html': {
        'tag_bg': '#ffb454', 'tag_color': '#2a1a05', 'badge_fill': '#2a1a05',
        'panel_color': '#ffd699', 'room_bg': '#1d1b24',
        'lamp_gradient': 'rgba(255,225,170,.26),rgba(255,225,170,0) 70%',
        'focus_color': '#ffb454', 'selected_bg': '#ffb454', 'selected_color': '#2a1a05', 'selected_border': '#ffb454',
    },
    'The-Denial-Came-First-Vol-II.html': {
        'tag_bg': '#ffb454', 'tag_color': '#2a1a05', 'badge_fill': '#2a1a05',
        'panel_color': '#ffd699', 'room_bg': '#1d1b24',
        'lamp_gradient': 'rgba(255,225,170,.26),rgba(255,225,170,0) 70%',
        'focus_color': '#ffb454', 'selected_bg': '#ffb454', 'selected_color': '#2a1a05', 'selected_border': '#ffb454',
    },
    'The-Denial-Came-First-Vol-III.html': {
        'tag_bg': '#ffb454', 'tag_color': '#2a1a05', 'badge_fill': '#2a1a05',
        'panel_color': '#ffd699', 'room_bg': '#1d1b24',
        'lamp_gradient': 'rgba(255,225,170,.26),rgba(255,225,170,0) 70%',
        'focus_color': '#ffb454', 'selected_bg': '#ffb454', 'selected_color': '#2a1a05', 'selected_border': '#ffb454',
    },
}

def parse_js_object(js_text):
    """Parse a JS object literal with unquoted keys into a Python dict"""
    strings = []
    def protect_strings(text):
        result = []
        i = 0
        while i < len(text):
            ch = text[i]
            if ch in ('"', "'") and (i == 0 or text[i-1] != '\\'):
                quote = ch
                j = i + 1
                while j < len(text):
                    if text[j] == quote and text[j-1] != '\\':
                        break
                    j += 1
                if j < len(text):
                    string_content = text[i:j+1]
                    placeholder = f'__STRING_{len(strings)}__'
                    strings.append(string_content)
                    result.append(placeholder)
                    i = j + 1
                    continue
            result.append(ch)
            i += 1
        return ''.join(result)
    
    def restore_strings(text):
        for idx, s in enumerate(strings):
            text = text.replace(f'__STRING_{idx}__', s)
        return text
    
    protected = protect_strings(js_text)
    protected = re.sub(r'([,\{\[]\s*)(\w+)(\s*:)', r'\1"\2"\3', protected)
    protected = re.sub(r'^\s*(\w+)(\s*:)', r'"\1"\2', protected, flags=re.MULTILINE)
    protected = re.sub(r',(\s*[}\]])', r'\1', protected)
    restored = restore_strings(protected)
    
    try:
        return json.loads(restored)
    except json.JSONDecodeError as e:
        print(f"JSON parse error at pos {e.pos}: {e}")
        print(f"Context: ...{restored[max(0,e.pos-80):e.pos+80]}...")
        return {}

def apply_translation(html, t, lang, config):
    """Apply translation to HTML"""
    # Replace title
    html = re.sub(r'<title>[^<]*</title>', f'<title>{t.get("title", "")}</title>', html)
    
    # Replace h1
    html = re.sub(r'<h1>[^<]*</h1>', f'<h1>{t.get("h1", "")}</h1>', html)
    
    # Replace sub - use DOTALL to match across <br> tags
    html = re.sub(r'<p class="sub">.*?</p>', f'<p class="sub">{t.get("sub", "")}</p>', html, flags=re.DOTALL)
    
    # Replace fine print
    html = re.sub(r'<p class="fine">.*?</p>', f'<p class="fine">{t.get("fine", "")}</p>', html, flags=re.DOTALL)
    
    # Replace badge text in SVG
    html = re.sub(r'<text class="badge"[^>]*>[^<]*</text>', 
                  f'<text class="badge" x="60" y="10" text-anchor="middle">{t.get("badge", "")}</text>', html)
    
    # Replace name
    html = re.sub(r'<div class="name">[^<]*</div>', 
                  f'<div class="name">{t.get("name", "")}</div>', html)
    
    # Replace buttons
    buttons = t.get('buttons', {})
    pp_text = buttons.get('pp', 'Pause')
    re_text = buttons.get('re', 'Replay')
    all_text = buttons.get('all', 'Play all five')
    
    html = re.sub(r'<button id="pp">[^<]*</button>', f'<button id="pp">{pp_text}</button>', html)
    html = re.sub(r'<button id="re">[^<]*</button>', f'<button id="re">{re_text}</button>', html)
    html = re.sub(r'<label><input type="checkbox" id="all">[^<]*</label>', 
                  f'<label><input type="checkbox" id="all"> {all_text}</label>', html)
    
    # Update lang attribute
    html = re.sub(r'<html lang="en">', f'<html lang="{lang_html[lang]}">', html)
    
    # Update CSS colors
    html = re.sub(r'--tag:#[0-9a-fA-F]+', f'--tag:{config["tag_bg"]}', html)
    html = re.sub(r'--room:#[0-9a-fA-F]+', f'--room:{config["room_bg"]}', html)
    html = re.sub(r'background:rgba\([0-9,]+\)\.26\),rgba\([0-9,]+,0\) 70%', 
                  f'background:{config["lamp_gradient"]}', html)
    html = re.sub(r'<rect x="26" y="-2" width="68" height="16" rx="3" fill="#[0-9a-fA-F]+">', 
                  f'<rect x="26" y="-2" width="68" height="16" rx="3" fill="{config["tag_bg"]}">', html)
    html = re.sub(r'<rect x="38" y="-2" width="44" height="16" rx="3" fill="#[0-9a-fA-F]+">', 
                  f'<rect x="38" y="-2" width="44" height="16" rx="3" fill="{config["tag_bg"]}">', html)
    html = re.sub(r'fill:#2a1a05', f'fill:{config["badge_fill"]}', html)
    html = re.sub(r'fill:#0b2018', f'fill:{config["badge_fill"]}', html)
    html = re.sub(r'#ffd699', config["panel_color"], html)
    html = re.sub(r'#8df0c0', config["panel_color"], html)
    html = re.sub(r'outline:3px solid #[0-9a-fA-F]+', f'outline:3px solid {config["focus_color"]}', html)
    html = re.sub(r'background:#[0-9a-fA-F]+;color:#2a1a05;border-color:#[0-9a-fA-F]+', 
                  f'background:{config["selected_bg"]};color:{config["selected_color"]};border-color:{config["selected_border"]}', html)
    html = re.sub(r'background:#[0-9a-fA-F]+;color:#0b2018;border-color:#[0-9a-fA-F]+', 
                  f'background:{config["selected_bg"]};color:{config["selected_color"]};border-color:{config["selected_border"]}', html)
    
    # Now replace the R array
    r_match = re.search(r'const R=\[([\s\S]*?)\];', html)
    if r_match and 'R' in t:
        r_json = json.dumps(t['R'], ensure_ascii=False)
        new_r_block = f'const R={r_json};'
        html = html[:r_match.start()] + new_r_block + html[r_match.end():]
    
    return html

# Process each file
output_dir = '/Users/leandrodisconzi/repos/TheAgentStands/AI-Models/translations'
os.makedirs(output_dir, exist_ok=True)

for filename, langs in translations.items():
    if filename not in base_htmls:
        print(f"Warning: No base HTML for {filename}")
        continue
        
    base_html = base_htmls[filename]
    config = file_configs[filename]
    
    for lang, js_text in langs.items():
        # Parse the translation
        t = parse_js_object(js_text)
        
        if not t or 'title' not in t:
            print(f"Could not parse translation for {filename} {lang}")
            continue
        
        # Apply translation
        translated_html = apply_translation(base_html, t, lang, config)
        
        # Generate output filename
        base_name = filename.replace('.html', '')
        output_filename = f'{base_name} - {lang_suffix[lang]}.html'
        output_path = os.path.join(output_dir, output_filename)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(translated_html)
        
        print(f"Created: {output_path}")

print("Done!")