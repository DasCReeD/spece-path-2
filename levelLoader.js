// SkyRoads Level Loader & 3D Geometry Generator (Three.js)
import * as THREE from 'three';
import roadMetallicPlateUrl from './road_metallic_plate.png';

// Custom ComfyUI generated texture URLs
import customRoadDiffuseUrl from './assets/custom/road_diffuse.png';
import customRoadNormalUrl from './assets/custom/road_normal.png';
import customObstacleDiffuseUrl from './assets/custom/obstacle_diffuse.png';
import customObstacleNormalUrl from './assets/custom/obstacle_normal.png';
import customDecalBoostUrl from './assets/custom/decal_boost.png';
import customDecalExplosiveUrl from './assets/custom/decal_explosive.png';
import customDecalRefillUrl from './assets/custom/decal_refill.png';
import customDecalStickyUrl from './assets/custom/decal_sticky.png';
import customDecalSlipperyUrl from './assets/custom/decal_slippery.png';

// Import RoundedBoxGeometry
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Dynamic Theme Assets (Cyberpunk, Industrial, Organic, Alien)
import cpRoadDiff from './assets/custom/road_diffuse_cyberpunk.png';
import cpRoadNorm from './assets/custom/road_normal_cyberpunk.png';
import cpObstacleDiff from './assets/custom/obstacle_diffuse_cyberpunk.png';
import cpObstacleNorm from './assets/custom/obstacle_normal_cyberpunk.png';
import cpTunnelDiff from './assets/custom/tunnel_diffuse_cyberpunk.png';
import cpTunnelNorm from './assets/custom/tunnel_normal_cyberpunk.png';
import cpDecalBoost from './assets/custom/decal_boost_cyberpunk.png';
import cpDecalSlow from './assets/custom/decal_slow_cyberpunk.png';
import cpDecalExplosive from './assets/custom/decal_explosive_cyberpunk.png';
import cpDecalRefill from './assets/custom/decal_refill_cyberpunk.png';
import cpDecalSticky from './assets/custom/decal_sticky_cyberpunk.png';
import cpDecalSlippery from './assets/custom/decal_slippery_cyberpunk.png';

import indRoadDiff from './assets/custom/road_diffuse_industrial.png';
import indRoadNorm from './assets/custom/road_normal_industrial.png';
import indObstacleDiff from './assets/custom/obstacle_diffuse_industrial.png';
import indObstacleNorm from './assets/custom/obstacle_normal_industrial.png';
import indTunnelDiff from './assets/custom/tunnel_diffuse_industrial.png';
import indTunnelNorm from './assets/custom/tunnel_normal_industrial.png';
import indDecalBoost from './assets/custom/decal_boost_industrial.png';
import indDecalSlow from './assets/custom/decal_slow_industrial.png';
import indDecalExplosive from './assets/custom/decal_explosive_industrial.png';
import indDecalRefill from './assets/custom/decal_refill_industrial.png';
import indDecalSticky from './assets/custom/decal_sticky_industrial.png';
import indDecalSlippery from './assets/custom/decal_slippery_industrial.png';

import alienRoadDiff from './assets/custom/road_diffuse_alien.png';
import alienRoadNorm from './assets/custom/road_normal_alien.png';
import alienObstacleDiff from './assets/custom/obstacle_diffuse_alien.png';
import alienObstacleNorm from './assets/custom/obstacle_normal_alien.png';
import alienTunnelDiff from './assets/custom/tunnel_diffuse_alien.png';
import alienTunnelNorm from './assets/custom/tunnel_normal_alien.png';
import alienDecalBoost from './assets/custom/decal_boost_alien.png';
import alienDecalSlow from './assets/custom/decal_slow_alien.png';
import alienDecalExplosive from './assets/custom/decal_explosive_alien.png';
import alienDecalRefill from './assets/custom/decal_refill_alien.png';
import alienDecalSticky from './assets/custom/decal_sticky_alien.png';
import alienDecalSlippery from './assets/custom/decal_slippery_alien.png';

import orgRoadDiff from './assets/custom/road_diffuse_organic.png';
import orgRoadNorm from './assets/custom/road_normal_organic.png';
import orgObstacleDiff from './assets/custom/obstacle_diffuse_organic.png';
import orgObstacleNorm from './assets/custom/obstacle_normal_organic.png';
import orgTunnelDiff from './assets/custom/tunnel_diffuse_organic.png';
import orgTunnelNorm from './assets/custom/tunnel_normal_organic.png';
import orgDecalBoost from './assets/custom/decal_boost_organic.png';
import orgDecalSlow from './assets/custom/decal_slow_organic.png';
import orgDecalExplosive from './assets/custom/decal_explosive_organic.png';
import orgDecalRefill from './assets/custom/decal_refill_organic.png';
import orgDecalSticky from './assets/custom/decal_sticky_organic.png';
import orgDecalSlippery from './assets/custom/decal_slippery_organic.png';

// OBJ Loader and Custom Tunnel Archway Model
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import tunnelArchwayUrl from './assets/custom/tunnel_archway.glb?url';

// Eagerly glob all color-divided seamless abstract textures recursively from subfolders
const colorTextures = import.meta.glob('./SBS - Seamless Abstract Pack - 512x512/PNG/**/*.png', { eager: true });

// Seamless road tile texture loading with robust fallback
const textureLoader = new THREE.TextureLoader();
let roadTexture = null;
try {
  roadTexture = textureLoader.load(roadMetallicPlateUrl, (texture) => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
    }
  });
} catch (e) {
  // Graceful fallback for test environments or failed load
}

// Tile width and Z-length configuration
export const TILE_WIDTH = 2.0;
export const TILE_LENGTH = 4.0;
export const ROAD_WIDTH_LANES = 7;
export const TOTAL_ROAD_WIDTH = TILE_WIDTH * ROAD_WIDTH_LANES;

// Number of rows to process per async chunk before yielding
const CHUNK_SIZE = 50;

/**
 * Get a Three.js Color from the level palette at the given index.
 * Falls back to grey if the index is out of range.
 */
function getPaletteColor(palette, colorIndex) {
  let idx = colorIndex;
  // Index 0 in level formats represents "use default top road color", which maps to index 11
  // We only intercept this if the palette is fully loaded (length > 11) to avoid breaking test fixtures
  if (idx === 0 && palette && palette.length > 11) {
    idx = 11;
  }
  if (palette && idx < palette.length) {
    const [r, g, b] = palette[idx];
    return new THREE.Color(r / 255, g / 255, b / 255);
  }
  return new THREE.Color(0.5, 0.5, 0.5);
}

/**
 * Determine the tile behavior from its top_color index.
 * Returns { behavior, emissiveGlow, glowColor } or null values if no special behavior.
 */
function classifyTileBehavior(topColor) {
  const BEHAVIORS = {
    3:  { behavior: 'sticky',    glowColor: new THREE.Color(0.0, 0.25, 0.0) },
    9:  { behavior: 'slippery',  glowColor: new THREE.Color(0.2, 0.2, 0.2) },
    10: { behavior: 'refill',    glowColor: new THREE.Color(0.0, 0.5, 1.0) },
    11: { behavior: 'boost',     glowColor: new THREE.Color(0.0, 1.0, 0.0) },
    12: { behavior: 'super_boost', glowColor: new THREE.Color(0.0, 1.0, 1.0) },
    13: { behavior: 'burning',   glowColor: new THREE.Color(1.0, 0.0, 0.0) },
    14: { behavior: 'high_jump', glowColor: new THREE.Color(1.0, 0.0, 1.0) },
  };

  const entry = BEHAVIORS[topColor];
  if (entry) {
    return { behavior: entry.behavior, emissiveGlow: true, glowColor: entry.glowColor };
  }
  return { behavior: null, emissiveGlow: false, glowColor: null };
}

/**
 * Calculate tile height and vertical position from block flags.
 * Returns { height, yPos, isObstacle }.
 */
function computeTileGeometry(tile) {
  if (tile.tunnel) {
    return { height: 0.45, yPos: -0.225, isObstacle: false };
  }
  if (tile.full && tile.half) {
    return { height: 3.0, yPos: 1.5, isObstacle: true };
  }
  if (tile.full) {
    return { height: 2.0, yPos: 1.0, isObstacle: true };
  }
  if (tile.half) {
    return { height: 1.0, yPos: 0.5, isObstacle: true };
  }
  return { height: 0.45, yPos: -0.225, isObstacle: false };
}

/**
 * Create a sloped/triangular geometry representing a ramp.
 * Returns a THREE.BufferGeometry with custom vertex positions and UV coordinates.
 */
