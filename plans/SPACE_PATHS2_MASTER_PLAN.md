# SPACE PATHS — MASTER IMPLEMENTATION PLAN
### Consolidated Studio Directive for Antigravity IDE
**Version:** 2.0 (Council-Merged — Claude + ChatGPT synthesis)**
**Repo:** https://github.com/DasCReeD/space-paths
**Stack:** Three.js · Vite · Web Audio API · Vitest · ComfyUI MCP

---

## EXECUTIVE SUMMARY

The existing repo is **not a blank slate.** It is a working Three.js/Vite WebGL clone of SkyRoads with:
- 62 decoded original levels (31 Standard + 31 Xmas Special) in `levels.js`
- Hub-and-spoke architecture: `app.js → graphics.js / physics.js / audio.js / levelLoader.js`
- 349 passing Vitest unit tests
- Procedural Web Audio synthesis (zero external assets)
- Functional FSM: `menu → loading → level_select → ship_picker → playing → death → success`
- Existing terrain types: Boost (green), Refill (blue), Sticky (brown), Slippery (gray), Burning (red)

**The goal is to evolve this foundation into a console-quality, music-reactive, long-form 3D racing/platforming experience.**

**The governing design axiom:** *Platforming creates decisions. Racing creates momentum. Never let puzzle complexity destroy speed flow.*

Do not refactor what works. Extend it. Classic SkyRoads mode must remain playable at every checkpoint.

---

## PART 0 — CRITICAL CLARIFICATIONS (Read Before All Else)

### ComfyUI is a 2D pipeline — not a 3D mesh generator
ComfyUI generates images, textures, and concept sheets. It does **not** natively produce `.glb`, `.gltf`, or `.obj` geometry. Agent 3's scope is corrected accordingly:

- **ComfyUI delivers:** 2D concept reference sheets (top/front/side orthographic views), PBR texture maps (albedo, normal, roughness, emissive), skybox panoramas, UI art.
- **3D mesh pipeline (separate):** Options in priority order:
  1. **TripoSR / Stable Fast 3D node** — if available in your local ComfyUI install as an image-to-3D node, use it. Output will be `.obj` + textures, require post-processing.
  2. **Meshy.ai API** — automated image-to-3D, outputs `.glb` directly.
  3. **Placeholder geometry** — `THREE.BoxGeometry` / `THREE.ConeGeometry` composites until real meshes arrive.

Agent 3 is never blocked on 3D meshes before delivering 2D concept sheets + textures. Art never blocks gameplay.

### Antigravity IDE integration
All file paths in this plan use the Vite workspace root at `/space-paths`. If Antigravity has an `ai-context.json` or equivalent lock file, it must be initialized in **Week 1** to reference the existing files so no agent hallucinates a clean-slate scaffold. Example config:

```json
// .antigravity/ai-context.json
{
  "project": "space-paths",
  "existingModules": ["app.js","graphics.js","physics.js","audio.js","levelLoader.js","levels.js"],
  "testCommand": "npm test",
  "testCount": 349,
  "rule": "All 349 tests must pass after every commit. Never rename or delete existing exported functions."
}
```

### Classic Mode Preservation
Tag the current working game as a baseline before any modifications:

```bash
git tag classic-mode-baseline
```

Create `tests/baseline-classic-mode.test.js` that:
- Loads world 0 level 0 from the original `levels.js`
- Simulates 10 forward physics ticks
- Asserts ship position advances and fuel decreases
- Asserts no exceptions thrown

This test must always pass. If it ever breaks, stop all work and fix it first.

---

## PART 1 — STUDIO STRUCTURE & AGENT CHARTERS

### Agent 1 — Lead Gameplay Engineer (Core Mechanics & Physics)
**Files owned:** `physics.js` (extend only), `app.js` (FSM additions), `src/modern/shipClasses.js`, `src/modern/abilities.js`, `src/modern/rewindRespawn.js`
**Hard rules:** Never delete or rename existing `physics.js` exports. All additions are new functions or new exported classes. FSM additions hook into existing state names.

### Agent 2 — Lead Level Designer & QA (Trackmaster)
**Files owned:** `src/modern/trackSchema.js`, `src/modern/trackSegments.js`, `src/modern/trackGenerator.js`, `qa/navigator.js`, `docs/LEVEL_STYLE_GUIDE.md`, `docs/level-analysis.md`

### Agent 3 — Lead 3D Artist & Art Director (ComfyUI/MCP)
**Files owned:** `graphics.js` (material/shader additions), `assets/` directory, ComfyUI workflow JSON files in `comfyui-workflows/`
**Hard rule:** All ComfyUI requests are scoped to 2D output (images/textures). 3D mesh pipeline is explicitly named (TripoSR → Meshy.ai → placeholder fallback).

### Agent 4 — Audio Director
**Files owned:** `audio.js` (extend only — add `audioBus` export), `src/modern/musicEngine.js`, `src/modern/bpmSync.js`

### Meta-role: Studio Producer / Integrator
Not a fifth agent — this is the orchestration layer (you, running Antigravity). Responsibilities:
- Assigns tasks from the phase tables
- Runs `npm test` after each agent commit and holds work if tests break
- Resolves schema conflicts between agents by referring to Part 7 of this document
- Approves the graybox milestone before art work begins (see Phase 1 gate below)

**Coordination rule:** All inter-agent contracts are defined in `docs/contracts.md`. No agent may break an existing Vitest test. All new features require tests. Target: maintain >90% coverage.

---

## PART 2 — AGENT 1: GAMEPLAY ENGINEER IMPLEMENTATION PLAN

