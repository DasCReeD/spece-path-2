🌌 SkyRoads Modern WebGL Remake
===============================

[![Tests](https://img.shields.io/badge/tests-455%20passed-brightgreen.svg)](#testing)
[![Tech Stack](https://img.shields.io/badge/tech--stack-Vite%20%7C%20Three.js%20%7C%20Web%20Audio-blueviolet.svg)](#architecture)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

🚀 **[Play the Live WebGL Demo Here!](https://dascreed.github.io/space-paths/)**

A modern, high-performance 3D WebGL clone of the classic 1993 DOS game **Sky Roads**, built using vanilla ES Modules, **Three.js** for hardware-accelerated 3D rendering, **Web Audio API** for real-time procedural sound synthesis, and **Vite** for a modern build pipeline.

Enjoy the classic high-speed stellar navigation with a polished, fully-responsive cyberpunk/synthwave user interface, interactive ship customized color/skin pickers, dynamic scenery, smooth chase camera logic, and procedural audio with absolutely zero external assets to download!

---

## 🚀 Quick Start & Setup

Get the game running locally in under a minute.

### 📦 Prerequisites
- **Node.js** (v18.x or higher recommended)
- **npm** (v9.x or higher)

### 🛠️ Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   cd "Sky roads"
   ```
2. Install all development and production dependencies:
   ```bash
   npm install
   ```

### 🏃 Running the Application

| Action | Command | Description |
|---|---|---|
| **Development** | `npm run dev` | Spins up the Vite dev server with Hot Module Replacement (HMR) at `http://localhost:3000`. |
| **Production Build** | `npm run build` | Bundles and minifies the application using `esbuild` into the `dist/` directory. |
| **Preview Build** | `npm run preview` | Serves the locally compiled production bundle from `dist/` for performance testing. |
| **Run Tests** | `npm run test` | Executes the complete test suite of **455 unit tests** using **Vitest**. |

---

## 🕹️ Gameplay Controls

Control your spacecraft with high precision using the keyboard, mouse, or an Xbox controller.

### ✈️ Flight Controls
* **Accelerate:** `W` or `ArrowUp` (increases forward speed)
* **Brake / Slow Down:** `S` or `ArrowDown` (reduces forward speed)
* **Steer Left:** `A` or `ArrowLeft` (moves lateral position left)
* **Steer Right:** `D` or `ArrowRight` (moves lateral position right)
* **Jump:** `Space` (initiates thruster leap over gaps and obstacles)
* **Mouse Flight Toggle:** Click the **MOUSE PLAY: ON/OFF** button in the main menu to steer and accelerate the ship using cursor movement.

### 🎮 Xbox Gamepad / Controller Controls
* **Accelerate:** `Right Trigger (RT)` (Default Button 7)
* **Brake:** `Left Trigger (LT)` (Default Button 6)
* **Jump:** `A Button` (Default Button 0)
* **Steer Left/Right:** D-pad Left/Right or Left Analog Stick (with 15% stick deadzone filtering)
* **Cycle Camera:** `Y Button` (Default Button 3)
* **Pause / Resume Game:** `Start Button` (Default Button 9)
* **Menu Navigation**:
  * Navigate options using D-pad or Left Analog Stick.
  * Select/Click option with `A Button` (Button 0).
  * Go Back/Cancel/Exit screen with `B Button` (Button 1).
* **Customize Mappings**: Open Settings, click **CONFIGURE 🎮**, select an action, and press any button on your gamepad to bind it. Custom mappings are persisted automatically to `localStorage`.

### 🎥 Camera Viewport Adjustments
* **Toggle Camera Mode (`C`):** Swaps between default smooth chase cam, closer cockpit view, and higher cinematic tracking perspectives.
* **Zoom In (`[`):** Bracket Left decreases camera follow distance.
* **Zoom Out (`]`):** Bracket Right increases camera follow distance.
* **Lower Height (`-`):** Minus key decreases camera elevation offset.
* **Raise Height (`=`):** Equal key increases camera elevation offset.

### 🖥️ Menu Navigation (No Mouse Needed)
* **Navigate Up/Down:** `W` / `S` or `ArrowUp` / `ArrowDown` (cycles through available buttons or selections)
* **Navigate Left/Right:** `A` / `D` or `ArrowLeft` / `ArrowRight` (moves across grid selections)
* **Select Option:** `Space` or `Enter` (activates highlighted menu item)

---

## 📐 Project Architecture & Module Structure

The project implements a clean, flat **hub-and-spoke architecture** with zero complex SPA framework overhead. `app.js` serves as the central game orchestrator importing and wiring specialized subsystems.

```mermaid
graph TD
    APP["app.js (GameManager)"] --> GFX["graphics.js (GraphicsEngine)"]
    APP --> PHY["physics.js (PhysicsEngine)"]
    APP --> AUD["audio.js (AudioSynthesizer)"]
    APP --> LVL["levelLoader.js (buildLevelAsync)"]
    APP --> DAT["levels.js (LEVEL_PACKS)"]
```

### 📂 Key Module Descriptions

*   **`app.js` (Game Orchestrator & State Controller)**
    Manages the overall game loop and coordinates the global finite state machine (`menu`, `loading`, `level_select`, `ship_picker`, `playing`, `death`, `success`). It updates the responsive DOM-based HUD gauges (telemetry for speed, fuel, oxygen, progress) and coordinates scene re-loading.
*   **`graphics.js` (Three.js Rendering Engine)**
    Sets up the WebGL renderer with anti-aliasing, shadow mapping, exponential fog, and tone mapping. It spawns the 2,000-star parallax skybox, sun disc, 3D low-poly procedural city flanking the roads, and manages complex particle systems for engine thrusters and explosive destruction.
*   **`preview.js` (3D Spaceship Garage Editor Preview Engine)**
    Operates an isolated WebGL canvas sandbox inside the editor page that loads custom geometry and skin textures dynamically in real time, supporting high-DPI scaling, sRGB standard color space conversions, and maximum hardware anisotropic filtering.
*   **`physics.js` (Physics Simulation & Collisions)**
    Simulates three-axis motion, drag, gravity scaling, and rebound logic. Collision detection uses highly-optimized axis-aligned bounding boxes (AABBs) to test intersections between the ship and level geometry, and resolves resource drainage and terrain effects (boost, sticky, slippery, burning, refill).
*   **`levelLoader.js` (Level Geometry Builder)**
    Asynchronously parses the level rows to build Three.js geometries. Instantiates flat segments, obstacles (half/full blocks), translucent glowing archways/tunnels, and maps palette colors to material values.
*   **`audio.js` (Web Audio API Synthesizer)**
    Procedurally synthesizes all game audio in real time directly inside the browser using native oscillators, noise buffers, and filters. **No audio sample downloads required!** Features an engine hum that scales pitch with velocity, jump sweeps, refill chimes, boost sweeps, wall collisions, landing rebounds, and victory arpeggios.
*   **`levels.js` (Static level pack data)**
    Contains compressed JSON data housing all 62 levels (31 Standard Pack + 31 Christmas Special Pack) complete with gravity modifiers, starting fuel/oxygen levels, and 16-color retro color palettes.

---

## 📖 Detailed Documentation

For a deep dive into the inner workings of the game, refer to our manuals under the `docs/` directory:

1.  **[Architecture Overview (`docs/architecture.md`)](./docs/architecture.md)**
    Contains block diagrams, complete data-flow charts of the game loop, level loading pipelines, and the internal Finite State Machine (FSM) diagrams.
2.  **[Module Map & Symbol Reference (`docs/module-map.md`)](./docs/module-map.md)**
    An exhaustive reference list documenting all exported classes, methods, signatures, parameters, constants, and layout specifications.

---

## 🎨 Special Terrain Colors & Tile Behaviors

Just like the classic DOS original, tile colors map to unique gameplay behaviors:

| Color | Terrain Type | Behavior & Special Effects | Glow Color |
| :---: | :--- | :--- | :---: |
| 🟢 | **Boost** | Massively accelerates ship forward speed beyond standard limits. | Lime Green |
| 🔵 | **Refill** | Instantly replenishes fuel and oxygen reserves back to maximum levels. | Bright Blue |
| 🟤 | **Sticky** | Friction that drops ship speed to a crawl and prevents jumping. | Dark Green |
| ⚪ | **Slippery** | Negates steering lateral friction, causing the ship to drift on ice. | Dark Gray |
| 🔴 | **Burning** | Dangerous. Ignites the hull, causing immediate death on touch. | Neon Red |

---

## 🏎️ Immersive 3D Visor Cockpit & Playtest Pipeline

### 🛸 Holographic Visor Cockpit HUD
*   **Physical Glassmorphic Casing**: Replaced the legacy DOM HUD overlay with an immersive, custom-extruded sloped dipped-wing glass visor console rendered directly inside the Three.js viewport parented to the camera. Built using a physical material (`MeshPhysicalMaterial`) featuring high transmission and a glossy clearcoat.
*   **100% Protected Sightlines**: Sits low in the frame (`y = -0.04`), keeping the central 40% of the screen completely clear for unobstructed spatial flight navigation.
*   **Mechanical & LCD Telemetry**:
    *   Speedometer dial needle rotates dynamically matching forward velocity percentage.
    *   Vertical dials scale based on fuel and oxygen reserves.
    *   Interactive status LEDs glow dynamically depending on active terrain status.
    *   LCD screen features CRT scanlines, blurred phosphor text shadow glows, and flashing alert loops for low-fuel and oxygen levels.
*   **Dynamic 3-Screen Alignment**: Uses panoramic converted bezel panels (`assets/no_Guage.png` and `assets/with_Guages.png`) to align three beautiful screen consoles symmetrically:
    *   *Left Screen*: Velocity Speedometer dial, vertical lifecycle bars.
    *   *Center Screen*: Double-column alphanumeric mission metrics.
    *   *Right Screen*: Top-down real-time path minimap scanner.

### 🤖 Automated Visual Playtesting Capture Pipeline
To maintain visual quality, the codebase features an automated design and screenshot playtest capture pipeline operating under `.agents/ui_design_pipeline/`:
*   **`playtest_capture_script.js`**: Node.js Puppeteer playtester that spins up Google Chrome, clicks through menus, switches to Cockpit View, accelerates, triggers boosts, simulates low fuel, and exports high-resolution snapshots to `scratch/playtests/`.
*   **`run_pipeline.js`**: Master controller that boots the Vite server locally, runs the Puppeteer playtester, and safely terminates the server upon exit.

---

## 🎨 Spaceship Garage & Dynamic Skin Customizer

The game includes a premium **Spaceship Customization Garage Overlay Panel** accessible directly from the settings drawer, empowering players to personalize their fleets:

### 🚀 Dual-Customization WebGL Pipeline
*   **12 High-Resolution Base Skins**: Select from 12 distinct graphical styles (Technical UV Default, Freelancer Weathered Copper, Lord Shadow Carbon Plating, Psionic Magic Shields, Shadee Forest Camo, Thor circuitry, Hull Plating, Road Metallic, and low-poly Majadroid 1–4 space patterns).
*   **Paint Color Overlay**: Customize the decal accent panel colors in real time. Swapping colors dynamically processes the red decals of the **currently selected texture** (rather than just the default skin) via color spectrum hue-saturation matrices.
*   **No Overlay Switch (`#ffffff`)**: Select "NO OVERLAY" represented by a dashed option card to see raw, untouched skin textures.

### 👓 High-DPI Max Anisotropy filtering
*   **Eliminates Oblique Angled Blur**: Applies maximum hardware anisotropic filtering and explicit linear mipmapping (`THREE.LinearMipmapLinearFilter`) to both the garage 3D preview model and active gameplay ship. This ensures that oblique surfaces—like the nose and wings extending forward from the cockpit view—remain razor-sharp instead of grainy or blurry.
*   **Full Pixel Ratio Scale**: Renderers set their viewport pixel limits directly to full native `window.devicePixelRatio`, guaranteeing supreme high-density visual fidelity on 4K, Retina, and tablet displays.

### 💾 Persistence & Storage Auto-Migration
*   **Dual Attributes Saving**: Separates and stores both base texture skin (`skyroads_selected_skin`) and custom accent paint color (`skyroads_selected_color`) in localStorage.
*   **Seamless Backward Migration**: Automatically runs a startup migrator that extracts legacy single-hex color values from `selected_skin` and assigns them to the new attributes with zero user disruption.
*   **Complete Keyboard & Mouse Ergonomics**: Garage sidebar allows switching models, skins, and colors instantly using cursor clicks or full keyboard controls (`W`/`S` navigation grid and `Enter`/`Space` selectors).

---

## 🛠️ Code Quality Guidelines & Best Practices

The codebase is built and maintained following strict engineering rules to guarantee stability, modularity, and readable structure:

### 🧩 Immutability First
*   State transitions and complex updates return new configurations or objects instead of mutating in place.
*   Spread operators and pure mapping functions are preferred over side-effect manipulations.

### 📐 High Cohesion & Low Coupling
*   Each script is strictly single-responsibility and focused.
*   File lengths are kept small and readable (all core modules are strictly within ~200 to ~400 lines, ensuring easy comprehension and high maintainability).

### 🛡️ Defensive Error Handling
*   No silent failures. All operations are wrapped in custom `try/catch` handlers with user-friendly warnings and logs.
*   Input validations at all boundaries protect against undefined keyboard events and runtime property lookups.

### 🧪 Test-Driven Development (TDD)
*   A robust test suite of **455 unit tests** covers every module (`physics`, `graphics`, `levelLoader`, `app`, `audio`, `cockpitConsole`, and `preview`).
*   Mocking is strictly implemented for browser APIs (like Three.js components and AudioContexts) using Vitest and jsdom.
*   Tests are deterministic, independent, and focus on validating functionality and robust edge-case handling.

---

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.
