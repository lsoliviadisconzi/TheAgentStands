#!/usr/bin/env python3
"""
Reorganize themes directory:
1. Rename themes/agent/ -> themes/The Agent Takes the Stand/
2. Rename themes/colours/ -> themes/Don't Argue With Colours/
3. Create new theme directories for the 5 AI-Models series
4. Copy all translation files with proper naming (full name - language.html)
"""

import os
import shutil
import re

# Base paths
ROOT = '/Users/leandrodisconzi/repos/TheAgentStands'
THEMES_DIR = os.path.join(ROOT, 'themes')
AI_MODELS_DIR = os.path.join(ROOT, 'AI-Models')
TRANSLATIONS_DIR = os.path.join(AI_MODELS_DIR, 'translations')

# Theme mapping: AI-Models base file -> Theme directory name
THEME_MAPPING = {
    'Elected By Rule.html': 'Elected By Rule',
    'Right Model, Right Job.html': 'Right Model, Right Job',
    'The Denial Came First.html': 'The Denial Came First',
    'The-Denial-Came-First-Vol-II.html': 'The Denial Came First - Volume II',
    'The-Denial-Came-First-Vol-III.html': 'The Denial Came First - Volume III',
}

# Existing themes that need renaming
RENAME_MAP = {
    'agent': 'The Agent Takes the Stand',
    'colours': "Don't Argue With Colours",
}

# Language code mapping from short to full (for existing themes)
LANG_CODE_MAP = {
    'en': 'en',
    'pt': 'pt-BR',
    'es': 'es',
    'it': 'it',
    'fr': 'fr',
    'sr': 'sr-Latn',
    'de': 'de',
    'pl': 'pl',
    'th': 'th',
}

# Language code mapping for new translations (already using full names)
NEW_LANG_MAP = {
    'pt-BR': 'pt-BR',
    'es': 'es',
    'it': 'it',
    'de': 'de',
    'fr': 'fr',
    'pl': 'pl',
    'sr-Latn': 'sr-Latn',
}

def clean_filename(name):
    """Clean a string to be safe for filename"""
    return name

def main():
    print("Starting theme reorganization...")
    
    # 1. Rename existing theme directories
    for old_name, new_name in RENAME_MAP.items():
        old_path = os.path.join(THEMES_DIR, old_name)
        new_path = os.path.join(THEMES_DIR, new_name)
        if os.path.exists(old_path):
            print(f"Renaming {old_name} -> {new_name}")
            if os.path.exists(new_path):
                print(f"  WARNING: {new_path} already exists, removing first")
                shutil.rmtree(new_path)
            shutil.move(old_path, new_path)
        else:
            print(f"  WARNING: {old_path} does not exist")
    
    # 2. Create new theme directories for AI-Models series
    for base_file, theme_name in THEME_MAPPING.items():
        theme_path = os.path.join(THEMES_DIR, theme_name)
        os.makedirs(theme_path, exist_ok=True)
        print(f"Created theme directory: {theme_name}")
        
        # Copy base HTML file as English version
        base_src = os.path.join(AI_MODELS_DIR, base_file)
        base_dst = os.path.join(theme_path, f'{theme_name} - en.html')
        if os.path.exists(base_src):
            shutil.copy2(base_src, base_dst)
            print(f"  Copied base English: {base_file} -> {theme_name} - en.html")
        else:
            print(f"  WARNING: Base file not found: {base_src}")
    
    # 3. Copy translation files from AI-Models/translations/ to appropriate theme directories
    if os.path.exists(TRANSLATIONS_DIR):
        for filename in os.listdir(TRANSLATIONS_DIR):
            if not filename.endswith('.html'):
                continue
            
            # Parse filename: "Base Name - lang.html"
            match = re.match(r'^(.+?)\s*-\s*(.+?)\.html$', filename)
            if not match:
                print(f"  WARNING: Could not parse filename: {filename}")
                continue
            
            base_name = match.group(1)
            lang = match.group(2)
            
            # Find which theme this belongs to
            theme_name = None
            for bf, tn in THEME_MAPPING.items():
                bf_base = bf.replace('.html', '')
                if bf_base == base_name:
                    theme_name = tn
                    break
            
            if not theme_name:
                print(f"  WARNING: Could not find theme for base name: {base_name}")
                continue
            
            # Determine the full language name for the filename
            full_lang = NEW_LANG_MAP.get(lang, lang)
            
            src = os.path.join(TRANSLATIONS_DIR, filename)
            dst = os.path.join(THEMES_DIR, theme_name, f'{theme_name} - {full_lang}.html')
            
            shutil.copy2(src, dst)
            print(f"  Copied: {filename} -> {theme_name}/{theme_name} - {full_lang}.html")
    
    # 4. Rename files in existing renamed themes (agent -> The Agent Takes the Stand, colours -> Don't Argue With Colours)
    for old_theme, new_theme in RENAME_MAP.items():
        theme_path = os.path.join(THEMES_DIR, new_theme)
        if not os.path.exists(theme_path):
            print(f"  WARNING: Theme path not found: {theme_path}")
            continue
            
        for filename in os.listdir(theme_path):
            if not filename.endswith('.html'):
                continue
            
            # Old format: "en.html", "pt.html", etc.
            lang_code = filename.replace('.html', '')
            full_lang = LANG_CODE_MAP.get(lang_code, lang_code)
            
            src = os.path.join(theme_path, filename)
            dst = os.path.join(theme_path, f'{new_theme} - {full_lang}.html')
            
            if src != dst:
                shutil.move(src, dst)
                print(f"  Renamed: {new_theme}/{filename} -> {new_theme} - {full_lang}.html")
    
    print("\nReorganization complete!")
    print("\nFinal structure:")
    for theme in sorted(os.listdir(THEMES_DIR)):
        theme_path = os.path.join(THEMES_DIR, theme)
        if os.path.isdir(theme_path):
            files = [f for f in os.listdir(theme_path) if f.endswith('.html')]
            print(f"  {theme}/ ({len(files)} files)")
            for f in sorted(files):
                print(f"    {f}")

if __name__ == '__main__':
    main()