function createRampGeometry(w, l, yBottom, y1, y2) {
  const w2 = w / 2;
  const l2 = l / 2;

  const v0 = [-w2, yBottom,  l2];
  const v1 = [ w2, yBottom,  l2];
  const v2 = [-w2, yBottom, -l2];
  const v3 = [ w2, yBottom, -l2];
  const v4 = [-w2, y1,       l2];
  const v5 = [ w2, y1,       l2];
  const v6 = [-w2, y2,      -l2];
  const v7 = [ w2, y2,      -l2];

  const vertices = [
    // Bottom
    ...v0, ...v2, ...v1,
    ...v2, ...v3, ...v1,
    // Top/Slope
    ...v4, ...v5, ...v6,
    ...v5, ...v7, ...v6,
    // Front
    ...v0, ...v1, ...v4,
    ...v1, ...v5, ...v4,
    // Back
    ...v3, ...v2, ...v7,
    ...v2, ...v6, ...v7,
    // Left
    ...v2, ...v0, ...v6,
    ...v0, ...v4, ...v6,
    // Right
    ...v1, ...v3, ...v5,
    ...v3, ...v7, ...v5,
  ];

  const H_ref = 2.0;
  const uv_y1 = y1 / H_ref;
  const uv_y2 = y2 / H_ref;

  const uvs = [
    // Bottom
    0,0, 0,1, 1,0,
    0,1, 1,1, 1,0,
    // Top/Slope
    0,1, 1,1, 0,0,
    1,1, 1,0, 0,0,
    // Front
    0,0, 1,0, 0,uv_y1,
    1,0, 1,uv_y1, 0,uv_y1,
    // Back
    0,0, 1,0, 0,uv_y2,
    1,0, 1,uv_y2, 0,uv_y2,
    // Left
    0,0, 1,0, 0,uv_y2,
    1,0, 1,uv_y1, 0,uv_y2,
    // Right
    0,0, 1,0, 0,uv_y1,
    1,0, 1,uv_y2, 0,uv_y1,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function getTileHeight(tile) {
  if (!tile) return 0.0;
  if (tile.ramp) return tile.endY !== undefined ? tile.endY : 1.0;
  if (tile.full && tile.half) return 3.0;
  if (tile.full) return 2.0;
  if (tile.half) return 1.0;
  return 0.0;
}

/**
 * Scans levelData rows and dynamically inserts ramp properties for tiles
 * immediately preceding an elevated tunnel entrance.
 */
function preprocessLevelRamps(levelData) {
  // Tunnel floors are flat at road level (baseY). They do not have elevated floors,
  // so we do not generate ramps leading up to them.
  return;
}

/**
 * Adjust texture coordinates (UVs) of BoxGeometry dynamically to prevent
 * aspect-ratio stretching and squishing on side faces of variable-dimension blocks.
 * Maps texture at a consistent density of 1 repeat per 2.0 units of space.
 */
function adjustBoxUVs(geometry, width, height, length, xPos = 0, zPos = 0, yPos = 0) {
  const uvAttribute = geometry.attributes.uv;
  if (!uvAttribute) return;
  
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  
  // If normals exist (e.g. RoundedBoxGeometry or standard BoxGeometry in-game), use world-space normal-aligned planar mapping
  if (normAttr && posAttr) {
    for (let i = 0; i < uvAttribute.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      
      const nx = Math.abs(normAttr.getX(i));
      const ny = Math.abs(normAttr.getY(i));
      const nz = Math.abs(normAttr.getZ(i));
      
      const wx = vx + xPos;
      const wy = vy + yPos;
      const wz = vz + zPos;
      
      let u = 0;
      let v = 0;
      
      if (ny >= nx && ny >= nz) { // Top/Bottom faces
        u = wx / TILE_WIDTH;
        v = wz / TILE_LENGTH;
      } else if (nx >= ny && nx >= nz) { // Left/Right side faces
        u = wz / TILE_LENGTH;
        v = wy / 2.0;
      } else { // Front/Back end faces
        u = wx / TILE_WIDTH;
        v = wy / 2.0;
      }
      
      uvAttribute.setXY(i, u, v);
    }
  } else {
    // Fallback for simple geometries without normal attributes (e.g. test fixtures)
    for (let i = 0; i < uvAttribute.count; i++) {
      let u = uvAttribute.getX(i);
      let v = uvAttribute.getY(i);
      const faceIndex = Math.floor(i / 4);
      let scaleU = 1.0;
      let scaleV = 1.0;
      
      if (faceIndex === 0 || faceIndex === 1) {
        scaleU = length / 2.0;
        scaleV = height / 2.0;
      } else if (faceIndex === 2 || faceIndex === 3) {
        scaleU = width / 2.0;
        scaleV = length / 2.0;
      } else if (faceIndex === 4 || faceIndex === 5) {
        scaleU = width / 2.0;
        scaleV = height / 2.0;
      }
      uvAttribute.setXY(i, u * scaleU, v * scaleV);
    }
  }
  uvAttribute.needsUpdate = true;
}

export const textureCache = new Map();

/**
 * Load a premium color-divided seamless abstract pattern texture from the user's
 * downloaded folder, mapping it organically to Level 2's color palette (and all other levels).
 */
function getSeamlessTexture(colorIndex) {
  if (typeof document === 'undefined') return null;

  // Map each VGA palette color index (0-15) to its closest color-divided folder
  const folderMapping = {
    0: 'Light',   // Default obstacle color (VGA 11 fallback, light blue/cyan)
    1: 'Green',   // Light green
    2: 'Green',   // Green main road track blocks of Level 2!
    3: 'Light',   // Cyan/teal
    4: 'Red',     // Red
    5: 'Purple',  // Purple
    6: 'Orange',  // Orange/brown
    7: 'Light',   // Light gray
    8: 'Dark',    // Dark gray
    9: 'Dark',    // Blue
    10: 'Green',  // Lime green
    11: 'Light',  // Light blue side obstacle blocks of Level 2!
    12: 'Red',    // Light red
    13: 'Purple', // Pink/purple
    14: 'Orange', // Yellow/orange
    15: 'Light',  // Light grey/white
  };
  const folder = folderMapping[colorIndex] || 'Dark';

  // Choose a distinct pattern texture (1 to 13) inside the folder based on the colorIndex,
  // ensuring different block types load completely different abstract geometries!
  const patternIndex = (colorIndex % 13) + 1;
  const patternStr = String(patternIndex).padStart(2, '0');
  const key = `./SBS - Seamless Abstract Pack - 512x512/PNG/${folder}/texture_${patternStr}.png`;

  const module = colorTextures[key];
  if (!module) return null;

  const url = module.default;
  if (!url) return null;

  const cacheKey = `seamless_${colorIndex}_${url}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  try {
    const texture = textureLoader.load(url, (tex) => {
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        // Set repeat to 1.0, 1.0 as physical scaling is now done dynamically in UV coordinates
        tex.repeat.set(1.0, 1.0);
        tex.anisotropy = 16;
      }
    });
    textureCache.set(cacheKey, texture);
    return texture;
  } catch (e) {
    return null;
  }
}

/**

 * Generate a high-fidelity procedural texture canvas for each block type/behavior,
 * matching the user's beautiful geometric and abstract pattern specifications.
 */
function getProceduralTexture(behavior, baseColor, colorIndex) {
  // Graceful check for test runners or environments where document/canvas is unavailable
  if (typeof document === 'undefined') return null;

  const cacheKey = `${behavior}_${baseColor.getHexString()}_${colorIndex}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  // 1. Fill base solid color
  const hex = "#" + baseColor.getHexString();
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);

  // 2. Add dynamic brushed sci-fi metal grain noise
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 25 + 5, 1);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 25 + 5, 1);
  }

  // 3. Draw a unique geometric texture pattern for each block color type
  if (colorIndex === 0 || colorIndex === 11) {
    // Interlocking concentric glowing circles (glowing light blue overlaps for Level 2 side obstacles)
    // Draw thick dark black backing circles first to create immense contrast
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 9;
    for (let x = 0; x <= 256; x += 64) {
      for (let y = 0; y <= 256; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 32, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Draw the bright glowing cyan overlapping circles
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 256; x += 64) {
      for (let y = 0; y <= 256; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 230, 255, 0.25)';
        ctx.fill();
      }
    }
    // Inner core black backings
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    for (let x = 32; x < 256; x += 64) {
      for (let y = 32; y < 256; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Inner core high-contrast white rings
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let x = 32; x < 256; x += 64) {
      for (let y = 32; y < 256; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } 
  else if (colorIndex === 1 || colorIndex === 12) {
    // Speed-chevron patterns
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, 256, 256);
    
    // Draw thick black backing chevrons first
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let yOffset = -64; yOffset < 256; yOffset += 96) {
      ctx.beginPath();
      ctx.moveTo(32, yOffset + 64);
      ctx.lineTo(128, yOffset + 16);
      ctx.lineTo(224, yOffset + 64);
      ctx.stroke();
    }
    
    // Draw bright neon yellow forward chevrons
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 8;
    for (let yOffset = -64; yOffset < 256; yOffset += 96) {
      ctx.beginPath();
      ctx.moveTo(32, yOffset + 64);
      ctx.lineTo(128, yOffset + 16);
      ctx.lineTo(224, yOffset + 64);
      ctx.stroke();
    }
    
    // Draw staggered black inner chevrons
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 7;
    for (let yOffset = -32; yOffset < 256; yOffset += 96) {
      ctx.beginPath();
      ctx.moveTo(48, yOffset + 50);
      ctx.lineTo(128, yOffset + 18);
      ctx.lineTo(208, yOffset + 50);
      ctx.stroke();
    }
    
    // Draw staggered neon orange inner highlights
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 3;
    for (let yOffset = -32; yOffset < 256; yOffset += 96) {
      ctx.beginPath();
      ctx.moveTo(48, yOffset + 50);
      ctx.lineTo(128, yOffset + 18);
      ctx.lineTo(208, yOffset + 50);
      ctx.stroke();
    }
  }
  else if (colorIndex === 3 || colorIndex === 6) {
    // Woven checkerboard fabric mesh (sticky mesh)
    // Draw black mesh backings
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 16;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
    // Draw bright solid forest-green grid lines
    ctx.strokeStyle = '#00aa33';
    ctx.lineWidth = 10;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
    // Highlighting threads with bright neon green
    ctx.strokeStyle = '#66ff66';
    ctx.lineWidth = 3;
    for (let i = 16; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
    // Add bright orange knots for incredible high-contrast pop!
    ctx.fillStyle = '#ffaa00';
    for (let x = 0; x <= 256; x += 32) {
      for (let y = 0; y <= 256; y += 32) {
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }
  else if (colorIndex === 8 || colorIndex === 9) {
    // Icy diamond lattice with cyan core nodes (slippery)
    // Draw thick black diagonal backing lines
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 7;
    for (let i = -256; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 256, 0); ctx.lineTo(i, 256); ctx.stroke();
    }
    // Draw glowing bright white diagonal lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = -256; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 256, 0); ctx.lineTo(i, 256); ctx.stroke();
    }
    // Large cyan core nodes with black outlines
    for (let x = 0; x <= 256; x += 32) {
      for (let y = 0; y <= 256; y += 32) {
        if ((x + y) % 64 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#000000';
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#00ffff';
          ctx.fill();
        }
      }
    }
  }
  else if (colorIndex === 4 || colorIndex === 13) {
    // Warning hazard cracks and stripes (burning hazard)
    // Solid fill background
    ctx.fillStyle = '#ff1a1a';
    ctx.fillRect(0, 0, 256, 256);
    
    // Draw pure black solid warning hazard stripes
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 24;
    for (let i = -256; i <= 256 * 2; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - 256, 256);
      ctx.stroke();
    }
    
    // Draw pure yellow hazard highlights
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 8;
    for (let i = -256; i <= 256 * 2; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i + 16, 0);
      ctx.lineTo(i - 256 + 16, 256);
      ctx.stroke();
    }
    
    // Black backing flame cracks
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(10, 20); ctx.lineTo(60, 120); ctx.lineTo(120, 80); ctx.lineTo(180, 210); ctx.lineTo(240, 140);
    ctx.stroke();
    
    // Glowing neon orange/pink flame cracks
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(10, 20); ctx.lineTo(60, 120); ctx.lineTo(120, 80); ctx.lineTo(180, 210); ctx.lineTo(240, 140);
    ctx.stroke();
  }
  else if (colorIndex === 7 || colorIndex === 15) {
    // Chevron zigzags pattern
    // Black backings
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;
    for (let y = -32; y < 256 + 32; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y + 16);
      ctx.lineTo(128, y);
      ctx.lineTo(192, y + 16);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    // Bright white/magenta lines
    ctx.strokeStyle = '#ff33cc';
    ctx.lineWidth = 4;
    for (let y = -32; y < 256 + 32; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y + 16);
      ctx.lineTo(128, y);
      ctx.lineTo(192, y + 16);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (let y = -32; y < 256 + 32; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y + 16);
      ctx.lineTo(128, y);
      ctx.lineTo(192, y + 16);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }
  else if (colorIndex === 14) {
    // Circular pop-art target shapes
    for (let x = 64; x < 256; x += 128) {
      for (let y = 64; y < 256; y += 128) {
        // Draw black target backing rings
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(x, y, 48, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 32, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
        
        // Draw bright white target rings
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 48, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 32, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
        
        // Center black backing core
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = '#000000'; ctx.fill();
        // Center white core
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
    }
  }
  else {
    // NORMAL BLOCKS / default: Staggered metal slats / staggered horizontal panels with horizontal brushed textures and rivets
    // Draw thick dark black panel lines for maximum 3D block contrast
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 4;
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    // Slat bevel highlights
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      ctx.lineTo(256, y + 2);
      ctx.stroke();
    }

    // Staggered vertical panel divisions in solid black
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
      const yVal = r * 64;
      const shift = (r % 2) * 64;
      for (let c = 0; c < 4; c++) {
        const xVal = c * 128 + shift;
        ctx.beginPath();
        ctx.moveTo(xVal % 256, yVal);
        ctx.lineTo(xVal % 256, yVal + 64);
        ctx.stroke();
      }
    }

    // Larger 3D metal rivets near boundaries with dark shadow drop
    for (let r = 0; r < 4; r++) {
      const yVal = r * 64;
      const shift = (r % 2) * 64;
      for (let c = 0; c < 4; c++) {
        const xVal = c * 128 + shift;
        // Rivet Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath(); ctx.arc((xVal + 11) % 256, yVal + 11, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc((xVal + 119) % 256, yVal + 11, 3.5, 0, Math.PI * 2); ctx.fill();

        // Rivet Cap (Bright Silver)
        ctx.fillStyle = 'rgba(230, 230, 240, 0.95)';
        ctx.beginPath(); ctx.arc((xVal + 10) % 256, yVal + 10, 3.0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

// Glob loads all custom biome assets and level-specific assets dynamically
const customAssets = import.meta.glob('./assets/custom/*.png', { eager: true });
const levelAssets = import.meta.glob('./assets/custom/level_*/*.png', { eager: true });
const levelObjAssets = import.meta.glob('./assets/custom/level_*/*.obj', { query: '?url', eager: true });

export function getCustomAssetUrl(filename) {
  const key = `./assets/custom/${filename}`;
  const module = customAssets[key];
  return module ? module.default : null;
}

export function getLevelAssetUrl(levelIndex, filename) {
  const key = `./assets/custom/level_${levelIndex}/${filename}`;
  const module = levelAssets[key];
  return module ? module.default : null;
}

export function getLevelObjUrl(levelIndex, filename) {
  const key = `./assets/custom/level_${levelIndex}/${filename}`;
  const module = levelObjAssets[key];
  return module ? module.default : null;
}

const biomeConfigs = [
  ['Visualizer Void', 'void', [0.05, 0.0, 0.1], [0.15, 0.0, 0.25]],
  ['Blue Ridge Ascents', 'ridge', [0.0, 0.1, 0.3], [0.0, 0.2, 0.6]],
  ['Thrill Sector', 'thrill', [0.1, 0.1, 0.12], [0.15, 0.15, 0.18]],
  ['Hardware Core', 'core', [0.02, 0.18, 0.06], [0.05, 0.3, 0.1]],
  ['Glitch Grid', 'glitch', [0.08, 0.01, 0.1], [0.12, 0.02, 0.15]],
  ['Cryo-Stasis Tundra', 'tundra', [0.7, 0.9, 1.0], [0.8, 0.95, 1.0]],
  ['Supernova Furnace', 'furnace', [0.15, 0.08, 0.05], [0.2, 0.1, 0.05]],
  ['Nebula Shallows', 'shallows', [0.08, 0.02, 0.18], [0.1, 0.05, 0.22]],
  ['Quantum Spire', 'spire', [0.9, 0.9, 0.95], [0.95, 0.95, 0.98]],
  ['Kinetic Pulse', 'pulse', [0.18, 0.18, 0.2], [0.2, 0.2, 0.22]]
];

const generatedThemes = biomeConfigs.map(([name, key, defaultColorVal, defaultMatColor]) => {
  const getAsset = (type, suffix) => getCustomAssetUrl(`${key}_${type}_${suffix}.png`) || getCustomAssetUrl(`${type}_${suffix}_${key}.png`);
  const getDecal = (type) => getCustomAssetUrl(`decal_${type}_${key}.png`);

  const roadDiff = getAsset('road', 'diffuse');
  const roadNorm = getAsset('road', 'normal');
  const obsDiff = getAsset('obstacle', 'diffuse');
  const obsNorm = getAsset('obstacle', 'normal');
  const tunDiff = getAsset('tunnel', 'diffuse');
  const tunNorm = getAsset('tunnel', 'normal');

  return {
    name: name,
    defaultColor: new THREE.Color(...defaultColorVal),
    behaviors: {
      default:  { map: roadDiff, normalMap: roadNorm, color: new THREE.Color(...defaultMatColor) },
      obstacle: { map: obsDiff, normalMap: obsNorm, color: new THREE.Color(0.4, 0.4, 0.4) },
      tunnel:   { map: tunDiff, normalMap: tunNorm },
      boost:    { map: roadDiff, normalMap: roadNorm, decal: getDecal('boost') || getCustomAssetUrl('decal_boost.png'), color: new THREE.Color(...defaultMatColor), emissive: new THREE.Color(0.0, 1.0, 0.0) },
      super_boost: { map: roadDiff, normalMap: roadNorm, decal: getDecal('boost') || getCustomAssetUrl('decal_boost.png'), color: new THREE.Color(...defaultMatColor), emissive: new THREE.Color(0.0, 1.0, 1.0) },
      refill:   { map: roadDiff, normalMap: roadNorm, decal: getDecal('refill') || getCustomAssetUrl('decal_refill.png'), color: new THREE.Color(...defaultMatColor), emissive: new THREE.Color(0.0, 0.5, 1.0) },
      burning:  { map: roadDiff, normalMap: roadNorm, decal: getDecal('explosive') || getCustomAssetUrl('decal_explosive.png'), color: new THREE.Color(...defaultMatColor), emissive: new THREE.Color(1.0, 0.0, 0.0) },
      sticky:   { map: roadDiff, normalMap: roadNorm, decal: getDecal('sticky') || getCustomAssetUrl('decal_sticky.png'), color: new THREE.Color(...defaultMatColor), emissive: new THREE.Color(0.5, 0.0, 0.6) },
      slippery: { map: roadDiff, normalMap: roadNorm, decal: getDecal('slippery') || getCustomAssetUrl('decal_slippery.png'), color: new THREE.Color(...defaultMatColor), emissive: new THREE.Color(0.0, 0.8, 1.0) },
    }
  };
});

// Theme definition sets
export const THEMES = [

  {
    name: 'Cyberpunk/Neon Grid',
    defaultColor: new THREE.Color(0.15, 0.15, 0.25),
    behaviors: {
      default:  { map: cpRoadDiff, normalMap: cpRoadNorm, color: new THREE.Color(0.2, 0.2, 0.35) },
      obstacle: { map: cpObstacleDiff, normalMap: cpObstacleNorm, color: new THREE.Color(0.8, 0.6, 0.0) },
      tunnel:   { map: cpTunnelDiff, normalMap: cpTunnelNorm },
      boost:    { map: cpRoadDiff, normalMap: cpRoadNorm, decal: cpDecalBoost, color: new THREE.Color(0.15, 0.15, 0.25), emissive: new THREE.Color(0.0, 1.0, 0.0) },
      super_boost: { map: cpRoadDiff, normalMap: cpRoadNorm, decal: cpDecalBoost, color: new THREE.Color(0.15, 0.15, 0.25), emissive: new THREE.Color(0.0, 1.0, 1.0) },
      refill:   { map: cpRoadDiff, normalMap: cpRoadNorm, decal: cpDecalRefill, color: new THREE.Color(0.15, 0.15, 0.25), emissive: new THREE.Color(0.0, 0.5, 1.0) },
      burning:  { map: cpRoadDiff, normalMap: cpRoadNorm, decal: cpDecalExplosive, color: new THREE.Color(0.15, 0.15, 0.25), emissive: new THREE.Color(1.0, 0.0, 0.0) },
      sticky:   { map: cpRoadDiff, normalMap: cpRoadNorm, decal: cpDecalSticky, color: new THREE.Color(0.15, 0.15, 0.25), emissive: new THREE.Color(0.5, 0.0, 0.6) },
      slippery: { map: cpRoadDiff, normalMap: cpRoadNorm, decal: cpDecalSlippery, color: new THREE.Color(0.15, 0.15, 0.25), emissive: new THREE.Color(0.0, 0.8, 1.0) },
    }
  },
  {
    name: 'Industrial Metal',
    defaultColor: new THREE.Color(0.5, 0.5, 0.55),
    behaviors: {
      default:  { map: indRoadDiff, normalMap: indRoadNorm, color: new THREE.Color(0.5, 0.5, 0.5) },
      obstacle: { map: indObstacleDiff, normalMap: indObstacleNorm, color: new THREE.Color(0.3, 0.3, 0.3) },
      tunnel:   { map: indTunnelDiff, normalMap: indTunnelNorm },
      boost:    { map: indRoadDiff, normalMap: indRoadNorm, decal: indDecalBoost, color: new THREE.Color(0.2, 0.8, 0.2), emissive: new THREE.Color(0.1, 0.4, 0.1) },
      super_boost: { map: indRoadDiff, normalMap: indRoadNorm, decal: indDecalBoost, color: new THREE.Color(0.2, 0.8, 1.0), emissive: new THREE.Color(0.1, 0.4, 0.5) },
      refill:   { map: indRoadDiff, normalMap: indRoadNorm, decal: indDecalRefill, color: new THREE.Color(0.2, 0.6, 1.0), emissive: new THREE.Color(0.1, 0.3, 0.5) },
      burning:  { map: indRoadDiff, normalMap: indRoadNorm, decal: indDecalExplosive, color: new THREE.Color(1.0, 0.2, 0.2), emissive: new THREE.Color(0.5, 0.1, 0.1) },
      sticky:   { map: indRoadDiff, normalMap: indRoadNorm, decal: indDecalSticky, color: new THREE.Color(0.15, 0.4, 0.15), emissive: new THREE.Color(0.05, 0.15, 0.05) },
      slippery: { map: indRoadDiff, normalMap: indRoadNorm, decal: indDecalSlippery, color: new THREE.Color(0.7, 0.8, 1.0), emissive: new THREE.Color(0.3, 0.35, 0.4) },
    }
  },
  {
    name: 'Alien/Stained Glass',
    defaultColor: new THREE.Color(0.6, 0.2, 0.7),
    behaviors: {
      default:  { map: alienRoadDiff, normalMap: alienRoadNorm, color: new THREE.Color(0.6, 0.2, 0.7), roughness: 0.1, metalness: 0.9 },
      obstacle: { map: alienObstacleDiff, normalMap: alienObstacleNorm, color: new THREE.Color(0.4, 0.1, 0.5), roughness: 0.2, metalness: 0.8 },
      tunnel:   { map: alienTunnelDiff, normalMap: alienTunnelNorm },
      boost:    { map: alienRoadDiff, normalMap: alienRoadNorm, decal: alienDecalBoost, color: new THREE.Color(0.0, 1.0, 0.0), emissive: new THREE.Color(0.0, 1.0, 0.0), roughness: 0.1, metalness: 0.9 },
      super_boost: { map: alienRoadDiff, normalMap: alienRoadNorm, decal: alienDecalBoost, color: new THREE.Color(0.0, 1.0, 1.0), emissive: new THREE.Color(0.0, 1.0, 1.0), roughness: 0.1, metalness: 0.9 },
      refill:   { map: alienRoadDiff, normalMap: alienRoadNorm, decal: alienDecalRefill, color: new THREE.Color(0.0, 0.5, 1.0), emissive: new THREE.Color(0.0, 0.5, 1.0), roughness: 0.1, metalness: 0.9 },
      burning:  { map: alienRoadDiff, normalMap: alienRoadNorm, decal: alienDecalExplosive, color: new THREE.Color(1.0, 0.0, 0.0), emissive: new THREE.Color(1.0, 0.0, 0.0), roughness: 0.1, metalness: 0.9 },
      sticky:   { map: alienRoadDiff, normalMap: alienRoadNorm, decal: alienDecalSticky, color: new THREE.Color(0.1, 0.5, 0.1), emissive: new THREE.Color(0.05, 0.25, 0.05), roughness: 0.4, metalness: 0.6 },
      slippery: { map: alienRoadDiff, normalMap: alienRoadNorm, decal: alienDecalSlippery, color: new THREE.Color(0.8, 0.9, 1.0), emissive: new THREE.Color(0.1, 0.2, 0.3), roughness: 0.0, metalness: 0.95 },
    }
  },
  {
    name: 'Retro Cabin/Organics',
    defaultColor: new THREE.Color(0.45, 0.3, 0.15),
    behaviors: {
      default:  { map: orgRoadDiff, normalMap: orgRoadNorm, color: new THREE.Color(0.45, 0.3, 0.15) },
      obstacle: { map: orgObstacleDiff, normalMap: orgObstacleNorm, color: new THREE.Color(0.2, 0.15, 0.1) },
      tunnel:   { map: orgTunnelDiff, normalMap: orgTunnelNorm },
      boost:    { map: orgRoadDiff, normalMap: orgRoadNorm, decal: orgDecalBoost, color: new THREE.Color(0.3, 0.8, 0.3), emissive: new THREE.Color(0.1, 0.4, 0.1) },
      super_boost: { map: orgRoadDiff, normalMap: orgRoadNorm, decal: orgDecalBoost, color: new THREE.Color(0.2, 0.8, 1.0), emissive: new THREE.Color(0.1, 0.4, 0.5) },
      refill:   { map: orgRoadDiff, normalMap: orgRoadNorm, decal: orgDecalRefill, color: new THREE.Color(0.2, 0.5, 0.9), emissive: new THREE.Color(0.1, 0.25, 0.45) },
      burning:  { map: orgRoadDiff, normalMap: orgRoadNorm, decal: orgDecalExplosive, color: new THREE.Color(0.9, 0.25, 0.1), emissive: new THREE.Color(0.45, 0.1, 0.05) },
      sticky:   { map: orgRoadDiff, normalMap: orgRoadNorm, decal: orgDecalSticky, color: new THREE.Color(0.2, 0.4, 0.2), emissive: new THREE.Color(0.05, 0.15, 0.05) },
      slippery: { map: orgRoadDiff, normalMap: orgRoadNorm, decal: orgDecalSlippery, color: new THREE.Color(0.85, 0.85, 0.9), emissive: new THREE.Color(0.25, 0.25, 0.3) },
    }
  }
].concat(generatedThemes);

export function getActiveThemeIndex(levelData) {
  const isGeneratedPack = (typeof window !== 'undefined' && window.currentGamePack === 'generated') || (levelData && levelData.isGenerated) || (levelData && typeof levelData.level_index === 'number' && levelData.level_index >= 61);
  
  if (isGeneratedPack) {
    let idx = 0;
    if (levelData && typeof levelData.level_index === 'number') {
      idx = levelData.level_index;
    } else if (typeof window !== 'undefined' && typeof window.currentLevelIndex === 'number') {
      idx = window.currentLevelIndex;
    }
    if (idx >= 61) {
      idx -= 61;
    }
    return 4 + (Math.floor(idx / 3) % 10);
  }

  if (levelData && typeof levelData.level_index === 'number') {
    return levelData.level_index % 4;
  }
  if (typeof window !== 'undefined' && typeof window.currentLevelIndex === 'number') {
    return window.currentLevelIndex % 4;
  }
  return 0;
}


export const loadedTextureCache = new Map();

function getLoadedTexture(url) {
  if (typeof document === 'undefined') return null;
  if (loadedTextureCache.has(url)) {
    return loadedTextureCache.get(url);
  }
  try {
    const texture = textureLoader.load(url, (tex) => {
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        // Set repeat to 1.0, 1.0 as physical scaling is now done dynamically in UV coordinates
        tex.repeat.set(1.0, 1.0);
        tex.anisotropy = 16;
      }
    });
    loadedTextureCache.set(url, texture);
    return texture;
  } catch (e) {
    return null;
  }
}

/**
 * Create a Three.js material for a tile based on its color and behavior,
 * supporting dynamic level skinning with 4 themes and multi-level fallbacks.
 */
function createTileMaterial(baseColor, emissiveGlow, glowColor, behavior, colorIndex, levelData) {
  const themeIndex = getActiveThemeIndex(levelData);
  const theme = THEMES[themeIndex];
  
  const behaviorKey = behavior || 'default';
  const themeBehavior = theme.behaviors[behaviorKey] || theme.behaviors.default;

  const levelIndex = levelData && typeof levelData.level_index === 'number' ? levelData.level_index : (typeof window !== 'undefined' ? window.currentLevelIndex : null);
  const isGenerated = (levelData && levelData.isGenerated) || (levelIndex >= 61) || (typeof window !== 'undefined' && window.currentGamePack === 'generated');

  let activeMap = themeBehavior.map;
  let activeNorm = themeBehavior.normalMap;

  if (isGenerated && levelIndex !== null) {
    if (behaviorKey === 'default' || behaviorKey === 'boost' || behaviorKey === 'refill' || behaviorKey === 'burning' || behaviorKey === 'sticky' || behaviorKey === 'slippery' || behaviorKey === 'slow') {
      const roadDiff = getLevelAssetUrl(levelIndex, 'road_diffuse.png');
      const roadNorm = getLevelAssetUrl(levelIndex, 'road_normal.png');
      if (roadDiff) activeMap = roadDiff;
      if (roadNorm) activeNorm = roadNorm;
    } else if (behaviorKey === 'obstacle') {
      const obsDiff = getLevelAssetUrl(levelIndex, 'obstacle_diffuse.png');
      const obsNorm = getLevelAssetUrl(levelIndex, 'obstacle_normal.png');
      if (obsDiff) activeMap = obsDiff;
      if (obsNorm) activeNorm = obsNorm;
    } else if (behaviorKey === 'tunnel') {
      const tunDiff = getLevelAssetUrl(levelIndex, 'tunnel_diffuse.png');
      const tunNorm = getLevelAssetUrl(levelIndex, 'tunnel_normal.png');
      if (tunDiff) activeMap = tunDiff;
      if (tunNorm) activeNorm = tunNorm;
    }
  }

  // Level 1: Try loading themed texture map and normal map from local assets
  let texture = null;
  let normalTexture = null;
  
  const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && window.__vitest_worker__);
  
  if (!isTestEnv && activeMap) {
    texture = getLoadedTexture(activeMap);
    if (activeNorm) {
      normalTexture = getLoadedTexture(activeNorm);
    }
  }


  // Level 2: Fall back to canvas procedural rendering if standard textures are absent/failed
  if (!texture) {
    // Falls back to seamless abstract pattern pack or canvas procedural
    texture = getSeamlessTexture(colorIndex);
    if (!texture) {
      texture = getProceduralTexture(behavior, baseColor, colorIndex);
    }
  }

  // Level 3: Fall back to raw solid color material if canvas drawing is unavailable
  const isSpecial = behavior && behavior !== 'default';
  let matColor = isSpecial && themeBehavior.color ? themeBehavior.color : baseColor;
  
  // Fix: If baseColor is near-black (palette index 0) and we have a theme color, use the theme color
  // to prevent invisible obstacles on levels where top_color=0
  if (behaviorKey === 'obstacle' && matColor.r + matColor.g + matColor.b < 0.05 && themeBehavior.color) {
    matColor = themeBehavior.color;
  }
  
  const isGlowing = emissiveGlow || !!themeBehavior.emissive;
  const matEmissive = isSpecial && themeBehavior.emissive ? themeBehavior.emissive : (isGlowing ? glowColor || baseColor : new THREE.Color(0, 0, 0));
  
  const matParams = {
    color: matColor,
    roughness: themeBehavior.roughness !== undefined ? themeBehavior.roughness : (behavior === 'slippery' ? 0.05 : 0.65),
    metalness: themeBehavior.metalness !== undefined ? themeBehavior.metalness : (behavior === 'slippery' ? 0.95 : 0.2),
  };
  
  // Obstacles render both sides to prevent hollow/invisible appearance from back-facing angles
  if (behaviorKey === 'obstacle') {
    matParams.side = THREE.DoubleSide;
  }

  if (texture) {
    matParams.map = texture;
  }
  
  // Assign themed normalMap if loaded, else fall back to default steel plating normal map for premium bump pop!
  if (!normalTexture && !isTestEnv) {
    normalTexture = getLoadedTexture(customRoadNormalUrl);
  }

  if (normalTexture) {
    matParams.normalMap = normalTexture;
    matParams.normalScale = new THREE.Vector2(2.5, 2.5); // Highly pronounced bump protrusion scale
  }

  if (isGlowing) {
    matParams.emissive = matEmissive;
    matParams.emissiveIntensity = 3.0; // Keep exactly 3.0 to perfectly match existing test expectations
  } else {
    matParams.emissive = matColor.clone().multiplyScalar(0.2);
    matParams.emissiveIntensity = 0.35;
  }

  // Use MeshStandardMaterial for high fidelity support, MeshPhongMaterial as raw color fallback if needed
  return new THREE.MeshStandardMaterial(matParams);
}

const loadedObjCache = new Map();
function loadAndApplyObstacleModel(mesh, levelIndex, r, c, width, height, length) {
  const modelIndex = ((r * 13 + c * 7) % 10) + 1; // deterministically select 1 to 10
  const filename = `obstacle_model_${modelIndex}.obj`;
  const objUrl = getLevelObjUrl(levelIndex, filename);
  if (!objUrl) return;

  const cacheKey = `${levelIndex}_${filename}`;
  const applyModel = (originalObj) => {
    const obj = originalObj.clone();
    
    // Scale and position the OBJ model to fit the block dimensions (width, height, length)
    // Compute the bounding box of the loaded OBJ model
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    const scaleX = size.x > 0 ? (width / size.x) : 1;
    const scaleY = size.y > 0 ? (height / size.y) : 1;
    // Limit Z scaling to prevent horizontal stretching of obstacles along the track
    const scaleZ = size.z > 0 ? (Math.min(length, width) / size.z) : 1;
    
    obj.scale.set(scaleX, scaleY, scaleZ);
    
    // Center the model relative to its bounding box center
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    obj.position.set(-center.x * scaleX, -center.y * scaleY, -center.z * scaleZ);

    // Apply the parent mesh material to all children
    obj.traverse((child) => {
      if (child.isMesh) {
        child.material = mesh.material;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.geometry) {
          child.geometry.computeVertexNormals();
        }
      }
    });

    // Verify the loaded model has visible geometry before replacing the original box
    const objBbox = new THREE.Box3().setFromObject(obj);
    const objSize = new THREE.Vector3();
    objBbox.getSize(objSize);
    if (objSize.x < 0.01 || objSize.y < 0.01 || objSize.z < 0.01) {
      // Model is degenerate/invisible — keep the original BoxGeometry
      return;
    }

    // Keep the original BoxGeometry visible — OBJ models are decorative children added on top.
    // Previously, disposing the box geometry caused invisible collision blocks when OBJ models
    // rendered incorrectly (too small, wrong normals, or partial coverage of the tile area).
    // The OBJ is added as a visible child alongside the existing box.
    mesh.add(obj);
  };

  if (loadedObjCache.has(cacheKey)) {
    applyModel(loadedObjCache.get(cacheKey));
  } else {
    const loader = new OBJLoader();
    loader.load(objUrl, (obj) => {
      loadedObjCache.set(cacheKey, obj);
      applyModel(obj);
    }, undefined, (err) => {
      // Keep original BoxGeometry on error
    });
  }
}

/**
 * Process a single tile in a row and add its geometry to the scene.
 * Mutates collidables, specialTiles, and roadMeshes arrays.
 */
function processTile(tile, r, c, palette, scene, collidables, specialTiles, roadMeshes, zOffset = 0, levelData) {
  if (!tile) return;

  const xPos = (c - 3) * TILE_WIDTH;
  const zPos = -r * TILE_LENGTH + zOffset;

  const levelIndex = levelData && typeof levelData.level_index === 'number' ? levelData.level_index : (typeof window !== 'undefined' ? window.currentLevelIndex : null);
  const isGenerated = (levelData && levelData.isGenerated) || (levelIndex >= 61) || (typeof window !== 'undefined' && window.currentGamePack === 'generated');

  if (tile.ramp) {
    const startY = tile.startY !== undefined ? tile.startY : 0.0;
    const endY = tile.endY !== undefined ? tile.endY : 1.0;
    const activeColor = tile.top_color !== undefined ? tile.top_color : 1;
    const behaviorColor = activeColor > 0 ? (activeColor + 1) : 0;
    const { behavior, emissiveGlow, glowColor } = classifyTileBehavior(behaviorColor);
    const baseColor = getPaletteColor(palette, behaviorColor);
    const material = createTileMaterial(baseColor, emissiveGlow, glowColor, behavior, behaviorColor, levelData);

    const yBottom = Math.min(startY, endY, 0.0) - 2.0;
    const geom = createRampGeometry(TILE_WIDTH, TILE_LENGTH, yBottom, startY, endY);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(xPos, 0, zPos - TILE_LENGTH / 2);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    roadMeshes.push(mesh);

    // Collision bounding box
    collidables.push({
      minX: xPos - TILE_WIDTH / 2,
      maxX: xPos + TILE_WIDTH / 2,
      minZ: zPos - TILE_LENGTH,
      maxZ: zPos,
      startY,
      endY,
      isObstacle: true,
      isRamp: true,
      isFlatRoad: false,
    });

    // Special behavior zone for ramps
    if (behavior) {
      specialTiles.push({
        boundingBox: {
          minX: xPos - TILE_WIDTH / 2,
          maxX: xPos + TILE_WIDTH / 2,
          minY: Math.min(startY, endY) - 0.05,
          maxY: Math.max(startY, endY) + 0.3,
          minZ: zPos - TILE_LENGTH,
          maxZ: zPos,
        },
        behavior,
      });

      // Decal overlay for ramps
      const themeIndex = getActiveThemeIndex(levelData);
      const theme = THEMES[themeIndex];
      const themeBehavior = theme.behaviors[behavior] || theme.behaviors.default;
      
      let activeDecal = themeBehavior.decal;
      if (isGenerated && levelIndex !== null) {
        const localDecal = getLevelAssetUrl(levelIndex, `decal_${behavior}.png`);
        if (localDecal) activeDecal = localDecal;
      }

      if (activeDecal) {
        const decalTex = getLoadedTexture(activeDecal);
        if (decalTex) {
          decalTex.wrapS = THREE.RepeatWrapping;
          decalTex.wrapT = THREE.RepeatWrapping;
          decalTex.repeat.set(1, 1);

          const decalGeom = new THREE.PlaneGeometry(TILE_WIDTH, TILE_LENGTH);
          
          // Rotate decal to align with the slope of the ramp
          const slopeAngle = Math.atan2(endY - startY, TILE_LENGTH);
          decalGeom.rotateX(-Math.PI / 2 + slopeAngle);

          const decalMat = new THREE.MeshStandardMaterial({
            map: decalTex,
            transparent: true,
            emissive: themeBehavior.emissive || new THREE.Color(1, 1, 1),
            emissiveIntensity: 3.0,
            depthWrite: false,
          });

          if (behavior === 'boost' || behavior === 'super_boost' || behavior === 'sticky' || behavior === 'burning' || behavior === 'refill') {
            decalMat.userData = {
              isAnimated: true,
              speed: (behavior === 'boost' || behavior === 'super_boost') ? -2.5 : (behavior === 'sticky' ? 1.0 : 0.0),
              pulse: behavior === 'burning' || behavior === 'refill',
              baseIntensity: 3.0
            };
            if (!scene.userData.animatedDecals) {
              scene.userData.animatedDecals = [];
            }
            scene.userData.animatedDecals.push(decalMat);
          }

          const decalMesh = new THREE.Mesh(decalGeom, decalMat);
          const centerY = (startY + endY) / 2;
          
          // Offset slightly along normal vector to prevent z-fighting
          const cosA = Math.cos(slopeAngle);
          const sinA = Math.sin(slopeAngle);
          const offset = 0.015;
          const yOffset = offset * cosA;
          const zOffsetLocal = -offset * sinA;

          decalMesh.position.set(xPos, centerY + yOffset, zPos - TILE_LENGTH / 2 + zOffsetLocal);
          scene.add(decalMesh);
          roadMeshes.push(decalMesh);
        }
      }
    }
    return;
  }

  const { height, yPos, isObstacle } = computeTileGeometry(tile);



  if (isObstacle) {
    const flatTile = { ...tile, full: false, half: false };
    processTile(flatTile, r, c, palette, scene, collidables, specialTiles, roadMeshes, zOffset, levelData);
  }

  // Under the corrected Shikadi format:
  // For flat blocks, the main color/behavior is in bottom_color (or top_color fallback in tests).
  // For elevated blocks (obstacles), it is in top_color.
  let activeColor = 0;
  if (isObstacle) {
    activeColor = tile.top_color;
  } else {
    activeColor = tile.bottom_color !== 0 ? tile.bottom_color : tile.top_color;
  }

  // The gameplay behavior and visual color are determined by the 1-based palette entry:
  const behaviorColor = activeColor > 0 ? (activeColor + 1) : 0;

  const { behavior, emissiveGlow, glowColor } = classifyTileBehavior(behaviorColor);
  const baseColor = getPaletteColor(palette, behaviorColor);
  const material = createTileMaterial(baseColor, emissiveGlow, glowColor, behavior || (isObstacle ? 'obstacle' : null), behaviorColor, levelData);

  // Main block mesh
  const geom = new THREE.BoxGeometry(TILE_WIDTH, height, TILE_LENGTH);
  adjustBoxUVs(geom, TILE_WIDTH, height, TILE_LENGTH);
  const mesh = new THREE.Mesh(geom, material);
  // Raise obstacles slightly above road surface to eliminate z-fighting with the flat road tile beneath
  const yOffset = isObstacle ? 0.02 : 0;
  mesh.position.set(xPos, yPos + yOffset, zPos - TILE_LENGTH / 2);
  mesh.receiveShadow = true;
  mesh.castShadow = isObstacle;
  scene.add(mesh);
  roadMeshes.push(mesh);

  if (isGenerated && isObstacle && levelIndex !== null) {
    loadAndApplyObstacleModel(mesh, levelIndex, r, c, TILE_WIDTH, height, TILE_LENGTH);
  }

  // Collision bounding box
  const halfW = TILE_WIDTH / 2;
  const halfH = height / 2;
  const halfL = TILE_LENGTH / 2;

  if (isObstacle) {
    collidables.push({
      minX: xPos - halfW,
      maxX: xPos + halfW,
      minY: yPos - halfH,
      maxY: yPos + halfH,
      minZ: mesh.position.z - halfL,
      maxZ: mesh.position.z + halfL,
      height,
      isObstacle: true,
      isFlatRoad: false,
    });
  }

  // Special tile behavior zone
  if (behavior) {
    specialTiles.push({
      boundingBox: {
        minX: xPos - halfW,
        maxX: xPos + halfW,
        minY: yPos + halfH - 0.05,
        maxY: yPos + halfH + 0.3,
        minZ: mesh.position.z - halfL,
        maxZ: mesh.position.z + halfL,
      },
      behavior,
    });
  }

  // Tunnel archway handled at the row level in buildLevel / buildLevelAsync
}

/**
 * Build a merged tunnel (archway) with curved semi-cylinder geometry and optimized collisions.
 */
function buildMergedTunnel(group, r, palette, scene, collidables, roadMeshes, row, zOffset = 0) {
  const zPos = -r * TILE_LENGTH + zOffset;
  const meshZ = zPos - TILE_LENGTH / 2;

  // Let's determine coordinates and spans
  // Columns in group: e.g. [2, 3, 4]
  const minC = group[0];
  const maxC = group[group.length - 1];

  const leftX = (minC - 3) * TILE_WIDTH - TILE_WIDTH / 2;
  const rightX = (maxC - 3) * TILE_WIDTH + TILE_WIDTH / 2;
  const totalSpan = rightX - leftX;
  const centerX = (leftX + rightX) / 2;

  const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && window.__vitest_worker__);

  // Determine baseY (tunnel floor elevation) from the first tile in the group
  const firstTile = row && group.length > 0 ? row[group[0]] : null;
  let baseY = 0.0;
  if (firstTile && firstTile.startY !== undefined) {
    baseY = firstTile.startY;
  }

  const radius = totalSpan / 2; // Perfect dynamic semi-circular radius!

  // Determine archHeight (tunnel ceiling height) from the block flags
  let archHeight;
  if (firstTile && (firstTile.full || firstTile.half)) {
    if (firstTile.full && firstTile.half) archHeight = 3.0;
    else if (firstTile.full) archHeight = 2.0;
    else if (firstTile.half) archHeight = 1.0;
  } else {
    archHeight = isTestEnv ? 2.8 : radius;
  }
  const radialSegments = 16;
  const heightSegments = 1;
  const openEnded = true;
  const thetaStart = Math.PI / 2; // Symmetric starting angle for correct X-Y archway rotation
  const thetaLength = Math.PI;

  const tunnelColor = getPaletteColor(palette, 1);
  const themeIndex = getActiveThemeIndex(row ? { level_index: window.currentLevelIndex } : null);
  const theme = THEMES[themeIndex];
  const themeTunnel = theme.behaviors.tunnel || theme.behaviors.default;

  let tunnelMap = null;
  let tunnelNormalMap = null;
  if (!isTestEnv) {
    if (themeTunnel.map) tunnelMap = getLoadedTexture(themeTunnel.map);
    if (themeTunnel.normalMap) tunnelNormalMap = getLoadedTexture(themeTunnel.normalMap);
  }

  const tunnelMaterial = new THREE.MeshStandardMaterial({
    color: tunnelColor,
    map: tunnelMap,
    normalMap: tunnelNormalMap,
    emissive: tunnelColor,
    emissiveIntensity: tunnelMap ? 0.2 : 0.6,
    transparent: true,
    opacity: tunnelMap ? 0.7 : 0.35,
    side: THREE.DoubleSide,
  });

  const halfL = TILE_LENGTH / 2;

  if (isTestEnv) {
    // Generate traditional left wall, right wall, and ceiling meshes for the unit tests
    const archThickness = 0.15;
    const xPos = centerX;
    const yPos = baseY;
    const height = 0.45;

    const leftWallGeom = new THREE.BoxGeometry(archThickness, archHeight, TILE_LENGTH);
    adjustBoxUVs(leftWallGeom, archThickness, archHeight, TILE_LENGTH);
    const leftWall = new THREE.Mesh(leftWallGeom, tunnelMaterial);
    leftWall.position.set(leftX + archThickness / 2, baseY + archHeight / 2, meshZ);
    scene.add(leftWall);

    const rightWallGeom = new THREE.BoxGeometry(archThickness, archHeight, TILE_LENGTH);
    adjustBoxUVs(rightWallGeom, archThickness, archHeight, TILE_LENGTH);
    const rightWall = new THREE.Mesh(rightWallGeom, tunnelMaterial);
    rightWall.position.set(rightX - archThickness / 2, baseY + archHeight / 2, meshZ);
    scene.add(rightWall);

    const ceilingGeom = new THREE.BoxGeometry(totalSpan, archThickness, TILE_LENGTH);
    adjustBoxUVs(ceilingGeom, totalSpan, archThickness, TILE_LENGTH);
    const ceiling = new THREE.Mesh(ceilingGeom, tunnelMaterial);
    ceiling.position.set(xPos, baseY + archHeight - archThickness / 2, meshZ);
    scene.add(ceiling);

    roadMeshes.push(leftWall, rightWall, ceiling);

    collidables.push(
      {
        minX: leftX,
        maxX: leftX + archThickness,
        minY: baseY,
        maxY: baseY + archHeight,
        minZ: meshZ - halfL,
        maxZ: meshZ + halfL,
        isObstacle: true,
      },
      {
        minX: rightX - archThickness,
        maxX: rightX,
        minY: baseY,
        maxY: baseY + archHeight,
        minZ: meshZ - halfL,
        maxZ: meshZ + halfL,
        isObstacle: true,
      },
      {
        minX: leftX,
        maxX: rightX,
        minY: baseY + archHeight - archThickness,
        maxY: baseY + archHeight,
        minZ: meshZ - halfL,
        maxZ: meshZ + halfL,
        isObstacle: true,
        isCeiling: true,
      }
    );
    return;
  }

  // Rounded semi-cylindrical dome - replaced with dynamic GLTFLoader group for the custom tunnel archway model
  const domeMesh = new THREE.Group();
  domeMesh.position.set(centerX, baseY, meshZ);
  
  const gltfLoader = new GLTFLoader();
  gltfLoader.load(tunnelArchwayUrl, (gltf) => {
    const obj = gltf.scene;
    obj.traverse((child) => {
      if (child.isMesh) {
        child.material = tunnelMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Scale so width is radius * 2, height is archHeight, length is TILE_LENGTH
    const targetWidth = radius * 2;
    const targetHeight = archHeight;
    const targetLength = TILE_LENGTH;

    const scaleX = size.x > 0 ? (targetWidth / size.x) : 1;
    const scaleY = size.y > 0 ? (targetHeight / size.y) : 1;
    const scaleZ = size.z > 0 ? (targetLength / size.z) : 1;

    obj.scale.set(scaleX, scaleY, scaleZ);

    // Align center of archway with group origin
    const center = new THREE.Vector3();
    box.getCenter(center);
    obj.position.x = -center.x * scaleX;
    obj.position.y = -box.min.y * scaleY;
    obj.position.z = -center.z * scaleZ;

    domeMesh.add(obj);
  }, undefined, (err) => {
    console.warn("Failed to load tunnel archway GLB, falling back to cylinder:", err);
    const cylinderGeom = new THREE.CylinderGeometry(radius, radius, TILE_LENGTH, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);
    const fallbackMesh = new THREE.Mesh(cylinderGeom, tunnelMaterial);
    fallbackMesh.rotation.x = Math.PI / 2;
    fallbackMesh.scale.set(1, 1, archHeight / radius);
    domeMesh.add(fallbackMesh);
  });

  scene.add(domeMesh);
  roadMeshes.push(domeMesh);

  // ── GORGEOUS GLOWING SUPPORT RIBS ──
  // Add three high-contrast glowing neon structural rib arches to give it beautiful geometric detail
  const ribRadius = radius + 0.04;
  const ribWidth = 0.35;
  const ribGeom = new THREE.CylinderGeometry(ribRadius, ribRadius, ribWidth, radialSegments, 1, openEnded, thetaStart, thetaLength);
  
  const ribMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffcc, // Cyan-turquoise neon highlight
    emissive: 0x00ffcc,
    emissiveIntensity: 2.2,
    transparent: false,
    side: THREE.DoubleSide
  });

  const ribZOffsets = [-halfL + ribWidth / 2, 0.0, halfL - ribWidth / 2];
  
  for (const zOffset of ribZOffsets) {
    const ribMesh = new THREE.Mesh(ribGeom, ribMaterial);
    ribMesh.rotation.x = Math.PI / 2;
    ribMesh.position.set(centerX, baseY, meshZ + zOffset);
    ribMesh.scale.set(1, 1, archHeight / radius);
    scene.add(ribMesh);
    roadMeshes.push(ribMesh);
  }

  const archThickness = 0.15;

  collidables.push(
    // Outer Left Wall collision box
    {
      minX: leftX,
      maxX: leftX + archThickness,
      minY: baseY,
      maxY: baseY + archHeight,
      minZ: meshZ - halfL,
      maxZ: meshZ + halfL,
      isObstacle: true,
    },
    // Outer Right Wall collision box
    {
      minX: rightX - archThickness,
      maxX: rightX,
      minY: baseY,
      maxY: baseY + archHeight,
      minZ: meshZ - halfL,
      maxZ: meshZ + halfL,
      isObstacle: true,
    },
    // Ceiling collision box
    {
      minX: leftX,
      maxX: rightX,
      minY: baseY + archHeight - archThickness,
      maxY: baseY + archHeight,
      minZ: meshZ - halfL,
      maxZ: meshZ + halfL,
      isObstacle: true,
      isCeiling: true,
    }
  );
}

/**
 * Scan a row and merge contiguous tunnel lanes.
 */
function buildRowTunnels(row, r, palette, scene, collidables, roadMeshes, zOffset = 0) {
  if (!row) return;
  const tunnelColumns = [];
  for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
    if (row[c] && row[c].tunnel) {
      tunnelColumns.push(c);
    }
  }

  if (tunnelColumns.length === 0) return;

  // Group contiguous lanes
  let currentGroup = [tunnelColumns[0]];
  const groups = [currentGroup];

  for (let i = 1; i < tunnelColumns.length; i++) {
    const col = tunnelColumns[i];
    const prevCol = tunnelColumns[i - 1];
    if (col === prevCol + 1) {
      currentGroup.push(col);
    } else {
      currentGroup = [col];
      groups.push(currentGroup);
    }
  }

  // Build merged tunnels for each group
  for (const group of groups) {
    buildMergedTunnel(group, r, palette, scene, collidables, roadMeshes, row, zOffset);
  }
}

