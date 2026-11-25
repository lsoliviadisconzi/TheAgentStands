#!/usr/bin/env python3
"""
Fix the missing Vol-II and Vol-III translations by directly copying from AI-Models/translations/
"""

import os
import shutil

ROOT = '/Users/leandrodisconzi/repos/TheAgentStands'
TRANSLATIONS_DIR = os.path.join(ROOT, 'AI-Models', 'translations')
THEMES_DIR = os.path.join(ROOT, 'themes')

# Map of translation files to theme directories
VOL_II_LANGS = ['de', 'es', 'fr', 'it', 'pl', 'pt-BR', 'sr-Latn']
VOL_III_LANGS = ['de', 'es', 'fr', 'it', 'pl', 'pt-BR', 'sr-Latn']

def copy_vol_translations(vol_name, theme_dir_name, langs):
    """Copy Vol translations from translations dir to theme dir"""
    theme_path = os.path.join(THEMES_DIR, theme_dir_name)
    os.makedirs(theme_path, exist_ok=True)
    
    for lang in langs:
        src = os.path.join(TRANSLATIONS_DIR, f'{vol_name} - {lang}.html')
        dst = os.path.join(theme_path, f'{theme_dir_name} - {lang}.html')
        
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"Copied: {vol_name} - {lang}.html -> {theme_dir_name}/{theme_dir_name} - {lang}.html")
        else:
            print(f"WARNING: Source not found: {src}")

# Fix Volume II
copy_vol_translations(
    'The-Denial-Came-First-Vol-II',
    'The Denial Came First - Volume II',
    VOL_II_LANGS
)

# Fix Volume III
copy_vol_translations(
    'The-Denial-Came-First-Vol-III',
    'The Denial Came First - Volume III',
    VOL_III_LANGS
)

print("\nDone! Verifying...")
for theme in sorted(os.listdir(THEMES_DIR)):
    theme_path = os.path.join(THEMES_DIR, theme)
    if os.path.isdir(theme_path):
        files = [f for f in os.listdir(theme_path) if f.endswith('.html')]
        print(f"  {theme}/ ({len(files)} files)")