// tests/worldBuilder.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Baked Generated Levels Structure & Integrity Tests', () => {
  const jsonPath = path.resolve('data/generated_levels.json');
  
  it('should have a generated levels file', () => {
    expect(fs.existsSync(jsonPath)).toBe(true);
  });

  const levels = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  it('should contain exactly 30 levels', () => {
    expect(levels).toBeInstanceOf(Array);
    expect(levels).toHaveLength(30);
  });

  it('should have levels index sequentially from 61 to 90', () => {
    levels.forEach((lvl, idx) => {
      expect(lvl.level_index).toBe(61 + idx);
    });
  });

  it('should have valid level properties', () => {
    levels.forEach((lvl) => {
      expect(typeof lvl.gravity).toBe('number');
      expect(lvl.gravity).toBeGreaterThan(0);
      
      expect(typeof lvl.fuel).toBe('number');
      expect(lvl.fuel).toBeGreaterThan(0);
      
      expect(typeof lvl.oxygen).toBe('number');
      expect(lvl.oxygen).toBeGreaterThan(0);

      expect(lvl.palette).toBeInstanceOf(Array);
      expect(lvl.palette).toHaveLength(32);
      lvl.palette.forEach((color) => {
        expect(color).toBeInstanceOf(Array);
        expect(color).toHaveLength(3);
        color.forEach(c => {
          expect(typeof c).toBe('number');
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        });
      });
    });
  });

  it('should contain rows of width 7', () => {
    levels.forEach((lvl) => {
      expect(lvl.rows).toBeInstanceOf(Array);
      expect(lvl.rows.length).toBeGreaterThan(50); // check length is reasonable
      
      lvl.rows.forEach((row) => {
        expect(row).toBeInstanceOf(Array);
        expect(row).toHaveLength(7);
        
        row.forEach((tile) => {
          if (tile !== null) {
            expect(typeof tile).toBe('object');
            expect(typeof tile.val).toBe('number');
            expect(typeof tile.full).toBe('boolean');
            expect(typeof tile.half).toBe('boolean');
            expect(typeof tile.tunnel).toBe('boolean');
            expect(typeof tile.top_color).toBe('number');
            expect(typeof tile.bottom_color).toBe('number');
          }
        });
      });
    });
  });
});