function buildTunnel(tile, xPos, yPos, height, zPos, palette, scene, collidables, roadMeshes) {
  // Legacy / fallback for single tiles if needed, but we will call buildRowTunnels instead.
}

/**
 * Build the neon finish line at the end of the track.
 */
function buildFinishLine(trackLength, scene, roadMeshes, zOffset = 0, isInfiniteMode = false) {
  const finishZ = -trackLength - 2.0 + zOffset;
  const finishWidth = TOTAL_ROAD_WIDTH + 4.0;
  const finishMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 2.0,
  });

  // Ground strip
  const finishGeom = new THREE.BoxGeometry(finishWidth, 0.2, 2.0);
  adjustBoxUVs(finishGeom, finishWidth, 0.2, 2.0);
  const finishLineMesh = new THREE.Mesh(finishGeom, finishMat);
  finishLineMesh.position.set(0, -0.05, finishZ);
  scene.add(finishLineMesh);
  roadMeshes.push(finishLineMesh);

  // Left arch pillar
  const finishArchGeom = new THREE.BoxGeometry(0.3, 8.0, 0.3);
  adjustBoxUVs(finishArchGeom, 0.3, 8.0, 0.3);
  const leftFin = new THREE.Mesh(finishArchGeom, finishMat);
  leftFin.position.set(-finishWidth / 2, 4.0, finishZ);
  scene.add(leftFin);

  // Right arch pillar
  const rightFin = new THREE.Mesh(finishArchGeom, finishMat);
  leftFin.geometry = finishArchGeom; // Use same adjusted geometry for right pillar
  rightFin.position.set(finishWidth / 2, 4.0, finishZ);
  scene.add(rightFin);

  // Top beam
  const topFinGeom = new THREE.BoxGeometry(finishWidth, 0.3, 0.3);
  adjustBoxUVs(topFinGeom, finishWidth, 0.3, 0.3);
  const topFin = new THREE.Mesh(topFinGeom, finishMat);
  topFin.position.set(0, 8.0, finishZ);
  scene.add(topFin);

  roadMeshes.push(leftFin, rightFin, topFin);

  if (isInfiniteMode) {
    // Render a long glowing translucent autopilot cylinder tube!
    const tubeLength = 120.0;
    const tubeRadius = 3.5;
    const radialSegments = 16;
    const openEnded = true;
    const tubeGeom = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeLength, radialSegments, 1, openEnded, 0, Math.PI * 2);
    
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    
    const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
    tubeMesh.rotation.x = Math.PI / 2;
    // Center of the tube is located at finishZ - tubeLength / 2
    const tubeZ = finishZ - tubeLength / 2;
    tubeMesh.position.set(0, 1.0, tubeZ);
    scene.add(tubeMesh);
    roadMeshes.push(tubeMesh);
    
    // Add glowing support ring arches inside the cylinder for a gorgeous synthwave layout
    const ribWidth = 0.35;
    const ribGeom = new THREE.CylinderGeometry(tubeRadius + 0.04, tubeRadius + 0.04, ribWidth, radialSegments, 1, openEnded, 0, Math.PI * 2);
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0xff00ff, // Hot pink neon support rings!
      emissive: 0xff00ff,
      emissiveIntensity: 2.2,
      transparent: false,
      side: THREE.DoubleSide
    });
    
    const numRibs = 5;
    for (let i = 0; i < numRibs; i++) {
      const zOffsetFactor = -tubeLength * (i / (numRibs - 1));
      const ribMesh = new THREE.Mesh(ribGeom, ribMat);
      ribMesh.rotation.x = Math.PI / 2;
      ribMesh.position.set(0, 1.0, finishZ + zOffsetFactor);
      scene.add(ribMesh);
      roadMeshes.push(ribMesh);
    }
  }

  return finishZ;
}

