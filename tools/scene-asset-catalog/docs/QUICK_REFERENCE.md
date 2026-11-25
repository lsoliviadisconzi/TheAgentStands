# 🎨 Scene Asset Catalog — Quick Reference

## File Locations

| Purpose | Path |
|---------|------|
| Scene manifest | `content/scenes/manifest.json` |
| Scene definitions | `content/scenes/*.scene.json` |
| Asset manifest | `content/scenes/assets/manifest.json` |
| Asset definitions | `content/scenes/assets/*.asset.json` |

## Auto-Load Functions (call at startup)

```js
shAutoLoadScenes();   // loads scenes from content/scenes/manifest.json
shAutoLoadAssets();   // loads assets from content/scenes/assets/manifest.json
```

## Using an Asset in Scene Code

```js
svg = SH_ASSETS.<asset_id>.render(svg, {
  x: w*0.5,           // horizontal position (expression or number)
  y: bY-80,           // vertical position
  mt: mt,             // master time
  isN: isN,           // night mode boolean
  ol: 2.5,            // outline width
  color: '#FFD700',   // asset-specific color
  count: 15,          // asset-specific count
  talk: true          // asset-specific boolean
});
```

## List All Available Assets

```js
const assets = window.shListAssets();
// Returns: [{ id, name, icon, category, tags, desc, params }, ...]
```

## Asset Categories

| Category | Icon | Examples |
|----------|------|----------|
| `character` | 👤 | owl, pup, deer, fawn, princess, snowman |
| `prop` | 📦 | windmill, castle_ice, mushroom_patch |
| `environment` | 🌲 | pine_tree_snowy, oak_tree, grass_patch, flower_row |
| `fx` | ✨ | firefly_swarm, snowflakes, butterfly |
| `sky` | 🌌 | sun, moon, aurora, sand_dunes, canal_water |

## Adding a New Asset (4 steps)

1. Create `content/scenes/assets/<id>.asset.json`
2. Add `"<id>.asset.json"` to `content/scenes/assets/manifest.json`
3. Call `shAutoLoadAssets()` (or reload the Shaders room)
4. Use in scene code: `SH_ASSETS.<id>.render(svg, ctx)`

## Adding a New Scene (4 steps)

1. Create `content/scenes/<id>.scene.json`
2. Add `"<id>.scene.json"` to `content/scenes/manifest.json`
3. Call `shAutoLoadScenes()` (or reload the Shaders room)
4. Scene appears in the Shaders room scene list

## Code Runtime Variables

| Variable | Type | Description |
|----------|------|-------------|
| `svg` | string | SVG buffer — append and return |
| `w`, `h` | number | Canvas width / height |
| `bY` | number | Baseline Y (ground line) |
| `mt` | number | Master time (seconds × timeSpeed) |
| `w1`, `w2`, `w3` | number | Deterministic oscillators (0–1) |
| `isN` | boolean | Night mode |
| `ol` | number | Stroke outline width |
| `sc` | object | Scene color palette |
| `ctx` | object | Per-call parameters (assets only) |

## Common Gotchas

- **IDs must be unique** across all assets and scenes.
- **Always use template literals** for dynamic SVG values.
- **Never leave un-evaluated `${...}`** inside attribute values.
- **Malformed SVG aborts the preview loop** — validate output.
- **Update manifests** when adding/removing files, or they won't auto-load.
- **Use `ctx.param ?? default`** for robust parameter handling in assets.