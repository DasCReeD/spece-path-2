import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('10 Worlds Asset Generation Pipeline', () => {
  it('should run python generator to produce 2D diffuse, normal maps, and decals for the 10 new biomes', () => {
    const customDir = path.resolve(__dirname, '../assets/custom');

    // Run generate_comfy_assets_10_worlds.py
    let runSuccess = false;
    const commands = [
      'python scratch/generate_comfy_assets_10_worlds.py',
      'python3 scratch/generate_comfy_assets_10_worlds.py',
      'py scratch/generate_comfy_assets_10_worlds.py'
    ];

    for (const cmd of commands) {
      try {
        console.log(`Running asset generator command: ${cmd}`);
        execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
        runSuccess = true;
        break;
      } catch (err) {
        console.warn(`Command failed: ${cmd}`, err.message);
      }
    }

    expect(runSuccess).toBe(true);

    // 10 new biomes
    const themes = [
      'void', 'ridge', 'thrill', 'core', 'glitch',
      'tundra', 'furnace', 'shallows', 'spire', 'pulse'
    ];
    
    // 3 asset types
    const types = ['road', 'obstacle', 'tunnel'];

    // Verify diffuse and normal maps exist for each theme and each type (both conventions)
    for (const theme of themes) {
      for (const type of types) {
        // Convention 1: {theme}_{type}_diffuse.png
        const diff1 = path.join(customDir, `${theme}_${type}_diffuse.png`);
        const norm1 = path.join(customDir, `${theme}_${type}_normal.png`);
        
        // Convention 2: {type}_diffuse_{theme}.png
        const diff2 = path.join(customDir, `${type}_diffuse_${theme}.png`);
        const norm2 = path.join(customDir, `${type}_normal_${theme}.png`);

        expect(fs.existsSync(diff1), `Missing file: ${diff1}`).toBe(true);
        expect(fs.existsSync(norm1), `Missing file: ${norm1}`).toBe(true);
        expect(fs.existsSync(diff2), `Missing file: ${diff2}`).toBe(true);
        expect(fs.existsSync(norm2), `Missing file: ${norm2}`).toBe(true);

        expect(fs.statSync(diff1).size).toBeGreaterThan(0);
        expect(fs.statSync(norm1).size).toBeGreaterThan(0);
        expect(fs.statSync(diff2).size).toBeGreaterThan(0);
        expect(fs.statSync(norm2).size).toBeGreaterThan(0);
      }
    }

    // Verify decals exist for all 10 themes
    const decalNames = ['boost', 'slow', 'explosive', 'refill', 'sticky', 'slippery'];
    for (const decal of decalNames) {
      const baseDecal = path.join(customDir, `decal_${decal}.png`);
      expect(fs.existsSync(baseDecal), `Missing base decal: ${baseDecal}`).toBe(true);
      expect(fs.statSync(baseDecal).size).toBeGreaterThan(0);

      for (const theme of themes) {
        const themeDecal = path.join(customDir, `decal_${decal}_${theme}.png`);
        expect(fs.existsSync(themeDecal), `Missing theme decal: ${themeDecal}`).toBe(true);
        expect(fs.statSync(themeDecal).size).toBeGreaterThan(0);
      }
    }
  });

  it('should run python level asset generator to produce 3D models and level assets for level 61 to 90', () => {
    const customDir = path.resolve(__dirname, '../assets/custom');

    // Run generate_assets_50_per_level.py
    let runSuccess = false;
    const commands = [
      'python scratch/generate_assets_50_per_level.py',
      'python3 scratch/generate_assets_50_per_level.py',
      'py scratch/generate_assets_50_per_level.py'
    ];

    for (const cmd of commands) {
      try {
        console.log(`Running level asset generator command: ${cmd}`);
        execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
        runSuccess = true;
        break;
      } catch (err) {
        console.warn(`Command failed: ${cmd}`, err.message);
      }
    }

    expect(runSuccess).toBe(true);

    // Verify all folders level_61 to level_90 and their obj/png files exist
    for (let level = 61; level <= 90; level++) {
      const levelDir = path.join(customDir, `level_${level}`);
      expect(fs.existsSync(levelDir), `Missing level directory: ${levelDir}`).toBe(true);

      // Verify some key files in the level directory
      const roadDiff = path.join(levelDir, 'road_diffuse.png');
      const roadNorm = path.join(levelDir, 'road_normal.png');
      expect(fs.existsSync(roadDiff)).toBe(true);
      expect(fs.existsSync(roadNorm)).toBe(true);

      // Check some of the obj models and make sure they use v/vt format, not v/vt/vn
      for (let m = 1; m <= 10; m++) {
        const obsModel = path.join(levelDir, `obstacle_model_${m}.obj`);
        const scModel = path.join(levelDir, `scenery_model_${m}.obj`);
        expect(fs.existsSync(obsModel), `Missing obstacle model: ${obsModel}`).toBe(true);
        expect(fs.existsSync(scModel), `Missing scenery model: ${scModel}`).toBe(true);

        // Verify the obj file doesn't contain normals (vn) and uses clean v/vt format
        const content = fs.readFileSync(obsModel, 'utf-8');
        expect(content.includes('vn ')).toBe(false);
        
        // Face definition check: should match 'f ' followed by numbers/numbers (no second slash for vn)
        // e.g. f 1/1 2/2 3/3
        const faceLines = content.split('\n').filter(line => line.startsWith('f '));
        for (const line of faceLines) {
          expect(line).not.toMatch(/\/\//); // no v//vn
          expect(line.split(' ').slice(1).every(v => {
            if (!v.trim()) return true;
            return v.split('/').length === 2;
          })).toBe(true);
        }
      }
    }
  });

  it('should run python level generator to produce 3D OBJ obstacle meshes and verify clean faces format', () => {
    const customDir = path.resolve(__dirname, '../assets/custom');

    // Run generate_assets_50_per_level.py
    let runSuccess = false;
    const commands = [
      'python scratch/generate_assets_50_per_level.py',
      'python3 scratch/generate_assets_50_per_level.py',
      'py scratch/generate_assets_50_per_level.py'
    ];

    for (const cmd of commands) {
      try {
        console.log(`Running level asset generator command: ${cmd}`);
        execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
        runSuccess = true;
        break;
      } catch (err) {
        console.warn(`Command failed: ${cmd}`, err.message);
      }
    }

    expect(runSuccess).toBe(true);

    // Verify assets for levels 61 to 90
    for (let level = 61; level <= 90; level++) {
      const levelDir = path.join(customDir, `level_${level}`);
      expect(fs.existsSync(levelDir), `Missing level directory: ${levelDir}`).toBe(true);

      // Verify that road_diffuse.png, obstacle_diffuse.png, tunnel_diffuse.png exist
      const requiredImages = [
        'road_diffuse.png', 'road_normal.png',
        'obstacle_diffuse.png', 'obstacle_normal.png',
        'tunnel_diffuse.png', 'tunnel_normal.png'
      ];
      for (const imgName of requiredImages) {
        const p = path.join(levelDir, imgName);
        expect(fs.existsSync(p), `Missing asset: ${p}`).toBe(true);
        expect(fs.statSync(p).size).toBeGreaterThan(0);
      }

      // Verify 10 obstacle models are generated and have clean v/vt face formats
      for (let m = 1; m <= 10; m++) {
        const obsPath = path.join(levelDir, `obstacle_model_${m}.obj`);
        expect(fs.existsSync(obsPath), `Missing obstacle model: ${obsPath}`).toBe(true);
        expect(fs.statSync(obsPath).size).toBeGreaterThan(0);

        // Read and parse the OBJ file to verify format
        const content = fs.readFileSync(obsPath, 'utf8');
        const lines = content.split('\n');

        // It must NOT contain the normal definition overrides line: vn 0.0 1.0 0.0 or any vn lines
        const hasNormalOverride = lines.some(line => line.trim().startsWith('vn'));
        expect(hasNormalOverride, `Level ${level} obstacle_model_${m}.obj should not contain 'vn' lines`).toBe(false);

        // Faces must be in v/vt format, not v/vt/vn. E.g. f 1/1 2/2 7/3
        const faceLines = lines.filter(line => line.trim().startsWith('f '));
        expect(faceLines.length).toBeGreaterThan(0);
        for (const faceLine of faceLines) {
          const parts = faceLine.trim().split(/\s+/).slice(1);
          for (const part of parts) {
            expect(part).toMatch(/^\d+\/\d+$/); // v/vt format
            expect(part.includes('//')).toBe(false);
          }
        }
      }
    }
  });
});