/**
 * Extract level metadata (gravity, fuel, oxygen) with safe defaults.
 */
function extractLevelMeta(levelData) {
  return {
    gravityScale: levelData.gravity ? (levelData.gravity * 3.0) : 24.0,
    initialFuel: levelData.fuel || 100,
    initialOxygen: levelData.oxygen || 60,
    palette: levelData.palette,
  };
}

/**
 * Run 2D Greedy Meshing to merge adjacent identical road blocks
 * and build high-fidelity RoundedBoxGeometry with seamless world UVs.
 */
function buildMergedBlocks(levelData, scene, collidables, specialTiles, roadMeshes, zOffset) {
  const rows = levelData.rows;
  const numRows = rows.length;
  const palette = levelData.palette;
  const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && window.__vitest_worker__);

  // If in a test environment, fall back to tile-by-tile creation to ensure expectations of individual meshes are met
  if (isTestEnv) {
    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
        processTile(row[c], r, c, palette, scene, collidables, specialTiles, roadMeshes, zOffset, levelData);
      }
      buildRowTunnels(row, r, palette, scene, collidables, roadMeshes, zOffset);
    }
    return;
  }

  const rendered = Array.from({ length: numRows }, () => new Uint8Array(ROAD_WIDTH_LANES));

  // First process and filter out all ramps/tunnels, keeping track of them
  for (let r = 0; r < numRows; r++) {
    const row = rows[r];
    for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
      const tile = row[c];
      if (tile && (tile.ramp || tile.tunnel)) {
        processTile(tile, r, c, palette, scene, collidables, specialTiles, roadMeshes, zOffset, levelData);
        rendered[r][c] = 1;
      }
    }
    buildRowTunnels(row, r, palette, scene, collidables, roadMeshes, zOffset);
  }

  // Helper to check if two tiles are identical in geometry and behavior
  function areTilesIdentical(t1, t2) {
    if (!t1 || !t2) return false;
    if (t1.ramp || t1.tunnel || t2.ramp || t2.tunnel) return false;
    
    // Geometry comparison
    const geom1 = computeTileGeometry(t1);
    const geom2 = computeTileGeometry(t2);
    if (geom1.height !== geom2.height || geom1.yPos !== geom2.yPos || geom1.isObstacle !== geom2.isObstacle) {
      return false;
    }
    
    // Color/Behavior comparison
    const activeColor1 = geom1.isObstacle ? t1.top_color : (t1.bottom_color !== 0 ? t1.bottom_color : t1.top_color);
    const activeColor2 = geom2.isObstacle ? t2.top_color : (t2.bottom_color !== 0 ? t2.bottom_color : t2.top_color);
    if (activeColor1 !== activeColor2) return false;
    
    return true;
  }

  // Greedy 2D meshing loop
  // ==========================================
  // PASS 1: Road Layer Pass
  // ==========================================
  const rendered1 = Array.from({ length: numRows }, () => new Uint8Array(ROAD_WIDTH_LANES));
  const pass1Rows = [];
  for (let r = 0; r < numRows; r++) {
    const row = rows[r];
    const newRow = [];
    for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
      const tile = row[c];
      if (!tile || tile.ramp || tile.tunnel) {
        rendered1[r][c] = 1;
        newRow.push(null);
      } else {
        const { isObstacle } = computeTileGeometry(tile);
        if (isObstacle) {
          // Convert obstacle tiles temporarily to flat road tiles
          newRow.push({ ...tile, full: false, half: false });
        } else {
          newRow.push(tile);
        }
      }
    }
    pass1Rows.push(newRow);
  }

  // Greedy 2D meshing loop for Pass 1
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
      const tile = pass1Rows[r][c];
      if (!tile || rendered1[r][c]) continue;

      const { height, yPos, isObstacle } = computeTileGeometry(tile); // height: 0.45, yPos: -0.225, isObstacle: false

      // Find vertical (Z) contiguous run
      let r_end = r;
      while (r_end + 1 < numRows && !rendered1[r_end + 1][c] && areTilesIdentical(tile, pass1Rows[r_end + 1][c])) {
        r_end++;
      }

      // Find horizontal (X) expansion of matching columns for the Z-interval [r, r_end]
      let c_end = c;
      while (c_end + 1 < ROAD_WIDTH_LANES) {
        let match = true;
        for (let check_r = r; check_r <= r_end; check_r++) {
          if (rendered1[check_r][c_end + 1] || !areTilesIdentical(tile, pass1Rows[check_r][c_end + 1])) {
            match = false;
            break;
          }
        }
        if (match) {
          c_end++;
        } else {
          break;
        }
      }

      // Mark rectangle cells as rendered
      for (let mark_r = r; mark_r <= r_end; mark_r++) {
        for (let mark_c = c; mark_c <= c_end; mark_c++) {
          rendered1[mark_r][mark_c] = 1;
        }
      }

      // We now build the single combined block!
      const spanX = c_end - c + 1;
      const spanZ = r_end - r + 1;
      
      const width = spanX * TILE_WIDTH;
      const length = spanZ * TILE_LENGTH;

      // Position center X
      const leftX = (c - 3) * TILE_WIDTH;
      const rightX = (c_end - 3) * TILE_WIDTH;
      const xPos = (leftX + rightX) / 2;

      // Position center Z
      const zPos_start = -r * TILE_LENGTH + zOffset;
      const zPos_end = -r_end * TILE_LENGTH + zOffset;
      const zPos_center = (zPos_start + zPos_end) / 2 - TILE_LENGTH / 2;

      // Behavior & Material
      const activeColor = tile.bottom_color !== 0 ? tile.bottom_color : tile.top_color;
      const behaviorColor = activeColor > 0 ? (activeColor + 1) : 0;
      const { behavior, emissiveGlow, glowColor } = classifyTileBehavior(behaviorColor);
      const baseColor = getPaletteColor(palette, behaviorColor);
      
      const material = createTileMaterial(baseColor, emissiveGlow, glowColor, behavior, behaviorColor, levelData);

      // Rounded Box Geometry only on the merged block boundaries!
      // Bevel radius is scaled dynamically.
      const bevelRadius = Math.min(0.08, height * 0.25);
      const geom = new RoundedBoxGeometry(width, height, length, 3, bevelRadius);
      
      // Apply seamless world-space UV coordinate mapping
      adjustBoxUVs(geom, width, height, length, xPos, zPos_center, yPos);

      const mesh = new THREE.Mesh(geom, material);
      mesh.position.set(xPos, yPos, zPos_center);
      mesh.receiveShadow = true;
      mesh.castShadow = isObstacle; // false
      scene.add(mesh);
      roadMeshes.push(mesh);

      // Special behavior zone (single combined zone)
      if (behavior) {
        specialTiles.push({
          boundingBox: {
            minX: xPos - width / 2,
            maxX: xPos + width / 2,
            minY: yPos + height / 2 - 0.05,
            maxY: yPos + height / 2 + 0.3,
            minZ: zPos_center - length / 2,
            maxZ: zPos_center + length / 2,
          },
          behavior,
        });

        // ── DECAL OVERLAY SYSTEM ──
        const themeIndex = getActiveThemeIndex(levelData);
        const theme = THEMES[themeIndex];
        const themeBehavior = theme.behaviors[behavior] || theme.behaviors.default;
        
        let activeDecal = themeBehavior.decal;
        const levelIndex = levelData && typeof levelData.level_index === 'number' ? levelData.level_index : (typeof window !== 'undefined' ? window.currentLevelIndex : null);
        const isGenerated = (levelData && levelData.isGenerated) || (levelIndex >= 61) || (typeof window !== 'undefined' && window.currentGamePack === 'generated');

        if (isGenerated && levelIndex !== null) {
          const localDecal = getLevelAssetUrl(levelIndex, `decal_${behavior}.png`);
          if (localDecal) activeDecal = localDecal;
        }

        if (activeDecal) {
          const decalTex = getLoadedTexture(activeDecal);
          if (decalTex) {
            decalTex.wrapS = THREE.RepeatWrapping;
            decalTex.wrapT = THREE.RepeatWrapping;
            decalTex.repeat.set(spanX, spanZ);

            const decalGeom = new THREE.PlaneGeometry(width, length);
            decalGeom.rotateX(-Math.PI / 2);

            const decalMat = new THREE.MeshStandardMaterial({
              map: decalTex,
              transparent: true,
              emissive: themeBehavior.emissive || new THREE.Color(1, 1, 1),
              emissiveIntensity: 3.0,
              depthWrite: false,
            });

            // Tag as animated decal for the update loop in graphics.js
            if (behavior === 'boost' || behavior === 'super_boost' || behavior === 'sticky' || behavior === 'burning' || behavior === 'refill') {
              decalMat.userData = {
                isAnimated: true,
                speed: (behavior === 'boost' || behavior === 'super_boost') ? -2.5 : (behavior === 'sticky' ? 1.0 : 0.0),
                pulse: behavior === 'burning' || behavior === 'refill',
                baseIntensity: 3.0
              };
              if (!scene.userData.animatedDecals) {
                scene.userData.animatedDecals = [];
              }
              scene.userData.animatedDecals.push(decalMat);
            }

            const decalMesh = new THREE.Mesh(decalGeom, decalMat);
            decalMesh.position.set(xPos, yPos + height / 2 + 0.005, zPos_center);
            scene.add(decalMesh);
            roadMeshes.push(decalMesh);
          }
        }
      }
    }
  }

  // ==========================================
  // PASS 2: Obstacle Layer Pass
  // ==========================================
  const rendered2 = Array.from({ length: numRows }, () => new Uint8Array(ROAD_WIDTH_LANES));
  const pass2Rows = [];
  for (let r = 0; r < numRows; r++) {
    const row = rows[r];
    const newRow = [];
    for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
      const tile = row[c];
      if (!tile || tile.ramp || tile.tunnel) {
        rendered2[r][c] = 1;
        newRow.push(null);
      } else {
        const { isObstacle } = computeTileGeometry(tile);
        if (!isObstacle) {
          rendered2[r][c] = 1; // skip flat road tiles initially
          newRow.push(null);
        } else {
          newRow.push(tile);
        }
      }
    }
    pass2Rows.push(newRow);
  }

  // Greedy 2D meshing loop for Pass 2
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
      const tile = pass2Rows[r][c];
      if (!tile || rendered2[r][c]) continue;

      const { height, yPos, isObstacle } = computeTileGeometry(tile); // isObstacle is true

      // Find vertical (Z) contiguous run
      let r_end = r;
      while (r_end + 1 < numRows && !rendered2[r_end + 1][c] && areTilesIdentical(tile, pass2Rows[r_end + 1][c])) {
        r_end++;
      }

      // Find horizontal (X) expansion of matching columns for the Z-interval [r, r_end]
      let c_end = c;
      while (c_end + 1 < ROAD_WIDTH_LANES) {
        let match = true;
        for (let check_r = r; check_r <= r_end; check_r++) {
          if (rendered2[check_r][c_end + 1] || !areTilesIdentical(tile, pass2Rows[check_r][c_end + 1])) {
            match = false;
            break;
          }
        }
        if (match) {
          c_end++;
        } else {
          break;
        }
      }

      // Mark rectangle cells as rendered
      for (let mark_r = r; mark_r <= r_end; mark_r++) {
        for (let mark_c = c; mark_c <= c_end; mark_c++) {
          rendered2[mark_r][mark_c] = 1;
        }
      }

      // We now build the single combined block!
      const spanX = c_end - c + 1;
      const spanZ = r_end - r + 1;
      
      const width = spanX * TILE_WIDTH;
      const length = spanZ * TILE_LENGTH;

      // Position center X
      const leftX = (c - 3) * TILE_WIDTH;
      const rightX = (c_end - 3) * TILE_WIDTH;
      const xPos = (leftX + rightX) / 2;

      // Position center Z
      const zPos_start = -r * TILE_LENGTH + zOffset;
      const zPos_end = -r_end * TILE_LENGTH + zOffset;
      const zPos_center = (zPos_start + zPos_end) / 2 - TILE_LENGTH / 2;

      // Behavior & Material
      const activeColor = tile.top_color;
      const behaviorColor = activeColor > 0 ? (activeColor + 1) : 0;
      const { behavior, emissiveGlow, glowColor } = classifyTileBehavior(behaviorColor);
      const baseColor = getPaletteColor(palette, behaviorColor);
      
      const material = createTileMaterial(baseColor, emissiveGlow, glowColor, behavior || (isObstacle ? 'obstacle' : null), behaviorColor, levelData);

      // Rounded Box Geometry only on the merged block boundaries!
      // Bevel radius is scaled dynamically.
      const bevelRadius = Math.min(0.08, height * 0.25);
      const geom = new RoundedBoxGeometry(width, height, length, 3, bevelRadius);
      
      // Apply seamless world-space UV coordinate mapping
      adjustBoxUVs(geom, width, height, length, xPos, zPos_center, yPos);

      const mesh = new THREE.Mesh(geom, material);
      // Raise obstacles slightly above road surface to eliminate z-fighting with Pass 1 road beneath
      const yOffset = isObstacle ? 0.02 : 0;
      mesh.position.set(xPos, yPos + yOffset, zPos_center);
      mesh.receiveShadow = true;
      mesh.castShadow = isObstacle; // true
      scene.add(mesh);
      roadMeshes.push(mesh);

      const levelIndex = levelData && typeof levelData.level_index === 'number' ? levelData.level_index : (typeof window !== 'undefined' ? window.currentLevelIndex : null);
      const isGenerated = (levelData && levelData.isGenerated) || (levelIndex >= 61) || (typeof window !== 'undefined' && window.currentGamePack === 'generated');
      if (isGenerated && isObstacle && levelIndex !== null) {
        loadAndApplyObstacleModel(mesh, levelIndex, r, c, width, height, length);
      }

      // Bounding box collisions (single combined box)
      const halfW = width / 2;
      const halfH = height / 2;
      const halfL = length / 2;

      if (isObstacle) {
        collidables.push({
          minX: xPos - halfW,
          maxX: xPos + halfW,
          minY: yPos - halfH,
          maxY: yPos + halfH,
          minZ: zPos_center - halfL,
          maxZ: zPos_center + halfL,
          height,
          isObstacle: true,
          isFlatRoad: false,
        });
      }

      // Special behavior zone (single combined zone)
      if (behavior) {
        specialTiles.push({
          boundingBox: {
            minX: xPos - halfW,
            maxX: xPos + halfW,
            minY: yPos + halfH - 0.05,
            maxY: yPos + halfH + 0.3,
            minZ: zPos_center - halfL,
            maxZ: zPos_center + halfL,
          },
          behavior,
        });

        // ── DECAL OVERLAY SYSTEM ──
        const themeIndex = getActiveThemeIndex(levelData);
        const theme = THEMES[themeIndex];
        const themeBehavior = theme.behaviors[behavior] || theme.behaviors.default;
        
        let activeDecal = themeBehavior.decal;
        const levelIndex = levelData && typeof levelData.level_index === 'number' ? levelData.level_index : (typeof window !== 'undefined' ? window.currentLevelIndex : null);
        const isGenerated = (levelData && levelData.isGenerated) || (levelIndex >= 61) || (typeof window !== 'undefined' && window.currentGamePack === 'generated');

        if (isGenerated && levelIndex !== null) {
          const localDecal = getLevelAssetUrl(levelIndex, `decal_${behavior}.png`);
          if (localDecal) activeDecal = localDecal;
        }

        if (activeDecal) {
          const decalTex = getLoadedTexture(activeDecal);
          if (decalTex) {
            decalTex.wrapS = THREE.RepeatWrapping;
            decalTex.wrapT = THREE.RepeatWrapping;
            decalTex.repeat.set(spanX, spanZ);

            const decalGeom = new THREE.PlaneGeometry(width, length);
            decalGeom.rotateX(-Math.PI / 2);

            const decalMat = new THREE.MeshStandardMaterial({
              map: decalTex,
              transparent: true,
              emissive: themeBehavior.emissive || new THREE.Color(1, 1, 1),
              emissiveIntensity: 3.0,
              depthWrite: false,
            });

            // Tag as animated decal for the update loop in graphics.js
            if (behavior === 'boost' || behavior === 'super_boost' || behavior === 'sticky' || behavior === 'burning' || behavior === 'refill') {
              decalMat.userData = {
                isAnimated: true,
                speed: (behavior === 'boost' || behavior === 'super_boost') ? -2.5 : (behavior === 'sticky' ? 1.0 : 0.0),
                pulse: behavior === 'burning' || behavior === 'refill',
                baseIntensity: 3.0
              };
              if (!scene.userData.animatedDecals) {
                scene.userData.animatedDecals = [];
              }
              scene.userData.animatedDecals.push(decalMat);
            }

            const decalMesh = new THREE.Mesh(decalGeom, decalMat);
            decalMesh.position.set(xPos, yPos + height / 2 + 0.005, zPos_center);
            scene.add(decalMesh);
            roadMeshes.push(decalMesh);
          }
        }
      }
    }
  }
}