### 2.1 Incremental Physics Architecture
**Do not replace AABB physics.** Add a track-local coordinate system on top of it.

The key insight: ships drive on surfaces with varying normals, banks, and elevations. Rather than rewriting the physics engine into full rigid-body simulation on day one, introduce a local frame:

```
s      = forward distance along track center spline
lane   = lateral position (−1.0 left edge to +1.0 right edge)
h      = height above track surface
normal = surface normal vector (default: {0,1,0})
bank   = local roll angle (degrees, positive = right bank)
```

The existing AABB collision continues to work for tile boundaries. The new coordinate system handles the *feel* of driving on curved/banked geometry without rebuilding collision from scratch.

**Implementation steps (ordered):**

**Step 1 — Track Normal Vector System** (Phase 1)
- Add `trackNormal: {x, y, z}` to `TrackRow` schema (Part 7). Default: `{0,1,0}`.
- Physics tick: project ship velocity onto the plane defined by `trackNormal`. Apply gravity as:
  `gravityAccel * (1 - dot(shipUp, trackNormal))` for banked feel.
- This is additive to `physics.js` — new function `applyBankedGravity(shipState, trackNormal)`.

**Step 2 — Banked Curve Camera Roll** (Phase 1)
- In `graphics.js` camera follow logic, add `cameraRollAngle` that lerps toward `bankAngle * 0.4`.
  (40% of track bank — full bank causes nausea.)
- Use `THREE.Quaternion.slerp` with factor `dt * 3.0` per frame.

**Step 3 — Clothoid Curve Transitions** (Phase 2)
- Between straight and curved segments, use an Euler spiral (clothoid) transition to prevent sudden lateral acceleration discontinuities. The radius $R$ and bank angle $\theta$ satisfy:

$$\tan(\theta) = \frac{v^2}{g \cdot R}$$

- Implement as a `clothoidBlend(entryNormal, exitNormal, t)` lerp function over the transition block count defined in `TrackSegment.transitionBlocks`.

**Step 4 — Hill/Drop Geometry** (Phase 1)
- Extend `levelLoader.js` segment builder to accept `heightProfile: float[]` per row.
- Use `THREE.BufferGeometry` with vertex displacement, not separate meshes.

**Step 5 — Inversion Support** (Phase 2)
- Add `isInverted: boolean` to segment schema. When true, flip gravity sign over 0.5s lerp.
- Invert camera up-vector via `THREE.Quaternion.slerp` to `{0,-1,0}`.
- **Constraint:** Only Agent 2 places inverted segments with a mandatory 100-block approach ramp. Never auto-generate inversions.

### 2.2 Rewind / Respawn System
**New file:** `src/modern/rewindRespawn.js`

**Expanded state schema** (additions from council review — `activeEffects` and `currentSegmentId` are critical for restoring mid-segment states):

```js
// src/modern/rewindRespawn.js
export class RewindBuffer {
  constructor(capacitySeconds = 4, fps = 60) {
    this.maxFrames = capacitySeconds * fps;
    this.buffer = new Array(this.maxFrames);
    this.head = 0;
    this.size = 0;
  }

  push(shipState) {
    // Full state snapshot — every field needed for faithful restore
    // { pos, vel, rot, fuel, oxygen, activeEffects, currentSegmentId,
    //   rewindTokens, timestamp }
    this.buffer[this.head % this.maxFrames] = { ...shipState };
    this.head++;
    if (this.size < this.maxFrames) this.size++;
  }

  rewind(secondsBack) {
    const framesBack = Math.min(secondsBack * 60, this.size - 1);
    const idx = ((this.head - 1 - framesBack) + this.maxFrames) % this.maxFrames;
    return this.buffer[idx];
  }
}
```

**Integration in `app.js` FSM:**
- Push state every frame during `playing` state.
- On death trigger: FSM → `rewinding`.
  - Play rewind VFX: reverse thruster particles + brief time-reversal shader pass (invert-colors for 20 frames).
  - Restore full state from `rewind(3)` — including `activeEffects` and `currentSegmentId`.
  - Restore at **70% of recorded velocity** to maintain forward engagement, not dead stop.
  - FSM → `playing`.
- Rewind costs 1 "Rewind Token" (displayed in HUD). Ships start with 2–6 tokens (ship-stat-configurable).
- Zero tokens = traditional respawn at last checkpoint (no velocity restoration).

### 2.3 Ship Class Architecture
**New file:** `src/modern/shipClasses.js`

10 ship definitions. Stats on 1–10 scale. Geometry paths point to asset pipeline output (placeholder paths until Agent 3 delivers).

