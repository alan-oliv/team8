import { describe, expect, it } from 'vitest';
import { REDUCED_END, SPLASH_END, splashFrame } from './splash-frame';

describe('assemble', () => {
  it('starts every node invisible, 220px out along its own ray', () => {
    const f = splashFrame(0, false);
    expect(f.nodes).toHaveLength(10);
    for (const n of f.nodes) {
      expect(n.opacity).toBe(0);
      expect(Math.hypot(n.dx, n.dy)).toBeCloseTo(220, 5);
    }
    // Node 0 sits above-left of centre, so it flies in from above-left.
    expect(f.nodes[0].dx).toBeLessThan(0);
    expect(f.nodes[0].dy).toBeLessThan(0);
    expect(f.done).toBe(false);
  });

  it('lands node 0 at 0.8s with an overshoot while the lead has not started', () => {
    const f = splashFrame(0.8, false);
    expect(f.nodes[0].opacity).toBe(1);
    expect(f.nodes[0].dx).toBeCloseTo(0, 5);
    expect(f.nodes[0].dy).toBeCloseTo(0, 5);
    expect(f.nodes[0].scale).toBeGreaterThan(1);
    expect(f.nodes[1].lead).toBe(true);
    expect(f.nodes[1].opacity).toBe(0);
  });

  it('settles node 0 to scale 1 by 0.9s and lands the lead at 1.8s', () => {
    expect(splashFrame(0.9, false).nodes[0].scale).toBeCloseTo(1, 5);
    const lead = splashFrame(1.8, false).nodes[1];
    expect(lead.opacity).toBe(1);
    expect(lead.dx).toBeCloseTo(0, 5);
  });
});

describe('hold', () => {
  it('has the bloom fully in and every glow at full by 2.45s', () => {
    const f = splashFrame(2.45, false);
    expect(f.bloomOpacity).toBeCloseTo(1, 5);
    expect(f.bloomScale).toBeCloseTo(1, 5);
    expect(f.nodes[0].glow).toBeCloseTo(8, 5); // 2*settle + 6*bloom
    expect(f.nodes[1].glow).toBeCloseTo(17, 5); // 5*settle + 12*bloom
  });

  it('has the bloom absent before 1.75s and breathes the mark to 1.05 by 3.3s', () => {
    expect(splashFrame(1.75, false).bloomOpacity).toBe(0);
    expect(splashFrame(1.75, false).bloomScale).toBeCloseTo(0.6, 5);
    expect(splashFrame(2.0, false).breathe).toBeCloseTo(1, 5);
    expect(splashFrame(3.3, false).breathe).toBeCloseTo(1.05, 5);
  });
});

describe('exit', () => {
  it('fades the lead first, gone and shrunk to 86% by 3.54s', () => {
    const lead = splashFrame(3.54, false).nodes[1];
    expect(lead.opacity).toBe(0);
    expect(lead.scale).toBeCloseTo(0.86, 5);
    // Node 2 waits 0.46s, so at 3.2s it is still fully there.
    expect(splashFrame(3.2, false).nodes[2].opacity).toBe(1);
  });

  it('has the bloom out by 3.5s and the frame empty and done at 4.4s', () => {
    expect(splashFrame(3.5, false).bloomOpacity).toBe(0);
    const f = splashFrame(SPLASH_END, false);
    for (const n of f.nodes) expect(n.opacity).toBe(0);
    expect(f.bloomOpacity).toBe(0);
    expect(f.done).toBe(true);
    expect(splashFrame(4.39, false).done).toBe(false);
  });
});

describe('reduced motion', () => {
  it('cross-fades the assembled mark in over 0.5s and out by 1.5s', () => {
    const start = splashFrame(0, true);
    for (const n of start.nodes) {
      expect(n.opacity).toBe(0);
      expect(n.dx).toBe(0);
      expect(n.dy).toBe(0);
      expect(n.scale).toBe(1);
    }
    expect(splashFrame(0.25, true).nodes[0].opacity).toBeCloseTo(0.5, 5);
    const held = splashFrame(0.75, true);
    expect(held.nodes[0].opacity).toBe(1);
    expect(held.bloomOpacity).toBe(1);
    expect(held.bloomScale).toBe(1);
    expect(held.breathe).toBe(1);
    expect(held.nodes[1].glow).toBe(17);
    const end = splashFrame(REDUCED_END, true);
    for (const n of end.nodes) expect(n.opacity).toBe(0);
    expect(end.bloomOpacity).toBe(0);
    expect(end.done).toBe(true);
  });
});