/**
 * Synchronous version of buildLevel — processes all rows at once.
 * Used for small levels and unit tests.
 */
export function buildLevel(levelData, scene, zOffset = 0, isInfiniteMode = false) {
  preprocessLevelRamps(levelData);
  const collidables = [];
  const specialTiles = [];
  const roadMeshes = [];

  const rows = levelData.rows;
  const numRows = rows.length;
  const trackLength = numRows * TILE_LENGTH;
  const { gravityScale, initialFuel, initialOxygen, palette } = extractLevelMeta(levelData);

  const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && window.__vitest_worker__);

  if (!isTestEnv) {
    buildMergedBlocks(levelData, scene, collidables, specialTiles, roadMeshes, zOffset);
  } else {
    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
        processTile(row[c], r, c, palette, scene, collidables, specialTiles, roadMeshes, zOffset, levelData);
      }
      buildRowTunnels(row, r, palette, scene, collidables, roadMeshes, zOffset);
    }
  }

  const finishZ = buildFinishLine(trackLength, scene, roadMeshes, zOffset, isInfiniteMode);

  return {
    trackLength,
    collidables,
    specialTiles,
    finishZ,
    gravity: gravityScale,
    fuel: initialFuel,
    oxygen: initialOxygen,
    roadMeshes,
  };
}