```js
export const SHIPS = [
  { id:'dart',     name:'Dart',     speed:9,  handling:7,  durability:3,  rewindTokens:2, abilities:['turbo'],                              geometryRef:'assets/ships/dart.glb',     visualHint:'ultra-sleek needle profile, minimal mass' },
  { id:'titan',    name:'Titan',    speed:4,  handling:3,  durability:10, rewindTokens:4, abilities:['doubleJump'],                         geometryRef:'assets/ships/titan.glb',    visualHint:'bulky armored brick, visible impact plating' },
  { id:'phantom',  name:'Phantom',  speed:7,  handling:9,  durability:5,  rewindTokens:3, abilities:['midAirDash','doubleJump'],            geometryRef:'assets/ships/phantom.glb',  visualHint:'angular stealth geometry, swept wings' },
  { id:'hauler',   name:'Hauler',   speed:3,  handling:4,  durability:9,  rewindTokens:5, abilities:[],                                     geometryRef:'assets/ships/hauler.glb',   visualHint:'cargo freighter silhouette, thrusters visible' },
  { id:'rapier',   name:'Rapier',   speed:10, handling:5,  durability:2,  rewindTokens:2, abilities:['turbo','superLongJump'],              geometryRef:'assets/ships/rapier.glb',   visualHint:'paper-thin fuselage, oversized single engine' },
  { id:'hornet',   name:'Hornet',   speed:6,  handling:10, durability:4,  rewindTokens:3, abilities:['midAirDash'],                         geometryRef:'assets/ships/hornet.glb',   visualHint:'insect-like strut frame, articulated fins' },
  { id:'bastion',  name:'Bastion',  speed:5,  handling:5,  durability:8,  rewindTokens:4, abilities:['doubleJump','turbo'],                 geometryRef:'assets/ships/bastion.glb',  visualHint:'balanced fortress shape, equal all dimensions' },
  { id:'wisp',     name:'Wisp',     speed:8,  handling:8,  durability:2,  rewindTokens:2, abilities:['doubleJump','midAirDash','superLongJump'], geometryRef:'assets/ships/wisp.glb', visualHint:'near-invisible translucent shell, glowing core' },
  { id:'colossus', name:'Colossus', speed:2,  handling:2,  durability:10, rewindTokens:6, abilities:[],                                     geometryRef:'assets/ships/colossus.glb', visualHint:'massive dreadnought, barely fits track width' },
  { id:'banshee',  name:'Banshee',  speed:7,  handling:6,  durability:6,  rewindTokens:3, abilities:['turbo','doubleJump','midAirDash'],    geometryRef:'assets/ships/banshee.glb',  visualHint:'spectral curved silhouette, trailing edge glow' }
];

// Lowest-performance profile used by QA Navigator for "must-pass" validation
export const BASELINE_SHIP = { speed:2, handling:2, durability:10, abilities:[], jumpHeight:1.0, dashDistance:0 };
```

### 2.4 Special Abilities — `src/modern/abilities.js`

**Double Jump:** On second `Space` press while airborne, apply `vel.y += jumpImpulse * 0.8`. Lock until landing. VFX: second thruster burst.

**Mid-Air Dash:** `Shift` while airborne: `vel.x += dashForce * inputLateral` (no Y). 0.25s cooldown. VFX: horizontal speed lines + camera FOV punch 75°→85°→75° over 0.15s. Audio: directional panning based on dash direction.

**Turbo/Boost:** Hold `E` to drain boost gauge (fills passively over 8s). `vel.z += turboAccel * dt`, clamp to `maxSpeed * 1.6`. VFX: engine cone elongates, screen edge chromatic aberration. Audio: sustained low rumble builds then releases.

**Super Long Jump:** `Space + Shift` simultaneously from ground. Applies full jump impulse + forward boost simultaneously for 3× horizontal coverage. VFX: full-ship motion blur frame. Audio: distinct triple-tone cue.

---

## PART 3 — AGENT 2: LEVEL DESIGN STYLE GUIDE & QA

### 3.1 Formal Level Design Style Guide
*(Full document to be committed as `docs/LEVEL_STYLE_GUIDE.md`. This section is the authoritative spec.)*

#### Governing Design Axiom
> **Platforming creates decisions. Racing creates momentum. Never let puzzle complexity destroy speed flow.**

The core tension to preserve from SkyRoads: it is a **puzzle at speed** — gaps are commitments, not reactions. You don't dodge; you pre-solve. The expansion must not become a pure reaction game.

#### The Player Mental Loop
Every challenge must follow this 4-beat rhythm:

**Read → Commit → Execute → Recover**

Example: *visual warning ahead → player picks a lane → banked jump over gap → wide landing strip*

The player must always see danger early enough to make a decision at racing speed — not after impact.

#### SkyRoads DNA to Preserve
- Fixed-width linear track (no branching by default on the main route)
- Gap width encodes required entry speed — gaps are math, not chaos
- Color tile vocabulary is the terrain grammar (boost/sticky/burn/refill)
- Oxygen/fuel forces forward momentum; it limits exploration and creates urgency
- Rule of Three: no more than 3 consecutive identical hazard types without a grammar break

#### Source Analysis: Original 62 Levels
Agent 2 must parse `levels.js` and output `docs/level-analysis.md` with:
- Gap frequency per world (gaps per 10 rows)
- Height variance histogram
- Burn tile density by world
- Fuel/oxygen starting values and typical depletion curves
- Most common tile sequence patterns (the "vocabulary" of original SkyRoads)

This analysis informs which original mechanics are worth preserving exactly, and which need scaling for long-form tracks.

#### Wipeout Injection (High-Speed Flow)
- **Banked curves:** Implemented as track-segment roll angle lerped over N blocks, signaled 3–4 blocks ahead by road-edge color shift (Cool Cyan = gentle sweep, Warning Amber = heavy braking zone).
- **Rhythm sections:** Boost pads spaced at musical beat intervals. At cruise speed and BPM `b`, block spacing = `(60/b) * cruiseBlocksPerSecond`.
- **Visual telegraph rule:** Every hazard must be visible for minimum **1.5 seconds at cruise speed** before contact. This is a hard generator constraint, not a suggestion.
- **Clothoid approach:** No abrupt direction changes. Every turn has an entry transition of at least `length / 3` blocks ramping into the apex.

#### Mario Kart Injection (Risk/Reward)
- **Optional bypass lanes:** Narrow secondary lanes on select segments. Harder entry but contain guaranteed oxygen refill or speed bonus.
- **Visual "tells" for shortcuts:** Slight color desaturation on a side segment signals navigable but unlit. Players learn this as a game grammar cue.
- **Oxygen scarcity:** Fuel/oxygen refill placements thin out in the track's second half, creating rubber-band tension in endurance runs.

