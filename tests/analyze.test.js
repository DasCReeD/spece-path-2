import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Level Analysis', () => {
  it('should analyze original levels and generate level_patterns.json', async () => {
    const outputPath = path.resolve(__dirname, '../data/level_patterns.json');
    
    // If output file already exists, delete it first to ensure we test generation
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    // Dynamic import to execute the analysis script
    await import('../scratch/analyze_original_levels.js');
    
    // Verify file exists
    expect(fs.existsSync(outputPath)).toBe(true);
    
    // Verify valid JSON and structure
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(data).toBeDefined();
    expect(data.standard).toBeDefined();
    expect(data.xmas).toBeDefined();
    expect(data.combined).toBeDefined();
    
    // Verify standard level global stats
    expect(data.standard.global_stats).toBeDefined();
    expect(data.standard.global_stats.count).toBe(31);
    
    // Verify xmas level global stats
    expect(data.xmas.global_stats).toBeDefined();
    expect(data.xmas.global_stats.count).toBe(31);
    
    // Verify combined level global stats
    expect(data.combined.global_stats).toBeDefined();
    expect(data.combined.global_stats.count).toBe(62);
  });
});
