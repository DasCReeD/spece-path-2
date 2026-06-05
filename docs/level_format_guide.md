# SkyRoads WebGL — Level Format & Editor Guide

This guide describes the JSON level structure used in SkyRoads WebGL. It is designed to help developers build level editors or feed into external LLMs to analyze and generate level content.

---

## 1. Top-Level Level Schema

A level file contains an array of level objects, or a single level object, structured as follows:

```json
{
  "level_index": 61,
  "gravity": 8,
  "fuel": 150,
  "oxygen": 100,
  "palette": [
    [0, 0, 0],
    [32, 128, 64],
    ...
  ],
  "rows": [
    ...
  ]
}
```

### Top-Level Fields:
- **`level_index`** *(integer)*: Unique ID for the level (original DOS levels are 1–30; custom levels are 61–90).
- **`gravity`** *(integer)*: Gravity modifier scaling from 1 (lowest) to 20 (highest). Default is `8`.
- **`fuel`** *(integer)*: The ship's starting fuel supply.
- **`oxygen`** *(integer)*: The ship's starting oxygen supply (time limit indicator).
- **`palette`** *(array of 16 RGB colors)*: Color palette `[ [R, G, B], ... ]` where each channel is `0–255`. Colors are referenced by 0-based indices inside tiles.

---

## 2. Coordinate System & Track Dimensions

- **Lanes (X-axis)**: The track has exactly **7 lanes** (indexed `0` to `6`).
  - Lane `0` is the far-left lane (`X = -6.0`).
  - Lane `3` is the center lane (`X = 0.0`).
  - Lane `6` is the far-right lane (`X = 6.0`).
  - Lane width is **`2.0` units** (`TILE_WIDTH = 2.0`).
  - Total track width is `14.0` units.
- **Rows (Z-axis)**:
  - Row `0` is the start line.
  - Z runs negative going forward. The Z position of row `r` is `zPos = -r * 4.0` (`TILE_LENGTH = 4.0`).
  - The solver and renderer process rows sequentially from index `0` (start) to `rows.length - 1` (finish line).
- **Elevation (Y-axis)**:
  - Standard flat ground is at `Y = 0.0`.
  - Ship bounding box coordinates are calculated relative to the road surface.

---

## 3. Tile Objects (`rows[r][c]`)

Each element in `rows` is an array of exactly 7 elements representing lanes 0 to 6.
- A lane value of **`null`** indicates a **void gap** (empty space where the ship will fall).
- A lane value containing a JSON object defines a physical tile.

### Tile Object Fields:
- **`val`** *(integer)*: 16-bit descriptor preserved from the original DOS binary (typically `0` for road, or `16389` for obstacles).
- **`full`** *(boolean, optional)*: If `true`, renders a full-height obstacle block (`2.0` units high).
- **`half`** *(boolean, optional)*: If `true`, renders a half-height obstacle block (`1.0` units high).
  - If *both* `full` and `half` are `true`, it represents a double-height obstacle (`3.0` units high).
  - If neither is specified or they are `false`, it is a flat road tile (surface height = `0.0` or ramp height).
- **`tunnel`** *(boolean, optional)*: If `true`, renders a tunnel archway ceiling over this tile.
- **`ramp`** *(boolean, optional)*: If `true`, represents a sloped ramp.
- **`startY`** *(number, required if `ramp` is true)*: Height at the entrance (closer Z edge) of the tile.
- **`endY`** *(number, required if `ramp` is true)*: Height at the exit (further Z edge) of the tile.
  - *Note*: Flat runways at custom heights use `ramp: true` with `startY` equal to `endY`.
- **`top_color`** *(integer, 0–15)*: Palette color index for the top face.
- **`bottom_color`** *(integer, 0–15)*: Palette color index for the sides and bottom.
- **`low3`** *(integer, 0–15, optional)*: Secondary color channel for decals/themed decals.

---

## 4. Color to Tile Behavior Mapping

Tile physics and special properties are determined by mapping the tile's active color index (`top_color` for obstacles, `bottom_color` for flat roads) to a 1-based index (e.g., `behaviorColor = activeColor + 1`).

| Color Value in JSON | Behavior Color Index | Gameplay Behavior | Visual Glow Color | Description |
|:---:|:---:|---|---|---|
| **0** | `1` | **Normal Road** | None | Standard drivable surface. |
| **2** | `3` | **Sticky Brakes** | Dark Green | Aggressively slows down the ship. |
| **8** | `9` | **Slippery Ice** | Grey | Loss of steering control; momentum slide. |
| **9** | `10` | **Fuel & Oxygen Refill** | Deep Blue | Restores ship supplies instantaneously. |
| **10** | `11` | **Turbo Boost** | Green | Accelerates ship speed to `65.0` ($2.5\times$). |
| **11** | `12` | **Super Boost** | Cyan | Accelerates ship speed to `96.0` ($3.0\times$ plus $5.0\times$ accel). |
| **12** | `13` | **Burning Lava** | Red | Immediate explosion / crash on touch. |
| **13** | `14` | **High Jump** | Magenta | Amplifies upward jump impulse. |

---

## 5. Annotated JSON Example: Road Segment

Below is a complete JSON slice representing a 5-row segment showcasing various elements:

```json
[
  {
    "comment": "Row 0: Standard 3-lane flat runway centered on Lane 3. Outer lanes are void gaps.",
    "row": [
      null,
      null,
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      null,
      null
    ]
  },
  {
    "comment": "Row 1: Winding shift to the right. Lane 4 has a green Turbo Boost pad (bottom_color = 10).",
    "row": [
      null,
      null,
      null,
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "top_color": 11, "bottom_color": 10 },
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      null
    ]
  },
  {
    "comment": "Row 2: Slalom challenge. A half-height obstacle block is on Lane 3; Lanes 4-5 are free road.",
    "row": [
      null,
      null,
      null,
      { "val": 16389, "half": true, "top_color": 2, "bottom_color": 2 },
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "top_color": 0, "bottom_color": 1 },
      null
    ]
  },
  {
    "comment": "Row 3: Ramp upward transition. Slopes from height 0.0 to 0.5 over the tile length. Center Lane has a Cyan Super Boost (bottom_color = 11).",
    "row": [
      null,
      null,
      null,
      { "val": 0, "ramp": true, "startY": 0.0, "endY": 0.5, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "ramp": true, "startY": 0.0, "endY": 0.5, "top_color": 12, "bottom_color": 11 },
      { "val": 0, "ramp": true, "startY": 0.0, "endY": 0.5, "top_color": 0, "bottom_color": 1 },
      null
    ]
  },
  {
    "comment": "Row 4: Elevated Tunnel. Tiles are flat at height 0.5 (startY = endY = 0.5) and have the tunnel archway ceiling active.",
    "row": [
      null,
      null,
      null,
      { "val": 0, "ramp": true, "startY": 0.5, "endY": 0.5, "tunnel": true, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "ramp": true, "startY": 0.5, "endY": 0.5, "tunnel": true, "top_color": 0, "bottom_color": 1 },
      { "val": 0, "ramp": true, "startY": 0.5, "endY": 0.5, "tunnel": true, "top_color": 0, "bottom_color": 1 },
      null
    ]
  }
]
```