#### Bank Angle Tiers
| Angle | Label | Usage |
|-------|-------|-------|
| 5–10° | Beginner | Opening sections, tutorials |
| 10–25° | Standard | Main track high-speed turns |
| 25–45° | Advanced | Expert sections, wall-ride sensation |
| 45°+ | Spectacle | One-time set piece moments, use sparingly |

#### Four Jump Categories
| Type | Purpose | Design rule |
|------|---------|-------------|
| Flow Jump | Maintains speed over a gap | Ramp leads into it; landing is wide |
| Precision Jump | Requires lane alignment | Only in mid/late sections; never blind |
| Risk/Reward Jump | Optional shortcut or boost route | Visually tempting, not required |
| Ability Jump | Requires double jump / dash / long jump | Tagged; always has a bypass route |

**Hard jump rule:** A jump must never begin blind unless it is a late-game expert challenge explicitly flagged as such. Before every major jump, give at least one of: ramp silhouette, lane lights, hazard color change, floating marker, audio cue, camera framing.

After a jump landing, give the player **0.5–1.5 seconds** before the next major input requirement. Never place lethal hazards on the first landing tile.

#### Combining Curves and Jumps
The signature "Space Paths" mechanic:

> **curved approach → banked ramp → airborne lane correction → visible landing strip**

Signature anti-pattern (never do this):

> ~~blind turn → instant gap → no landing preview~~

Use lights, arrows, or color bands on the track surface to indicate the correct landing lane while the player is airborne.

#### Hazard Pacing Formula
Hazards should be arranged like music:

**setup → rhythm → variation → release**

Example: `three easy gates → one offset gate → boost pad → jump gap → recovery straight`

A section should test one primary skill at a time:
- Speed control, lane choice, jump timing, air correction, hazard reading, shortcut bravery

Never stack all difficulty types simultaneously.

#### The 9-Movement Arc (Long-Form Track Structure)
A 3–5 minute track is structured as 9 "movements" like a song — not an endless obstacle hallway:

| # | Movement | Feel |
|---|----------|------|
| 1 | Intro Runway | Establish terrain grammar, flat, teach tile vocabulary |
| 2 | First Skill Lesson | First targeted hazard type, slow enough to read |
| 3 | Speed Section | First full throttle, boost pads, Wipeout DNA |
| 4 | Platforming Puzzle | SkyRoads DNA, speed drops, gap precision |
| 5 | Shortcut Fork | Risk/reward branch, both paths rejoin |
| 6 | Hazard Climax | All hazard types, maximum density |
| 7 | Recovery / Refill Zone | Breathing room, oxygen refill tiles |
| 8 | Final Mixed Challenge | Speed + platforming combined, earned difficulty |
| 9 | Finish Spectacle | Visual payoff, final jump or inversion into the finish |

A 1,500+ block endurance track runs this arc twice with escalating parameters on the second pass.

### 3.2 Parabolic Gap Validation Math
The generator must validate every gap against the physics:

$$L < \frac{v_{min}^2 \cdot \sin(2\alpha)}{g}$$

Where:
- $L$ = gap length in world units
- $v_{min}$ = minimum required entry speed for that ship class
- $\alpha$ = launch ramp angle (default: 15° for standard gaps)
- $g$ = current gravity scalar for the segment

If the gap requires a speed above the ship's maximum, the segment must either:
1. Be tagged `requiresAbility: 'superLongJump'` and have a bypass route, or
2. Have the gap length reduced by the generator.

### 3.3 Modern Track Schema
**New files:** `src/modern/trackSchema.js`, `src/modern/trackSegments.js`, `src/modern/trackGenerator.js`

The original SkyRoads row grid is preserved for classic mode. New tracks use the higher-level segment schema:

```js
// src/modern/trackSchema.js
export const TrackSegmentSchema = {
  type: 'straight|bankedCurve|jumpGap|drop|climb|hazardGate|shortcutSplit|inversion|cooldown',
  length: Number,            // block-rows
  width: Number,             // track columns (2–5)
  curveRadius: Number,       // meters, Infinity for straights
  bankAngle: Number,         // degrees
  transitionBlocks: Number,  // clothoid ramp length
  elevationStart: Number,    // Y world units
  elevationEnd: Number,
  requiredAbility: String,   // null | 'doubleJump' | 'midAirDash' | 'superLongJump'
  hazardPattern: Object,     // hazard type + timing params
  musicBeatTags: Number[],   // block indices where beat should land
  isInverted: Boolean,
  bypassRoute: Object        // null | nested TrackSegment for ability-bypass path
}
```

### 3.4 Procedural Generator — `src/modern/trackGenerator.js`

```js
export function generateTrack(seed, config) {
  // config: { type:'standard'|'endurance'|'challenge',
  //           difficulty:1-10, shipAbilities:string[], musicBPM:number }
  // Returns: TrackData (Part 7 schema)
}
```

**Algorithm:**
1. Seed with `mulberry32(seed)` (deterministic, no deps).
2. Select movement sequence using a Markov chain.
   - `PLATFORMING_PUZZLE` cannot follow `PLATFORMING_PUZZLE`.
   - `CLIMAX_SPRINT` appears once, final 25% of track only.
   - After `HAZARD_GAUNTLET`, next section must be `COOLDOWN`.
3. Per section: run section generator with seeded RNG.
4. Apply gap validation math (3.2) to every gap segment.
5. Place boost pads at beat-aligned block indices: `Math.round(blockIdx / (BPM/60 * trackSpeed))`.
6. Run QA Navigator (3.5). If fail, increment seed, retry up to 20 times. Throw if all fail.

