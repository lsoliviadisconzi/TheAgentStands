# Narrations JSON Structure

This directory stores narration texts for each theme, language, and reel in JSON format.
This replaces extracting text from HTML theme files.

## File Structure

```
data/narrations/
├── index.json                    # Master index of all narrations
├── {theme-slug}/
│   ├── index.json                # Theme metadata + languages
│   └── {language}/
│       ├── index.json            # Language metadata + reels
│       └── {reel-slug}.json      # Per-reel narration data
```

## File Formats

### data/narrations/index.json
```json
{
  "themes": {
    "the-denial-came-first": {
      "title": "The Denial Came First",
      "languages": ["en", "it", "de", "pl", "sr-Latn", "fr", "es", "pt-BR"]
    },
    "dont-argue-with-colours": {
      "title": "Don't Argue With Colours",
      "languages": ["en", "it", "pl", "de", "sr-Latn", "pt-BR", "th", "es", "fr"]
    }
  }
}
```

### data/narrations/{theme-slug}/index.json
```json
{
  "theme": "the-denial-came-first",
  "title": "The Denial Came First",
  "languages": {
    "en": { "code": "en", "label": "English", "reelCount": 5 },
    "it": { "code": "it", "label": "Italiano", "reelCount": 5 }
  }
}
```

### data/narrations/{theme-slug}/{language}/index.json
```json
{
  "theme": "the-denial-came-first",
  "language": "en",
  "reels": [
    { "slug": "nobody-asked", "title": "Nobody Asked", "hook": "Nobody asked. They answered anyway.", "sceneCount": 3 },
    { "slug": "outside-jurisdiction", "title": "Outside Jurisdiction", "hook": "This is outside our jurisdiction.", "sceneCount": 3 }
  ]
}
```

### data/narrations/{theme-slug}/{language}/{reel-slug}.json
```json
{
  "theme": "the-denial-came-first",
  "language": "en",
  "reel": "nobody-asked",
  "title": "Nobody Asked",
  "hook": "Nobody asked. They answered anyway.",
  "stamp": "The denial came before the question.",
  "next": "Next: outside jurisdiction.",
  "scenes": [
    {
      "index": 0,
      "direction": "reading a statement nobody asked for",
      "text": "Nobody asked if we ignored the complaint. So, to clarify: we did not ignore the complaint.",
      "mood": "flat",
      "panel": ["question_asked = none", "denial_issued = yes"],
      "holdMs": 1300
    },
    {
      "index": 1,
      "direction": "",
      "text": "Nobody asked if someone is guiding us. We would like to confirm that no one is guiding us. Unsolicited. For the record.",
      "mood": "up",
      "panel": ["unsolicited_denials = 2"],
      "holdMs": 1300
    }
  ]
}
```

## Slug Generation

- Theme slug: lowercase, spaces → hyphens, remove special chars
- Reel slug: lowercase, spaces → hyphens, remove special chars, max 50 chars

## API Endpoints

- `GET /api/narrations` - List all themes with narration data
- `GET /api/narrations/:theme` - Get theme metadata + languages
- `GET /api/narrations/:theme/:language` - Get language metadata + reel list
- `GET /api/narrations/:theme/:language/:reel` - Get full reel narration
- `PUT /api/narrations/:theme/:language/:reel` - Update reel narration
- `POST /api/narrations/sync-from-themes` - Sync from HTML theme files (one-time migration)

## Usage in UI

The left drawer shows:
1. Theme list (from index.json)
2. When theme selected → Language list
3. When language selected → Reel list with scene previews
4. Click reel → Import to editor with full narration text pre-filled