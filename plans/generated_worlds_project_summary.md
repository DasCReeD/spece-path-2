# Project & Expansion Summary: 10 Generated Worlds & World Builder

This document provides a comprehensive overview of the current state of the **SkyRoads WebGL Modern Remake** project and the detailed plan for the **10 Generated Worlds & World Builder** expansion.

---

## 1. Current Project State

The project is a high-fidelity, browser-based 3D recreation of the classic DOS game "Sky Roads", built using **Three.js**, **Vite**, and native HTML/CSS/JavaScript. It includes full touch controls for mobile, a custom spaceship garage, and custom procedural volumetric shaders.

### Architecture & Key Modules:
*   **[app.js](file:///c:/dev/Sky%20roads/app.js)**: The central game engine coordinator. Manages the state machine FSM (`menu`, `loading`, `level_select`, `ship_picker`, `playing`, `death`, `success`), triggers music/sound-effects, and orchestrates the rendering loop.
*   **[graphics.js](file:///c:/dev/Sky%20roads/graphics.js)**: Renders the 3D scene. Configures WebGL lighting, cameras, thruster particle trails, custom galaxy skyboxes, volumetric tunnel shaders, and cockpit bezel overlays.
*   **[physics.js](file:///c:/dev/Sky%20roads/physics.js)**: Handles 3D bounding box collision detection, lateral drift mechanics, speed metrics, gravity variables, and KeyboardController (which merges keyboard, touch overlay, and analog inputs).
*   **[levelLoader.js](file:///c:/dev/Sky%20roads/levelLoader.js)**: Parses binary level data (LZS files), sets up the level geometry, builds rounded box buffers, maps materials, and handles dynamic theme assignment.
*   **[levels.js](file:///c:/dev/Sky%20roads/levels.js)**: Houses the index mappings for the 30 classic levels (from `WORLD0.LZS` to `WORLD9.LZS`) and 31 Christmas Special levels.
*   **[preview.js](file:///c:/dev/Sky%20roads/preview.js)**: Powers the garage screen, allowing real-time customizable hull skins and accent paints on 3D ship models with high-DPI filtering.
*   **[audio.js](file:///c:/dev/Sky%20roads/audio.js)**: Handles procedural synth and sound effect playback.

### Existing Visual Themes (Indices 0–3):
1.  **Cyberpunk** (Index 0)
2.  **Industrial** (Index 1)
3.  **Alien** (Index 2)
4.  **Organic** (Index 3)
*Each theme defines terrain/obstacle diffuse and normal maps, emissive colors, metalness/roughness, and unique behavior decals.*

---

## 2. What We Intend to Build (10 Worlds Expansion)

The goal is to add a campaign of **10 new worlds** (containing 3 levels each, making **30 levels total**) grouped into a new campaign pack called `generated`. This expansion introduces custom procedural biomes, build-time map baking, programmatic playability checks, and an automated AI-driven asset generation pipeline.

### Core Architectural Additions:

### A. Main Menu & Campaign Selection (UI Integration)
*   **New Button**: A new CSS/HTML button `PLAY 10 NEW WORLDS` will be added to the main menu directly under the classic `PLAY` button.
*   **Menu Flow**: Clicking it enters the level grid view filtered for the new `generated` pack. Levels will display custom retro-futuristic titles (e.g., *Waveform Highway*, *Cryo Crests*, *Quantum Leap*).

### B. Seeded Build-Time Level Generator (`worldBuilder.js`)
*   **Deterministic RNG**: Uses the `mulberry32` seed generator. To prevent float representation differences across JS engines (V8 in Chrome vs. JavaScriptCore in Safari), levels are **baked at build-time** into a static JSON file (`data/generated_levels.json`) rather than generated on-the-fly on the client.
*   **Programmatic Solver (100% Playability Guarantee)**: A dev-script solver simulates a perfect run on each track before baking. It tracks speed, jump distance, and fuel depletion. If a track is unsolvable (e.g., gap too wide for current gravity, or insufficient fuel pads), the build fails.
*   **Resource Balancing**: Spawns fuel pads (blue) when calculated fuel levels dip below 35%.
*   **Asset Generator Agent (`asset-generator`)**:
    - Python script utilizing Google AI Studio (Imagen 3 / "nanobanana 2") REST requests to generate raw diffuse/normal/decal assets.
    - ComfyUI background removal coupling (`BiRefNet`) to achieve clean transparency.
    - Automatic Pillow-based fallback generation for immediate usability.
*   **Level Analyst Agent (`level-analyst`)**:
    - Node.js script `scratch/analyze_original_levels.js` that parses standard and Xmas Special level JSON maps.
    - Extracts probability distribution matrices for tile sequences, jump/gap lengths, hazard grouping sizes, and lane transition frequencies.
    - Outputs a design pattern profile (`data/level_patterns.json`) to seed the World Builder with organic human-like pacing and randomness weights.

### C. 10 Custom Biomes (Themes 4 to 13)
We are expanding the material list in `levelLoader.js` to include 10 new visually distinct, high-contrast themes:
1.  **The Visualizer Void (Theme 4)**: 90s audio visualizer motif, vector lines, equalizer bar obstacles.
2.  **Blue Ridge Ascents (Theme 5)**: High verticality, ridges, high gravity, vertical drops, and marker arches.
3.  **Thrill Sector (Theme 6)**: neon rollercoaster tracks, fast boost pads, minimal walls.
4.  **Hardware Core (Theme 7)**: Green supercomputer circuit boards, glowing circuitry lines, tight slalom routes.
5.  **Glitch Grid (Theme 8)**: Z-fighting textures, digital glitch overlays, flickering warning tiles.
6.  **Cryo-Stasis Tundra (Theme 9)**: Frozen sheets, slippery ice tracks, boundary bumpers.
7.  **Supernova Furnace (Theme 10)**: Lava rocks, high fuel drain rates, lava hazard grids.
8.  **Nebula Shallows (Theme 11)**: Cosmic fog, guidance neon strips, auditory beacons.
9.  **Quantum Spire (Theme 12)**: Floating geometric sky islands, low gravity, long jumps.
10. **Kinetic Pulse (Theme 13)**: Speed-restricted timing gates, braking sticky tiles, rotating gears.

### D. Asset Generation Agent & ComfyUI Pipeline
*   **Imagen 3 Integration**: Script `scratch/generate_comfy_assets.py` will pull the `GEMINI_API_KEY` from a gitignored `.env` file and make REST calls to generate high-resolution seamless tiles.
*   **ComfyUI & BiRefNet**: Raw outputs are sent to the local ComfyUI API (`http://127.0.0.1:8000`) where the **BiRefNet** model processes them to remove backgrounds and create transparency.
*   **Robust Fallback**: If the key is missing or ComfyUI is offline, the script generates highly-detailed procedural canvas textures via Pillow so the build never breaks.

---

## 3. Level Design Style Guide (The 27 Core Constraints)

The generator will strictly enforce the following 27 principles to preserve the classic gameplay feel and optimize flow state:

### I. Track Geometry & Grid Layout
1.  **Starting Platform**: The first 10 rows are completely flat and free of obstacles to allow acceleration.
2.  **Jump Trajectory**: Gaps (1-3 rows) are mathematically matched to gravity and speed velocity constraints.
3.  **Smooth Gravity Transitions**: Gravity is constant within a level, but scales gap lengths and obstacle layouts.
4.  **No Dead-Stop Walls**: Lateral crashes slide/rebound the ship instead of halting it.
5.  **Lateral Drift Space**: Slippery terrain (color 9) is placed in spans of at least 3 lanes for wide drifts.
6.  **Height Telegraphing**: Slopes precede jumps; flat zones follow drops to stabilize player speed.
7.  **Grid-Snapped Alignment**: Obstacles and tiles adhere strictly to the standard $2.0 \times 4.0$ unit grid.

### II. Tile Placement & Resource Economy
8.  **Rhythmic Resource Starvation**: Spawn blue fuel cells only when calculated remaining fuel drops below 35%.
9.  **Risk vs. Reward Boosts**: Boost pads are placed on dangerous outer edges or right before massive gaps.
10. **Hazard Grouping**: Burning tiles are grouped in clear checkered or block barriers, never scattered randomly.
11. **Terrain Brakes**: Sticky brown tiles are placed immediately before dense slalom tracks to bleed speed.
12. **Safe Landing Zones**: At least 3 rows following a jump are guaranteed flat and clean of hazards.

### III. Audio-Reactive Integration & Rhythm
13. **BPM-Synced Obstacles**: Major walls and arches are spaced at beat intervals (multiples of 8 or 16 rows).
14. **Audio-Telegraphed Events**: Visual scenery density matches song intensity changes.
15. **Pitch-Scaled Momentum**: Unobstructed long straights let the ship sound engine hum build to a peak before jumps.
16. **Rhythmic Inputs**: Slalom gates alternate left-right in rhythmic cadence.

### IV. Visual Readability & Cockpit Framing
17. **Protected Central Sightlines**: Crucial navigation paths stay in the center 5 lanes 85% of the time.
18. **High-Contrast Track Edges**: Vibrant, normal-mapped lane boundaries ensure visibility.
19. **Universal Color Language**: Sticky (brown/green), slippery (gray), fuel (blue), boost (green), burn (red).
20. **Blind Crest Mitigation**: Tunnel arches or pillars are placed at blind drop-offs to warn players.
21. **Anisotropic Clarity**: Straights allow long-distance previewing of upcoming hurdles.

### V. Engagement & Flow Maintenance
22. **Seamless Recovery**: Respawning places the ship on safe ground with a forward velocity boost.
23. **Escalating Complexity**: Level difficulty scales (Easy = simple slaloms, Hard = boost jumps over lava to ice).
24. **Micro-Rewards**: Trigger chimes and score multipliers on near-misses and clean jump landings.
25. **Landmark Orientation**: Landmark structures are rendered at the 50% and 100% track marks.
26. **Alternate Risk Routes**: Provide a slow-safe path vs. a fast-dangerous path.
27. **Optimal Line Trap**: Place fire hazards directly in front of the easiest route to a fuel refill.