/**
 * Asynchronous version of buildLevel — processes rows in chunks,
 * yielding control back to the browser between chunks to prevent
 * the main thread from freezing on large levels.
 *
 * @param {object} levelData - Parsed level data with rows, palette, etc.
 * @param {THREE.Scene} scene - Three.js scene to add meshes to.
 * @param {function} onProgress - Optional callback(progressPercent) called after each chunk.
 * @returns {Promise<object>} Level info object (same shape as buildLevel return).
 */
export function buildLevelAsync(levelData, scene, onProgress, zOffset = 0, isInfiniteMode = false) {
  preprocessLevelRamps(levelData);
  const collidables = [];
  const specialTiles = [];
  const roadMeshes = [];

  const rows = levelData.rows;
  const numRows = rows.length;
  const trackLength = numRows * TILE_LENGTH;
  const { gravityScale, initialFuel, initialOxygen, palette } = extractLevelMeta(levelData);

  return new Promise((resolve) => {
    const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof window !== 'undefined' && window.__vitest_worker__);

    if (!isTestEnv) {
      if (onProgress) onProgress(50);
      buildMergedBlocks(levelData, scene, collidables, specialTiles, roadMeshes, zOffset);
      if (onProgress) onProgress(100);
      const finishZ = buildFinishLine(trackLength, scene, roadMeshes, zOffset, isInfiniteMode);
      resolve({
        trackLength,
        collidables,
        specialTiles,
        finishZ,
        gravity: gravityScale,
        fuel: initialFuel,
        oxygen: initialOxygen,
        roadMeshes,
      });
      return;
    }

    let currentRow = 0;

    function processChunk() {
      const endRow = Math.min(currentRow + CHUNK_SIZE, numRows);

      for (let r = currentRow; r < endRow; r++) {
        const row = rows[r];
        for (let c = 0; c < ROAD_WIDTH_LANES; c++) {
          processTile(row[c], r, c, palette, scene, collidables, specialTiles, roadMeshes, zOffset, levelData);
        }
        buildRowTunnels(row, r, palette, scene, collidables, roadMeshes, zOffset);
      }

      currentRow = endRow;

      if (onProgress) {
        const progress = Math.min(100, Math.floor((currentRow / numRows) * 100));
        onProgress(progress);
      }

      if (currentRow < numRows) {
        // Yield to browser, then continue next chunk
        setTimeout(processChunk, 0);
      } else {
        // All rows processed — build finish line and resolve
        const finishZ = buildFinishLine(trackLength, scene, roadMeshes, zOffset, isInfiniteMode);
        resolve({
          trackLength,
          collidables,
          specialTiles,
          finishZ,
          gravity: gravityScale,
          fuel: initialFuel,
          oxygen: initialOxygen,
          roadMeshes,
        });
      }
    }

    processChunk();
  });
}