### 3.5 Automated QA Navigator — `qa/navigator.js`

```js
export class TrackNavigator {
  constructor(trackData, shipProfile) { }

  simulate() {
    // BFS over block-grid state: { col, airborne, airFrames, velocity, fuel, oxygen }
    // Returns: { navigable:bool, failPoints:[{row,col,reason}],
    //            completionTimeMs:number, pathsTested:number }
  }
}
```

**Every generated track must pass all 8 QA gates:**

| Gate | Test |
|------|------|
| 1 | Default (BASELINE_SHIP) can finish the track |
| 2 | Slowest ship can finish the track |
| 3 | Fastest/lowest-handling ship can finish the track |
| 4 | All required jumps are physically reachable (parabolic math check) |
| 5 | Landing zones are wide enough (≥1 column guaranteed safe) |
| 6 | Fuel/oxygen refill placements ensure completion without running dry |
| 7 | All shortcuts are optional — main path is beatable without them |
| 8 | All hazards are visible ≥1.5s at cruise speed before contact |

Reject a seed if any required path demands perfect inputs for more than a consecutive 5-block "expert segment."

**Vitest integration:**
```js
// qa/navigator.test.js
it('100 random seeds produce navigable standard tracks', () => {
  for (let seed = 0; seed < 100; seed++) {
    const track = generateTrack(seed, { type:'standard', difficulty:5 });
    const result = new TrackNavigator(track, BASELINE_SHIP).simulate();
    expect(result.navigable).toBe(true);
  }
});
```

---

## PART 4 — AGENT 3: ART DIRECTION & ASSET PIPELINE

