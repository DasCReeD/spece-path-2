# SkyRoads WebGL — Progress Log

> **Last updated:** 2026-06-05

---

## Branch Status

| Branch | Commits | Status |
|--------|---------|--------|
| `main` | 24 | ✅ Stable, deploys to GitHub Pages |
| `feature/visual-ui-overhaul` | 25 (+1) | 🔄 Active — 118 files changed, 10,749 insertions |

---

## Commit History (main branch — 24 commits)

| # | Commit | Feature |
|---|--------|---------|
| 1 | `38e79c9` | ✅ Initial commit: SkyRoads WebGL recreation with Vitest unit tests |
| 2 | `aed7ab8` | ✅ Tests verification: All 19 unit tests passing |
| 3 | `685bc0e` | ✅ Comprehensive codemaps, architectural review, codebase review report |
| 4 | `8e21f54` | ✅ Default camera view: all the way out and up |
| 5 | `53a04a8` | ✅ Physical sloped dipped-wing cockpit, corner minimap, themed level skinning, skybox, playtest pipeline |
| 6 | `59865ac` | ✅ Fix landing rebound bounce loop, correct cockpit flight pitch, camera motion smoothing |
| 7 | `e833003` | ✅ Starfire Fighter starting ship, 3-column no-scroll garage, halved flight pitch |
| 8 | `0a82e91` | ✅ Fix garage sidebar columns, enable text-wrap for button/color picker cutoffs |
| 9 | `24026b0` | ✅ Spaceship Garage overhaul: high-fidelity texture selector, anisotropic rendering, cockpit bezel |
| 10 | `f0629bf` | ✅ Update module-map.md with preview.js module and revised signatures |
| 11 | `956cdf2` | ✅ PS2-style virtual analog stick, physics lane-snapping magnetism |
| 12 | `e42bc0e` | ✅ GitHub Pages automated deployment workflow, relative path support |
| 13 | `ec140a4` | ✅ Mobile dedicated views, movable touch controls customizer, D-pad option, cockpit HUD |
| 14 | `50940de` | ✅ Glowing GitHub repository back-link on main menu |
| 15 | `ce9939f` | ✅ Fix AudioContext state sync in RetroMusicSequencer, music gain boost |
| 16 | `837f9b7` | ✅ Music/SFX volume sliders, retro classic 8-bit sound mode |
| 17 | `593c0db` | ✅ OPL2 FM synthesizer integration with original 1993 SkyRoads sound assets |
| 18 | `e59bfe6` | ✅ Fix audio state-loading race by passing explicit gameplay flag to startMusic |
| 19 | `54af90f` | ✅ Sloped ramps, physics snapping, smooth tunnel transitions |
| 20 | `635b542` | ✅ Fix ramp landing collision by re-generating shipBox bounding box after snaps |
| 21 | `ce601f4` | ✅ Xbox gamepad support with menu navigation, button remapping UI, ramp collision fix |
| 22 | `ad64e20` | ✅ Fix level pack loading stall by importing JSON files as static asset URLs |
| 23 | `6e3cf67` | ✅ Bottom HUD toggle option, touch joystick vertical axis throttle/brake control |
| 24 | `adae570` | ✅ Top-right fullscreen toggle button for mobile/desktop |
| 25 | `bbc3432` | ✅ Autolane snap toggle and snap strength adjuster |
| 26 | `032b3f0` | ✅ Fix continuous ramp frontal collision and add slalom super boosts |
| 27 | `3e674f9` | ✅ Spawn ship centered on first valid road tile in middle of tile and calculate correct Y elevation |

### Changes in feature branch (+1 commit vs main):
- **118 files changed** — 10,749 insertions, 402 deletions
- 74 new themed textures (cyberpunk, industrial, organic, alien × road/obstacle/tunnel × diffuse/normal)
- 30 themed decal variants (boost, explosive, refill, slippery, slow, sticky × 5 themes)
- 6 OBJ ship models (fighter, hauler, scout, dreadnought, cruiser, tunnel_archway)
- ComfyUI/Trellis2 workflow files and documentation
- New test files (generate, playtest_run, shipStats, touchControls)
- Vitest setup with asset stub generation
- Major expansions to graphics.js, levelLoader.js, physics.js, index.html, index.css

---

## Untracked New Assets (not yet committed)

### 10 New Themes
core, furnace, glitch, pulse, ridge, shallows, spire, thrill, tundra, void
- Each with road/obstacle/tunnel diffuse+normal textures
- Each with 6 decal variants

### 30 Per-Level Asset Directories
`assets/custom/level_61/` through `assets/custom/level_90/`

### 5 GLB Ship Models
fighter.glb, hauler.glb, scout.glb, dreadnought.glb, racer.glb + tunnel_archway.glb

### 2 New Data Files
- `data/generated_levels.json` — 30 procedurally generated levels
- `data/level_patterns.json` — extracted statistical patterns from original levels

### 3 Additional Test Files
- `tests/analyze.test.js` — level analysis validation
- `tests/assets.test.js` — asset existence verification
- `tests/worldBuilder.test.js` — generated level data integrity

### Additional Untracked Files
- `worldBuilder.js` — procedural level generator (1,695 lines)
- `debug_coords.js` — Puppeteer debug automation
- `progress.md` — this file
- Various Blender files, reference images, and plan documents

---

## Test Suite Status

| Test File | Status |
|-----------|--------|
| app.test.js | ✅ |
| graphics.test.js | ✅ |
| physics.test.js | ✅ |
| levelLoader.test.js | ✅ |
| audio.test.js | ✅ |
| cockpitConsole.test.js | ✅ |
| touchControls.test.js | ✅ |
| shipStats.test.js | ✅ |
| gamepad.test.js | ✅ |
| ramps.test.js | ✅ |
| worldBuilder.test.js | ✅ |
| preview.test.js | ✅ |
| settingsToggles.test.js | ✅ |
| laneSnapToggles.test.js | ✅ |
| dynamicSkinning.test.js | ✅ |
| classicAudio.test.js | ✅ |
| generate.test.js | ✅ |
| playtest_run.test.js | ✅ |
| assets.test.js | ✅ |
| analyze.test.js | ✅ |

---

## Future Work

| Task | Priority | Status |
|------|----------|--------|
| VRAM garbage collection & memory optimization | P1 | ⏳ Planned |
| E2E browser testing with Playwright | P1 | ⏳ Planned |
| Merge `feature/visual-ui-overhaul` into `main` | P0 | ⏳ Pending |
| Commit untracked new theme assets (10 themes) | P0 | ⏳ Pending |
| Commit untracked data files and test files | P0 | ⏳ Pending |
| World Builder UI (in-game level editor) | P2 | ⏳ Planned |
| Extract shared `shipCatalog.js` module | P2 | ⏳ Planned |
| Module splitting (app.js, graphics.js, levelLoader.js) | P2 | ⏳ Planned |