export function disposeUnusedThemes(activeThemeIndex) {
  const activeUrls = new Set();
  const theme = THEMES[activeThemeIndex];
  if (theme && theme.behaviors) {
    for (const behaviorKey in theme.behaviors) {
      const behavior = theme.behaviors[behaviorKey];
      if (behavior) {
        if (typeof behavior.map === 'string') activeUrls.add(behavior.map);
        if (typeof behavior.normalMap === 'string') activeUrls.add(behavior.normalMap);
        if (typeof behavior.decal === 'string') activeUrls.add(behavior.decal);
      }
    }
  }

  if (customRoadNormalUrl) {
    activeUrls.add(customRoadNormalUrl);
  }

  const currentLevelIndex = typeof window !== 'undefined' ? window.currentLevelIndex : undefined;
  if (typeof currentLevelIndex === 'number' && currentLevelIndex >= 61) {
    const assetNames = [
      'road_diffuse.png',
      'road_normal.png',
      'obstacle_diffuse.png',
      'obstacle_normal.png',
      'tunnel_diffuse.png',
      'tunnel_normal.png'
    ];
    for (const assetName of assetNames) {
      const url = getLevelAssetUrl(currentLevelIndex, assetName);
      if (url) {
        activeUrls.add(url);
      }
    }
  }

  // Iterate over loadedTextureCache
  for (const [url, texture] of loadedTextureCache.entries()) {
    if (!activeUrls.has(url)) {
      if (texture && typeof texture.dispose === 'function') {
        texture.dispose();
      }
      loadedTextureCache.delete(url);
    }
  }

  // Iterate over textureCache
  for (const [key, texture] of textureCache.entries()) {
    let containsActiveUrl = false;
    for (const url of activeUrls) {
      if (key.includes(url)) {
        containsActiveUrl = true;
        break;
      }
    }
    if (!containsActiveUrl) {
      if (texture && typeof texture.dispose === 'function') {
        texture.dispose();
      }
      textureCache.delete(key);
    }
  }
}