### 4.1 Visual Style: "Neon Brutalist Space"
- **Palette:** Deep void black (#080810) base. Neon accent per world (cyan, magenta, amber, green, violet). Track surfaces: dark gunmetal with emissive edge trim. Ships: matte primary body + single saturated accent.
- **Influence:** Wipeout 2097/XL — clean, geometric, zero organic forms.
- **Anti-patterns:** No lens flare spam, no bloom overdrive, no chromatic aberration at rest state.

### 4.2 ComfyUI Scope — 2D Deliverables Only

All ComfyUI requests target 2D output. Issue jobs in this format:

```json
{
  "workflow": "ship_concept_sheet",
  "params": {
    "ship_id": "dart",
    "prompt": "spacecraft concept sheet, top view, front view, side view, ultra-sleek needle profile, matte dark metal hull, single cyan engine glow stripe, Wipeout XL aesthetic, orthographic, white background, 4k",
    "negative_prompt": "perspective distortion, organic, round, cartoon, chrome, reflective, lens flare",
    "output_format": "png",
    "resolution": "2048x2048"
  }
}
```

Separate PBR texture job per ship:
```json
{
  "workflow": "pbr_texture_gen",
  "params": {
    "prompt": "spacecraft hull texture, dark gunmetal base, subtle cyan emissive edge trim, sci-fi panel lines, PBR albedo map",
    "maps": ["albedo", "normal", "roughness", "emissive"],
    "resolution": "512x512"
  }
}
```

### 4.3 3D Mesh Pipeline (Post-ComfyUI)

```
ComfyUI concept sheet (PNG)
  ↓
TripoSR / Stable Fast 3D node (if available locally)
  OR Meshy.ai API (https://www.meshy.ai) → upload concept sheet → download .glb
  ↓
Post-process script (Agent 3 writes this):
  - Decimate to ≤2,500 tris per ship
  - Verify UV unwrap
  - Export as .glb with embedded PBR textures
  ↓
assets/ships/{id}.glb
```

**Fallback while meshes are pending:**
Each ship gets a `THREE.Group` placeholder assembled from primitives matching the `visualHint` description in `SHIPS[]`. These are swapped out by the asset loader when the real `.glb` is ready — no code changes needed, only file replacement.

### 4.4 Asset Manifest

| Asset | Format | Poly Budget | Texture |
|-------|--------|-------------|---------|
| 10 ship models | `.glb` | ≤2,500 tris | 512×512 PBR (albedo + normal + roughness + emissive) |
| Track block set (12 types) | `.glb` | ≤400 tris | 256×256 tileable, packed atlas |
| Animated hazards (6 types) | `.glb` + keyframes | ≤600 tris | 256×256 |
| Skybox set (5 worlds) | equirect `.png` or `.exr` | N/A | 2048×1024 |
| Particle sprites (8 types) | `.png` atlas | N/A | 512×512 |

### 4.5 WebGL Optimization Budget (Non-Negotiable)
1. All track blocks use `THREE.InstancedMesh`. Max draw calls per frame: **50**.
2. All block textures in a single 2048×2048 atlas. One material for the entire track.
3. Ships use 3 LOD levels (`THREE.LOD`): full at 0–30m, 50% at 30–80m, 20% at 80m+.
4. Max active particles: 800 (engine: 200, explosion: 400, debris: 200).
5. Only the player ship casts shadows. Static geometry uses baked AO texture.
6. **Target:** Stable 60 FPS on mid-range mobile GPU (iPhone 13 WebGL2). Profile with `stats.js` every build.

### 4.6 Music-Reactive Visual Effects

Subscribe to `audioBus` events from `audio.js` (see Part 5):

```js
// In graphics.js
import { audioBus } from './audio.js';

audioBus.on('beat', ({ bpm, intensity, bands }) => {
  trackEdgeMaterial.emissiveIntensity = 0.5 + intensity * 1.5;
  starField.material.uniforms.scale.value = 1.0 + intensity * 0.05;
});

audioBus.on('bassHit', ({ magnitude }) => {
  camera.fov = THREE.MathUtils.lerp(camera.fov, 76 + magnitude * 4, 0.3);
  camera.updateProjectionMatrix();
});
```

---

## PART 5 — AGENT 4: AUDIO DIRECTOR IMPLEMENTATION PLAN

### 5.1 Audio Bus — Extend `audio.js`

Add a named export to the **existing** `audio.js`. Do not create a parallel audio system.

```js
// Append to audio.js exports
export const audioBus = {
  _listeners: {},
  on(event, cb) {
    (this._listeners[event] = this._listeners[event] || []).push(cb);
  },
  off(event, cb) {
    this._listeners[event] = (this._listeners[event] || []).filter(fn => fn !== cb);
  },
  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }
};
```

All music-reactive connections go through `audioBus`. This is the single defined contract between audio and graphics. No other interface is permitted.

### 5.2 Music Engine — `src/modern/musicEngine.js`

Separate from the existing SFX synthesizer. Handles long-form procedural music tracks.

```js
export class MusicEngine {
  constructor(audioCtx, audioBus) { }

  loadTrack(trackId) { }  // selects a procedural track definition
  play(startOffset = 0) { }
  pause() { }
  getCurrentBPM() { }

  // Internal: fires audioBus events
  // 'beat': { bpm, intensity, bands:{bass,mid,high} }
  // 'bassHit': { magnitude }
  // 'drop': { }
  // 'buildUp': { intensity }
}
```

**Critical implementation note:** Use `audioCtx.currentTime` as the beat clock ground truth — never accumulate `requestAnimationFrame` deltas. This prevents drift on long endurance tracks.

### 5.3 Procedural Track Specifications

8 tracks for different contexts:

| ID | Name | BPM | Key | Feel |
|----|------|-----|-----|------|
| `void_protocol` | Void Protocol | 128 | Am | Dark minimal techno |
| `neon_corridor` | Neon Corridor | 140 | Dm | Driving synthwave |
| `orbital_decay` | Orbital Decay | 132 | Em | Tense atmospheric |
| `pulse_driver` | Pulse Driver | 150 | Gm | Peak aggression |
| `crystal_grid` | Crystal Grid | 120 | F#m | Melodic/euphoric |
| `ghost_signal` | Ghost Signal | 136 | Bm | Haunted/mysterious |
| `apex_run` | Apex Run | 160 | Cm | Final stage energy |
| `zero_point` | Zero Point | 95 | Am | Title/ambient |

**Synthesis approach (Web Audio API — zero sample files):**
- Bass: Sawtooth `OscillatorNode` → lowpass `BiquadFilterNode` (200Hz) → gain envelope
- Lead: Square `OscillatorNode` → `WaveShaperNode` (mild distortion) → delay → convolver reverb (procedural IR)
- Arpeggio: Scheduled oscillator sequence via `audioCtx.currentTime + noteOffset`
- Kick: Sine oscillator freq sweep 120→40Hz over 80ms + noise burst
- Hi-hat: White noise → highpass filter (8kHz) → short gain envelope

### 5.4 BPM Sync — `src/modern/bpmSync.js`

```js
export class BPMSync {
  constructor(audioCtx, bpm) {
    this.beatInterval = 60 / bpm;
    this.nextBeat = audioCtx.currentTime;
    this.beatCount = 0;
  }

  tick(currentTime) {
    if (currentTime >= this.nextBeat) {
      this.nextBeat += this.beatInterval;
      return this.beatCount++;
    }
    return null; // no beat this frame
  }
}
```

### 5.5 New SFX (Additions to Existing `audio.js`)

Existing SFX are preserved. New additions only:

| SFX ID | Trigger | Synthesis note |
|--------|---------|----------------|
| `sfx_double_jump` | 2nd jump in air | Higher-pitched sweep, distinct from single jump |
| `sfx_dash` | Mid-air dash | Short percussive whoosh, L/R panning by direction |
| `sfx_rewind` | Rewind activation | Reversed engine hum + descending glitch pitch sweep |
| `sfx_turbo_charge` | Turbo held | Sustained rumble that builds then releases |
| `sfx_inversion_enter` | Enter inverted segment | Pitch shift + room reverb coefficient change |
| `sfx_shortcut_gate_open` | Gate opens | Resonant metallic click |
| `sfx_shortcut_gate_close` | Gate closes | Same reversed |
| `sfx_death_by_burn` | Burn tile death | Crackling + rapid pitch fall (distinct from wall collision) |

---

## PART 6 — PHASED EXECUTION PLAN

### ⭐ GRAYBOX MILESTONE (Gate Before Phase 2 Art Work)
> **Do not spend serious time on ComfyUI ships or skyboxes until the graybox feels fun.**
> The first real milestone is: a long-form track with curves, hills, jumps, boost pads, and working rewind. Once the movement loop works, Agent 3 and Agent 4 polish it.

---

### Phase 0 — Foundation Audit & Classic Mode Tag (Week 1)
**All agents before writing a line of new code:**

1. `git tag classic-mode-baseline` — tag current state
2. Create `tests/baseline-classic-mode.test.js` — must pass forever
3. Agent 1: Audit `physics.js` → `docs/physics-contract.md`
4. Agent 2: Parse `levels.js` (62 levels) → `docs/level-analysis.md`
5. Agent 3: Inventory `graphics.js` draw calls, materials → `docs/graphics-contract.md`
6. Agent 4: Audit `audio.js` synthesis nodes, existing event hooks → `docs/audio-contract.md`
7. Create `.antigravity/ai-context.json` (see Part 0)
8. Create `docs/contracts.md` with all schemas from Part 7

**Gate:** All 4 contract docs + baseline test committed. `npm test` passes (349 tests). No Phase 1 work begins until this gate clears.

---

### Phase 1 — Graybox Core Systems (Weeks 2–4)
**Priority: Playable graybox with rewind, one modern track, ship selector.**

| Task | Agent | Output | Tests |
|------|-------|--------|-------|
| Classic mode baseline test | A1 | `tests/baseline-classic-mode.test.js` | Permanent |
| Ship class system | A1 | `src/modern/shipClasses.js` | 100% (pure data) |
| Rewind buffer + FSM hook | A1 | `src/modern/rewindRespawn.js` | RingBuffer unit tests |
| Track normal vector physics | A1 | `physics.js` additive | 5 new tests |
| Level analysis doc | A2 | `docs/level-analysis.md` | N/A |
| Style Guide document | A2 | `docs/LEVEL_STYLE_GUIDE.md` | N/A |
| Track schema definition | A2 | `src/modern/trackSchema.js` | Schema validation tests |
| Level generator v0.1 (flat + hills) | A2 | `src/modern/trackGenerator.js` | 50-seed test |
| QA Navigator v0.1 | A2 | `qa/navigator.js` | Gates 1, 4, 5 (see 3.5) |
| audioBus export | A4 | `audio.js` addition | Bus unit tests |
| BPM sync module | A4 | `src/modern/bpmSync.js` | Timing accuracy tests |
| Music Engine v0.1 | A4 | `src/modern/musicEngine.js` | Track `void_protocol` |
| Beat-reactive emissives | A3+A4 | `graphics.js` addition | Manual QA |
| Placeholder ship geometries | A3 | `assets/ships/*.placeholder.js` | Visual only |

**Phase 1 / Graybox Milestone:** Select any of 10 ships (primitive placeholders), play a generated 600-block modern track, die, rewind, hear beat-reactive audio. All 349+ tests pass.

---

### Phase 2 — Abilities & Real 3D Geometry (Weeks 5–8)
**Gate: Graybox milestone achieved and approved before this phase begins.**

| Task | Agent | Notes |
|------|-------|-------|
| All 4 abilities | A1 | `src/modern/abilities.js` |
| Banked curve physics + camera roll | A1 | Clothoid transitions |
| Inversion physics | A1 | Gravity flip, 100-block approach enforced |
| ComfyUI concept sheets × 10 ships | A3 | 2D ortho reference sheets |
| ComfyUI PBR textures × 10 ships | A3 | albedo/normal/roughness/emissive |
| TripoSR/Meshy.ai mesh generation | A3 | 10 × `.glb`, ≤2,500 tris |
| ComfyUI track block textures | A3 | 12-type block atlas |
| Level generator (banked curves) | A2 | Add curve section type |
| Level generator (shortcut forks) | A2 | Branch logic |
| QA Navigator (ability-aware) | A2 | All 8 gates active |
| Music tracks 2–5 | A4 | World-specific |
| New SFX × 8 | A4 | All additions from 5.5 |

**Phase 2 Milestone:** Full ability set, real ship models, 3 world environments, shortcut forks working.

---

### Phase 3 — Content, Polish & Release (Weeks 9–12)

| Task | Agent | Notes |
|------|-------|-------|
| 10 curated standard tracks | A2 | Hand-tuned generator output |
| 3 endurance tracks (1,500+ blocks) | A2 | Full 9-movement arc × 2 |
| Animated hazard models × 6 | A3 | ComfyUI → TripoSR pipeline |
| 5 world skyboxes | A3 | ComfyUI equirect panoramas |
| HUD polish | A1+A3 | Speed, fuel, O2, rewind tokens, segment minimap |
| Music tracks 6–8 + title + credits | A4 | Full soundtrack |
| Full audio mix pass | A4 | Volume balance, spatial audio |
| Performance optimization pass | A3 | Hit 60fps mobile WebGL |
| Vitest suite expansion | All | Target: 600+ tests |
| `docs/` final update | All | Architecture, module-map, player guide |

---

## PART 7 — CONTRACTS & INTER-AGENT INTERFACES

These schemas must not change without all affected agents acknowledging. Source of truth: `docs/contracts.md`.

### TrackData Schema (A2 → A1, A3, A4)
```js
{
  id: string,
  name: string,
  worldId: 0..7,
  musicTrackId: string,
  bpm: number,
  // Legacy: rows[] format used by classic mode levels in levels.js (unchanged)
  // Modern: segments[] format used by trackGenerator.js output
  segments: TrackSegment[],  // see trackSchema.js
}
```

### ShipState Schema (A1 → A2 QA, A3 particles, A4 audio)
```js
{
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  rot: THREE.Quaternion,
  speed: float,            // 0.0–1.0 normalized
  fuel: float,             // 0.0–1.0
  oxygen: float,           // 0.0–1.0
  isAirborne: bool,
  activeAbility: string|null,
  activeEffects: string[],  // e.g. ['boost','sticky'] — needed for rewind restore
  currentSegmentId: string, // needed for rewind restore to correct track position
  rewindTokens: int,
  timestamp: DOMHighResTimeStamp
}
```

### AudioEvent Schema (A4 → A3 via audioBus)
```js
// audioBus.emit('beat', { bpm, intensity, bands })
// audioBus.emit('bassHit', { magnitude })
// audioBus.emit('drop', {})
// audioBus.emit('buildUp', { intensity })
{
  bpm: number,
  intensity: float,        // 0.0–1.0
  bands: { bass: float, mid: float, high: float },  // 0.0–1.0 each
  magnitude?: float        // for bassHit only
}
```

---

## PART 8 — CRITICAL RISKS & MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|------------|
| ComfyUI cannot produce 3D meshes | **Critical** | Part 0 corrects scope. ComfyUI = 2D only. TripoSR node or Meshy.ai API for 3D. Placeholder geometry until either is available. |
| 349 existing tests broken by changes | High | All changes are additive. Never delete/rename existing exports. Baseline test added in Phase 0. |
| Inversion physics causing motion sickness | High | Inversions only in hand-placed segments. 100-block approach ramp mandatory. Never auto-generate. |
| Graybox milestone never declared "fun" | High | Producer/Integrator decides this gate. Set a hard date: if not fun by end of Week 4, scope down (remove inversions or forks) and proceed. |
| QA navigator too slow at scale | Medium | Run in Web Worker. Cache results by seed hash in localStorage. |
| Web Audio blocked on mobile until gesture | Medium | Existing `audio.js` pattern handles this. Replicate pattern in `musicEngine.js`. |
| Beat sync drift on endurance tracks | Medium | Use `audioCtx.currentTime` as ground truth. Never accumulate rAF deltas for beat math. |
| Antigravity IDE undefined behavior | Medium | Part 0 defines `ai-context.json` format. If Antigravity ignores it, fall back to explicit file-by-file prompting using this doc as the spec. |

---

## PART 9 — IMMEDIATE FIRST ACTIONS FOR ANTIGRAVITY IDE

Execute these in order. No skipping. No reordering.

```
1.  git tag classic-mode-baseline
2.  git checkout -b feature/phase1-foundation
3.  Create .antigravity/ai-context.json  (see Part 0 for content)
4.  Create docs/contracts.md             (ShipState, TrackData, AudioEvent from Part 7)
5.  Create tests/baseline-classic-mode.test.js
6.  Run: npm test  → must show 349 passing, new test passing
7.  Create src/modern/shipClasses.js     (10 ship defs, BASELINE_SHIP export)
8.  Create src/modern/rewindRespawn.js   (RewindBuffer class)
9.  Create src/modern/trackSchema.js     (TrackSegmentSchema definition)
10. Create src/modern/trackGenerator.js  (generateTrack stub)
11. Create qa/navigator.js               (TrackNavigator stub)
12. Create qa/navigator.test.js          (100-seed test stub, currently skipped)
13. Add audioBus export to audio.js      (3 lines — on/off/emit)
14. Create src/modern/bpmSync.js         (BPMSync class)
15. Create src/modern/musicEngine.js     (MusicEngine stub)
16. Run: npm test  → all tests must pass
17. Commit: "Phase 0 complete: foundation audit, classic tag, all stubs"
```

Only after all tests green: begin Phase 1 task table, top-to-bottom.

---

## APPENDIX A — TARGET FILE STRUCTURE (END STATE)

```
space-paths/
├── index.html
├── index.css
├── vite.config.js
├── package.json
├── .antigravity/
│   └── ai-context.json           # NEW: Antigravity IDE context lock
├── app.js                        # (extended — FSM additions)
├── graphics.js                   # (extended — audioBus subscriber, instanced mesh)
├── physics.js                    # (extended — trackNormal, applyBankedGravity)
├── audio.js                      # (extended — audioBus export added)
├── levelLoader.js                # (extended — heightProfile support)
├── levels.js                     # (unchanged — original 62 levels)
├── src/
│   └── modern/
│       ├── shipClasses.js        # NEW: 10 ships + BASELINE_SHIP
│       ├── abilities.js          # NEW: 4 ability implementations
│       ├── rewindRespawn.js      # NEW: RewindBuffer + FSM integration
│       ├── trackSchema.js        # NEW: TrackSegment schema
│       ├── trackSegments.js      # NEW: section generator functions
│       ├── trackGenerator.js     # NEW: generateTrack()
│       ├── musicEngine.js        # NEW: MusicEngine class
│       └── bpmSync.js            # NEW: BPMSync class
├── comfyui-workflows/
│   ├── ship_concept_sheet.json   # NEW: ComfyUI workflow JSON
│   ├── pbr_texture_gen.json      # NEW: ComfyUI workflow JSON
│   └── skybox_panorama.json      # NEW: ComfyUI workflow JSON
├── assets/
│   ├── ships/                    # 10 × .glb (TripoSR/Meshy.ai output)
│   ├── track-blocks/             # 12 × .glb + 2048×2048 atlas
│   ├── hazards/                  # 6 × animated .glb
│   ├── skyboxes/                 # 5 × equirect .png/.exr
│   └── particles/                # 512×512 sprite atlas
├── qa/
│   ├── navigator.js              # Headless track validator
│   └── navigator.test.js         # 100-seed navigability suite
├── docs/
│   ├── architecture.md           # (existing — update with modern/ layer)
│   ├── module-map.md             # (existing — update)
│   ├── contracts.md              # NEW: all inter-agent schemas
│   ├── LEVEL_STYLE_GUIDE.md      # NEW: full design spec
│   ├── level-analysis.md         # NEW: original 62-level analysis
│   ├── physics-contract.md       # NEW: Phase 0 physics audit
│   ├── graphics-contract.md      # NEW: Phase 0 graphics audit
│   └── audio-contract.md         # NEW: Phase 0 audio audit
└── tests/
    ├── (existing 349 tests)
    ├── baseline-classic-mode.test.js  # NEW: permanent non-regression
    └── (new tests per phase)
```

---

*End of Master Plan v2.0. Commit this file as `MASTER_PLAN.md` at the repo root. All agents treat this as ground truth. Conflicts between this document and any single-model output: this document wins. When in doubt, run `npm test` — if it breaks, stop.*
