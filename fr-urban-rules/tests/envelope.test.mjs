/**
 * The theoretical envelope (Sprint 002.7): the per-edge inset on a concave
 * boundary (DEC-1), the ceilings rule by rule (DEC-2), per regime (DEC-3) and
 * the Envelope view (DEC-4). No network: `insetByRole` is pure; the reports
 * are 002.4's acceptance replays and 002.0's recordings, as the other suites.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { __testing, createReader } from '../src/index.js';
import {
  answering,
  loadAcceptance,
  loadPlot,
  recordedFetch,
  recordedSiteService,
  replayFetch,
  replayService,
  requestFor
} from './helpers.mjs';

globalThis.fetch = () => {
  throw new Error('no network in tests');
};

const { insetByRole, VOLUME_LIMITS } = __testing;
const p = (easting, northing) => ({ easting, northing });
const signal = () => new AbortController().signal;

// ── Geometry helpers of the test's own (never the package's) ────────────────────

const area = (ring) =>
  ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a.easting * b.northing - b.easting * a.northing;
  }, 0) / 2;
function gap(q, a, b) {
  const dx = b.easting - a.easting;
  const dy = b.northing - a.northing;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((q.easting - a.easting) * dx + (q.northing - a.northing) * dy) / length));
  return Math.hypot(a.easting + t * dx - q.easting, a.northing + t * dy - q.northing);
}
function inside(q, ring) {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.northing > q.northing !== b.northing > q.northing &&
      q.easting < ((b.easting - a.easting) * (q.northing - a.northing)) / (b.northing - a.northing) + a.easting
    )
      within = !within;
  }
  return within;
}
function properCross(p1, p2, p3, p4) {
  const d = (a, b, c) =>
    (b.easting - a.easting) * (c.northing - a.northing) - (b.northing - a.northing) * (c.easting - a.easting);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}
function simple(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (properCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return false;
    }
  return true;
}

/**
 * The set the rule describes, sampled on a grid: points of the boundary at
 * least each edge's distance from that edge. Answers the sampled true area,
 * the inset's own, and the samples the inset holds that the rule excludes.
 */
function sampled(boundary, distances, ring, step = 0.5) {
  const xs = boundary.map((q) => q.easting);
  const ys = boundary.map((q) => q.northing);
  let truth = 0;
  let held = 0;
  let wrong = 0;
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      const q = p(x, y);
      const inRing = ring !== undefined && inside(q, ring);
      if (!inside(q, boundary)) {
        if (inRing) wrong += 1;
        continue;
      }
      const ok = boundary.every(
        (a, i) => !(distances[i] > 0) || gap(q, a, boundary[(i + 1) % boundary.length]) >= distances[i] - 0.01
      );
      if (ok) truth += 1;
      if (inRing) {
        held += 1;
        if (!ok) wrong += 1;
      }
    }
  }
  return { truth: truth * step * step, held: held * step * step, wrong };
}

/** What an inset must always be (DEC-1 step 3), checked here independently. */
function assertValid(boundary, distances, result, what) {
  assert.ok(result.ring !== undefined, `${what}: ${result.failed}`);
  const ring = result.ring;
  assert.ok(ring.length >= 3, `${what}: three vertices`);
  assert.ok(area(ring) > 1, `${what}: counter-clockwise, more than 1 m²`);
  assert.ok(simple(ring), `${what}: simple`);
  for (const q of ring) {
    const onEdge = boundary.some((a, i) => gap(q, a, boundary[(i + 1) % boundary.length]) <= 0.006);
    assert.ok(onEdge || inside(q, boundary), `${what}: inside the boundary`);
    boundary.forEach((a, i) => {
      if (distances[i] > 0)
        assert.ok(
          gap(q, a, boundary[(i + 1) % boundary.length]) >= distances[i] - 0.006,
          `${what}: vertex at ${gap(q, a, boundary[(i + 1) % boundary.length])} m from edge ${i + 1} (${distances[i]} m)`
        );
    });
  }
}

/** 002.2's half-plane cut (Sutherland–Hodgman), copied as it stood in 0.6.1, as the convex reference. */
function halfPlaneCut(ring, distances) {
  const n = ring.length;
  let out = ring.map((q) => ({ ...q }));
  for (let i = 0; i < n; i += 1) {
    const d = distances[i];
    if (!(d > 0)) continue;
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const length = Math.hypot(b.easting - a.easting, b.northing - a.northing);
    const normal = { x: (b.northing - a.northing) / length, y: -(b.easting - a.easting) / length };
    const s = (q) => (q.easting - a.easting) * normal.x + (q.northing - a.northing) * normal.y + d;
    const next = [];
    for (let k = 0; k < out.length; k += 1) {
      const q = out[k];
      const r = out[(k + 1) % out.length];
      const sq = s(q);
      const sr = s(r);
      if (sq <= 0) next.push(q);
      if ((sq < 0 && sr > 0) || (sq > 0 && sr < 0)) {
        const t = sq / (sq - sr);
        next.push(p(q.easting + t * (r.easting - q.easting), q.northing + t * (r.northing - q.northing)));
      }
    }
    out = next;
    if (out.length < 3) return undefined;
  }
  return out;
}

/**
 * Two rings the same region, within `tolerance` metres: areas within the
 * tolerance times the perimeter, and every vertex of each on the other's
 * outline. `insetByRole` grows each strip by a tenth of a millimetre (its
 * overlay's guard against coincident lines), so its rings stand that much
 * inside the exact ones — stricter, never looser.
 */
function assertSameRegion(a, b, what, tolerance = 1e-6) {
  const perimeter = a.reduce((sum, q, i) => sum + Math.hypot(a[(i + 1) % a.length].easting - q.easting, a[(i + 1) % a.length].northing - q.northing), 0);
  assert.ok(Math.abs(area(a) - area(b)) < Math.max(1e-6, tolerance * perimeter), `${what}: ${area(a)} vs ${area(b)}`);
  const onOutline = (q, ring) =>
    ring.some((r, i) => gap(q, r, ring[(i + 1) % ring.length]) < tolerance);
  for (const q of a) assert.ok(onOutline(q, b), `${what}: ${JSON.stringify(q)}`);
  for (const q of b) assert.ok(onOutline(q, a), `${what}: ${JSON.stringify(q)}`);
}

let seed = 20261021;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

// ── Criterion 3: insetByRole on its own ──────────────────────────────────────────

const GROWN = 2e-3;
const streets = (ring) => ring.map(() => true);

test('criterion 3: on a convex boundary the inset is the former half-plane cut (rectangles, a hexagon, convex polygons, a corner chamfer that collapses)', () => {
  const box = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];
  // rules.test.mjs:734's case: the rear (north) edge 4 m in — right corners, so whatever the roles.
  const rear = insetByRole(box, [0, 0, 4, 0]);
  assertSameRegion(rear.ring, halfPlaneCut(box, [0, 0, 4, 0]), 'rear 4 m', GROWN);
  assert.ok(Math.abs(Math.max(...rear.ring.map((q) => q.northing)) - 26) < 1e-3);
  assert.equal(rear.reentrant, false);
  const cases = [
    [box, [3, 3, 3, 3]],
    [box, [0, 5, 2, 7]],
    [[p(0, 0), p(30, 0), p(30, 20), p(0.5, 20), p(0, 19.5)], [3, 3, 3, 3, 3]], // a 0.7 m chamfer, consumed
    [Array.from({ length: 6 }, (_, i) => p(20 * Math.cos((i * Math.PI) / 3), 20 * Math.sin((i * Math.PI) / 3))), [0, 2, 4, 6, 8, 1]]
  ];
  for (let k = 0; k < 40; k += 1) {
    // Convex polygons whose corners all turn by 20° or more (DEC-1's parity domain).
    const n = 3 + Math.floor(random() * 10);
    const ring = [];
    for (let i = 0; i < n; i += 1) {
      const angle = ((i + 0.3 * random()) / n) * 2 * Math.PI;
      ring.push(p(25 * Math.cos(angle), 18 * Math.sin(angle)));
    }
    const turnsEnough = ring.every((b, i) => {
      const a = ring[(i + n - 1) % n];
      const c = ring[(i + 1) % n];
      const u = [b.easting - a.easting, b.northing - a.northing];
      const v = [c.easting - b.easting, c.northing - b.northing];
      return (u[0] * v[1] - u[1] * v[0]) / (Math.hypot(...u) * Math.hypot(...v)) >= Math.sin((20 * Math.PI) / 180);
    });
    if (!turnsEnough) continue;
    cases.push([ring, ring.map(() => [0, 1, 2, 3, 5][Math.floor(random() * 5)])]);
  }
  assert.ok(cases.length >= 15, `${cases.length} convex cases`);
  // Street edges (review 2026-10-21): the alignment runs on past a convex corner, which is the half-plane.
  for (const [ring, distances] of cases) {
    const reference = halfPlaneCut(ring, distances);
    const result = insetByRole(ring, distances, streets(ring));
    if (reference === undefined || Math.abs(area(reference)) <= 1) {
      assert.equal(result.ring, undefined);
      continue;
    }
    assertSameRegion(result.ring, reference, JSON.stringify(distances), GROWN);
  }
  const chamfer = insetByRole(cases[2][0], cases[2][1], streets(cases[2][0]));
  assert.equal(chamfer.ring.length, 4, 'the chamfer edge collapsed (DEC-1 step 2)');
});

test('criterion 3: an L-shaped boundary gives an L-shaped envelope, its re-entrant corner rounded at the larger setback', () => {
  const L = [p(0, 0), p(20, 0), p(20, 10), p(10, 10), p(10, 30), p(0, 30)];
  const distances = [0, 3, 4, 0, 4, 3];
  const result = insetByRole(L, distances);
  assertValid(L, distances, result, 'L');
  assert.equal(result.reentrant, true);
  const ring = result.ring;
  assert.ok(Math.max(...ring.map((q) => q.easting)) > 16.9, 'the lower leg is kept (to x = 17)');
  assert.ok(Math.max(...ring.map((q) => q.northing)) > 25.9, 'the upper leg is kept (to y = 26)');
  // At the re-entrant corner (10, 10) nothing stands within 4 m (the rear edge's), and no
  // more than a few centimetres beyond the rounded line is lost (tangents every 15°).
  const corner = p(10, 10);
  const near = Math.min(...ring.map((q) => Math.hypot(q.easting - corner.easting, q.northing - corner.northing)));
  assert.ok(near >= 4 - 1e-6, `${near}`);
  const { truth, held, wrong } = sampled(L, distances, ring, 0.25);
  assert.equal(wrong, 0, 'never more than the rule allows');
  assert.ok(held >= truth * 0.97, `${held} of ${truth} m²`);
  // The mitre the draft described would stand within 4 m of the corner: (6, 10) is 4 m away.
  assert.equal(inside(p(7.5, 10.5), ring), false, 'a point 2.5 m from the corner is out');
});

test('criterion 3: a U-shaped boundary keeps both arms and the bay between them', () => {
  const U = [p(0, 0), p(30, 0), p(30, 25), p(20, 25), p(20, 8), p(10, 8), p(10, 25), p(0, 25)];
  const distances = [0, 2, 3, 2, 3, 2, 3, 2];
  const result = insetByRole(U, distances);
  assertValid(U, distances, result, 'U');
  assert.ok(inside(p(5, 20), result.ring), 'the west arm');
  assert.ok(inside(p(25, 20), result.ring), 'the east arm');
  assert.equal(inside(p(15, 12), result.ring), false, 'not in the bay');
  const { truth, held, wrong } = sampled(U, distances, result.ring, 0.25);
  assert.equal(wrong, 0);
  assert.ok(held >= truth * 0.97);
});

test('criterion 3 / DEC-1: setbacks that consume the plot collapse; an inset that splits it is refused as its shape', () => {
  const square = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
  assert.deepEqual(insetByRole(square, [6, 6, 6, 6]), { failed: 'collapsed' });
  assert.deepEqual(insetByRole(square, [4.9, 0, 5.2, 0]), { failed: 'collapsed' });
  // Two 20 m squares joined by a 4 m corridor: 3 m on every edge leaves two pieces.
  const dumbbell = [
    p(0, 0), p(20, 0), p(20, 8), p(30, 8), p(30, 0), p(50, 0),
    p(50, 20), p(30, 20), p(30, 12), p(20, 12), p(20, 20), p(0, 20)
  ];
  assert.deepEqual(insetByRole(dumbbell, dumbbell.map(() => 3)), { failed: 'shape' });
  // 1 m leaves the corridor 2 m wide: one ring.
  assertValid(dumbbell, dumbbell.map(() => 1), insetByRole(dumbbell, dumbbell.map(() => 1)), 'corridor');
});

test('criterion 3: a clockwise boundary is read the other way round; zero-length edges are no edges; no inset is the boundary itself', () => {
  const box = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];
  const ccw = insetByRole(box, [1, 2, 3, 4]);
  const cw = insetByRole([...box].reverse(), [3, 2, 1, 4]);
  assertSameRegion(cw.ring, ccw.ring, 'clockwise', GROWN);
  assert.ok(area(cw.ring) > 0, 'answered counter-clockwise');
  const doubled = insetByRole([p(0, 0), p(20, 0), p(20, 0), p(20, 30), p(0, 30)], [1, 0, 2, 3, 4]);
  assertSameRegion(doubled.ring, ccw.ring, 'a repeated point', GROWN);
  assertSameRegion(insetByRole(box, [0, 0, 0, 0]).ring, box, 'no inset');
});

test('criterion 3: a near-straight cadastral corner between two setbacks is rounded, never carried along the whole neighbouring edge', () => {
  // A street front of two edges turning 0.3°, then a side edge: 0 m on the street, 3 m on the side.
  const ring = [p(0, 0), p(20, 0), p(40, 0.1), p(40, 30), p(0, 30)];
  const distances = [0, 3, 3, 3, 3];
  const result = insetByRole(ring, distances);
  assertValid(ring, distances, result, 'near-straight');
  // The first street edge keeps its front: the outline still reaches y = 0 there.
  assert.ok(result.ring.some((q) => q.northing < 0.01 && q.easting > 2.9 && q.easting < 17.1));
  const { truth, held, wrong } = sampled(ring, distances, result.ring, 0.25);
  assert.equal(wrong, 0);
  assert.ok(held >= truth * 0.97);
});

test('criterion 3: on random concave plots the inset never stands where the rule excludes, and holds nearly all the rule allows', () => {
  let drawn = 0;
  let refused = 0;
  for (let trial = 0; trial < 60; trial += 1) {
    const n = 5 + Math.floor(random() * 16);
    const ring = [];
    for (let i = 0; i < n; i += 1) {
      const angle = ((i + 0.2 * random()) / n) * 2 * Math.PI;
      const radius = 15 + random() * 25;
      ring.push(p(radius * Math.cos(angle), radius * Math.sin(angle)));
    }
    // Edge roles come in contiguous runs: one to three runs of one distance each.
    const distances = ring.map(() => 0);
    for (let run = 1 + Math.floor(random() * 3); run > 0; run -= 1) {
      const start = Math.floor(random() * n);
      const length = 1 + Math.floor((random() * n) / 2);
      const d = [0, 2, 3, 4, 6][Math.floor(random() * 5)];
      for (let j = 0; j < length; j += 1) distances[(start + j) % n] = d;
    }
    const result = insetByRole(ring, distances);
    if (result.ring === undefined) {
      refused += 1;
      continue;
    }
    drawn += 1;
    assertValid(ring, distances, result, `trial ${trial}`);
    const { truth, held, wrong } = sampled(ring, distances, result.ring, 1);
    assert.equal(wrong, 0, `trial ${trial}: a sample the rule excludes`);
    assert.ok(held >= truth * 0.93, `trial ${trial}: ${held} of ${truth} m²`);
  }
  assert.ok(drawn >= 57, `${drawn} drawn, ${refused} refused`);
});

/** The segment-to-segment distance (0 when they cross), the test's own. */
function segmentGap(p1, p2, a, b) {
  if (properCross(p1, p2, a, b)) return 0;
  return Math.min(gap(p1, a, b), gap(p2, a, b), gap(a, p1, p2), gap(b, p1, p2));
}

/** The pieces of the rule's set, sampled on a grid and grown by 4-neighbours: their areas, largest first. */
function pieces(boundary, distances, step = 0.5) {
  const xs = boundary.map((q) => q.easting);
  const ys = boundary.map((q) => q.northing);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const W = Math.ceil((Math.max(...xs) - x0) / step);
  const H = Math.ceil((Math.max(...ys) - y0) / step);
  const allowed = new Uint8Array(W * H);
  for (let i = 0; i < W; i += 1)
    for (let j = 0; j < H; j += 1) {
      const q = p(x0 + (i + 0.5) * step, y0 + (j + 0.5) * step);
      if (!inside(q, boundary)) continue;
      if (boundary.every((a, k) => !(distances[k] > 0) || gap(q, a, boundary[(k + 1) % boundary.length]) >= distances[k] + 0.01))
        allowed[i * H + j] = 1;
    }
  const seen = new Uint8Array(W * H);
  const areas = [];
  for (let s0 = 0; s0 < W * H; s0 += 1) {
    if (!allowed[s0] || seen[s0]) continue;
    let count = 0;
    const stack = [s0];
    seen[s0] = 1;
    while (stack.length > 0) {
      const k = stack.pop();
      count += 1;
      const i = Math.floor(k / H);
      const j = k % H;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const next = a * H + b;
        if (allowed[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    areas.push(count * step * step);
  }
  return areas.sort((a, b) => b - a);
}

test('review 2026-10-21: adversarial plots in Lambert-93 coordinates — notched, near-collinear, with tiny cadastral jogs — never closer to an edge than its setback along any side of the outline, never outside, and refused only where the rule’s own set is empty or in pieces', () => {
  let state = 96210;
  const rnd = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const D = [0, 0, 2, 2.5, 3, 4, 5.77, 6, 10];
  const pick = () => D[Math.floor(rnd() * D.length)];
  const runs = (n) => {
    const ds = Array(n).fill(0);
    for (let r = 1 + Math.floor(rnd() * 3); r > 0; r -= 1) {
      const start = Math.floor(rnd() * n);
      const d = pick();
      for (let j = 1 + Math.floor((rnd() * n) / 2); j > 0; j -= 1) ds[(start + j) % n] = d;
    }
    return ds;
  };
  const LAMBERT = [842000, 6519000];
  const shapes = [];
  for (let t = 0; shapes.length < 120; t += 1) {
    const family = t % 4;
    let ring;
    if (family === 0) {
      // A rectangle with notches cut from its street front.
      const w = 20 + rnd() * 40;
      const h = 20 + rnd() * 40;
      ring = [p(0, 0)];
      let x = 0;
      const k = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < k; i += 1) {
        const x1 = x + (w / k) * (0.2 + 0.3 * rnd());
        const x2 = x1 + (w / k) * (0.1 + 0.3 * rnd());
        const depth = 2 + rnd() * 12;
        ring.push(p(x1, 0), p(x1, depth), p(x2, depth), p(x2, 0));
        x = x2;
      }
      ring.push(p(w, 0), p(w, h), p(0, h));
    } else if (family === 1) {
      // Five corners, each side cut into cadastral pieces turning a few tenths of a degree.
      const base = [p(0, 0), p(30 + rnd() * 20, 0), p(35 + rnd() * 20, 25 + rnd() * 20), p(10, 40 + rnd() * 10), p(-5, 20)];
      ring = [];
      base.forEach((a, i) => {
        const b = base[(i + 1) % base.length];
        const pieces = 1 + Math.floor(rnd() * 5);
        const length = Math.hypot(b.easting - a.easting, b.northing - a.northing);
        for (let j = 0; j < pieces; j += 1) {
          const f = j / pieces;
          const jitter = j === 0 ? 0 : (rnd() - 0.5) * 0.15;
          ring.push(
            p(
              a.easting + f * (b.easting - a.easting) - (jitter * (b.northing - a.northing)) / length,
              a.northing + f * (b.northing - a.northing) + (jitter * (b.easting - a.easting)) / length
            )
          );
        }
      });
    } else if (family === 2) {
      // A star with jogs of 2 cm to 60 cm.
      const n = 6 + Math.floor(rnd() * 12);
      ring = [];
      for (let i = 0; i < n; i += 1) {
        const angle = (i / n) * 2 * Math.PI;
        const radius = 15 + rnd() * 25;
        const q = p(radius * Math.cos(angle), radius * Math.sin(angle));
        ring.push(q);
        if (rnd() < 0.4) {
          const e = 0.02 + rnd() * 0.6;
          const b = rnd() * 2 * Math.PI;
          ring.push(p(q.easting + e * Math.cos(b), q.northing + e * Math.sin(b)));
        }
      }
      if (!simple(ring)) continue;
    } else {
      // The five reference boundaries themselves.
      const plot = ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'][Math.floor(t / 4) % 5];
      ring = __testing.boundaryEdges(captures[plot].site).map((e) => p(e.a.easting - LAMBERT[0], e.a.northing - LAMBERT[1]));
    }
    if (rnd() < 0.5) ring.reverse();
    // Role-like runs of one distance, and (a quarter of them) one distance per edge, the harsher case.
    const distances = t % 8 === 7 ? ring.map(() => pick()) : runs(ring.length);
    shapes.push([ring.map((q) => p(q.easting + LAMBERT[0], q.northing + LAMBERT[1])), distances]);
  }
  let drawn = 0;
  for (const [k, [boundary, distances]] of shapes.entries()) {
    const result = insetByRole(boundary, distances);
    const truth = pieces(boundary, distances);
    const big = truth.filter((a) => a > 1.5);
    if (result.ring === undefined) {
      if (result.failed === 'collapsed')
        assert.ok(big.length === 0, `case ${k}: « no ground » where ${truth[0]} m² are left`);
      else assert.ok(big.length !== 1, `case ${k}: refused (${result.failed}) where the rule leaves one piece: ${truth.join(', ')} m²`);
      continue;
    }
    drawn += 1;
    assertValid(boundary, distances, result, `case ${k}`);
    const ring = result.ring;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      boundary.forEach((x, j) => {
        const y = boundary[(j + 1) % boundary.length];
        assert.ok(!properCross(a, b, x, y) || Math.min(gap(a, x, y), gap(b, x, y)) <= 0.006, `case ${k}: side ${i} leaves the boundary`);
        if (distances[j] > 0)
          assert.ok(segmentGap(a, b, x, y) >= distances[j] - 0.006, `case ${k}: side ${i} at ${segmentGap(a, b, x, y)} m from edge ${j + 1} (${distances[j]} m)`);
      });
    });
    const { truth: allowed, held, wrong } = sampled(boundary, distances, ring, 0.5);
    assert.equal(wrong, 0, `case ${k}: a sample the rule excludes`);
    assert.ok(held >= allowed * 0.9, `case ${k}: ${held} of ${allowed} m²`);
  }
  assert.ok(drawn >= 100, `${drawn} drawn of ${shapes.length}`);
});

// ── The reference plots (002.4's captures) ──────────────────────────────────────

const now = () => new Date(Date.UTC(2026, 9, 20, 12, 0));
const captures = {};
before(async () => {
  for (const plot of ['lyon', 'gordes', 'brouennes', 'mouzay', 'rochefort'])
    captures[plot] = await loadAcceptance(plot);
});

async function readAcceptance(plot, { section } = {}) {
  const captured = captures[plot];
  const held = section === undefined ? captured.section : section;
  const site = replayService(captured.siteCalls, { name: 'site' });
  const reader = createReader({
    fetch: replayFetch(captured.answers),
    now,
    site: () => site,
    roads: () => replayService(captured.context.roads, { name: 'roads' }),
    mapFeatures: () => replayService(captured.context['map-features'], { name: 'map-features' }),
    document: () => replayService(captured.context.document, { name: 'document' }),
    packageData: () => ({
      read: () => held ?? undefined,
      write: () => {
        throw new Error('a read never writes');
      }
    }),
    translate: (key) => key
  });
  try {
    return await reader.read(
      { site: captured.site, country: 'FR', reason: 'site' },
      { signal: signal(), progress: () => {} }
    );
  } finally {
    reader.dispose();
  }
}

const envelopeOf = (report) => report.features.find((f) => f.id === 'envelope');
const envelopeView = (report) => report.views.find((v) => v.id === 'envelope');
const blocksOf = (report, kind) => (envelopeView(report)?.blocks ?? []).filter((b) => b.kind === kind);
const noticeKeys = (report) => blocksOf(report, 'notice').map((b) => b.text.key);
const tables = (report) => blocksOf(report, 'table');
const appliedRows = (report) =>
  tables(report).find((t) => t.columns[1].key === 'fr-urban-rules.envelope.column.effect')?.rows ?? [];
const notAppliedRows = (report) =>
  tables(report).find((t) => t.columns[1].key === 'fr-urban-rules.envelope.column.reason')?.rows ?? [];
const reasonOf = (report, labelKeyOrText) =>
  notAppliedRows(report).find((row) => row[0].key === labelKeyOrText || row[0].text === labelKeyOrText)?.[1]
    ?.key;
const boundaryOf = (plot) => __testing.boundaryEdges(captures[plot].site);

test('criterion 1: Brouennes (RNU) — the concave boundary inset 3 m on side and rear, 0 on the street; slopes 2 for 1 from each non-street chain and 1 for 1 from each opposite alignment', async () => {
  const report = await readAcceptance('brouennes');
  assert.equal(report.regime.code, 'rnu');
  const roles = Object.fromEntries(report.edges.map((e) => [e.edge, e.role]));
  const edges = boundaryOf('brouennes');
  const ring = edges.map((e) => e.a);
  const distances = edges.map((e) => (roles[e.edge] === 'street' ? 0 : 3));
  const envelope = envelopeOf(report);
  assert.ok(envelope, 'an envelope on the concave boundary');
  assert.equal(envelope.official, false);
  assert.deepEqual(envelope.label, { key: 'fr-urban-rules.envelope.label' });
  assertValid(ring, distances, { ring: envelope.rings[0] }, 'Brouennes');
  // The street edges are not set back: the outline runs along each of them.
  for (const e of edges.filter((x) => roles[x.edge] === 'street'))
    assert.ok(envelope.rings[0].some((q) => gap(q, e.a, e.b) < 0.006), `edge ${e.edge} touched`);
  const { truth, held, wrong } = sampled(ring, distances, envelope.rings[0], 0.5);
  assert.equal(wrong, 0);
  assert.ok(held >= truth * 0.97, `${held} of ${truth} m²`);
  // Edges: 1 rear, 2 side, 3 street, 4 side, 5 street, 6 side — two street edges, so two
  // non-street chains ([4] and [6, 1, 2]) and two opposite alignments.
  assert.deepEqual(
    edges.map((e) => roles[e.edge]),
    ['rear', 'side', 'street', 'side', 'street', 'side']
  );
  const slopes = envelope.volume.ceilings;
  const rise2 = slopes.filter((c) => c.kind === 'slope' && c.rise === 2);
  const rise1 = slopes.filter((c) => c.kind === 'slope' && c.rise === 1);
  assert.equal(rise2.length, 2);
  assert.equal(rise1.length, 2);
  assert.ok(rise2.every((c) => c.ruleIds[0] === 'rnu:R.111-17' && c.start === undefined));
  assert.ok(rise1.every((c) => c.ruleIds[0] === 'rnu:R.111-16'));
  // The chains are the boundary's own non-street edges, as polylines.
  const chainKeys = rise2.map((c) => c.from.length).sort();
  assert.deepEqual(chainKeys, [2, 4]);
  // The alignments are the derived `alignment` features' lines.
  const alignments = report.features.filter((f) => f.category === 'alignment' && !f.official);
  for (const c of rise1)
    assert.ok(alignments.some((a) => JSON.stringify(a.line) === JSON.stringify(c.from)));
  assert.equal(slopes.length, 4);
  // DEC-2's assumptions: the boundary as the limit, the adjoining case, the alignment's own.
  const ids = blocksOf(report, 'assumptions')[0].ids;
  for (const id of ['envelope-boundary-slope', 'envelope-adjoining', 'envelope-lattice', 'envelope-checks'])
    assert.ok(ids.includes(id), id);
  assert.ok(ids.some((id) => id.startsWith('alignment-')));
  // R.111-15 (confirmed by the walk) is a distance between buildings: not applied.
  assert.equal(reasonOf(report, 'fr-urban-rules.rule.R111-15'), 'fr-urban-rules.envelope.reason.budget');
  // Criterion 5's other national rows (review 2026-10-21: named by the criterion, asserted nowhere).
  assert.equal(reasonOf(report, 'fr-urban-rules.rule.R111-28'), 'fr-urban-rules.envelope.reason.information');
  assert.equal(reasonOf(report, 'fr-urban-rules.rule.L111-3'), 'fr-urban-rules.envelope.reason.notEvaluable');
  // R.111-15 is confirmed and not drawn: the envelope is looser than it, which the sheet says.
  assert.ok(blocksOf(report, 'assumptions')[0].ids.includes('envelope-not-applied'));
  // Two alignments, two chains: one Applied row per rule and effect (walk, 2026-10-21).
  assert.deepEqual(
    appliedRows(report).map((row) => [row[0].key, row[1].key]),
    [
      ['fr-urban-rules.rule.R111-17', 'fr-urban-rules.envelope.effect.insetSideRear'],
      ['fr-urban-rules.rule.R111-16', 'fr-urban-rules.envelope.effect.slopeAlignment'],
      ['fr-urban-rules.rule.R111-17', 'fr-urban-rules.envelope.effect.slopeBoundary']
    ]
  );
});

test('criterion 2: Lyon — the walk’s « Hauteur Max-22 » is a height of 22 within the prescription’s rings, its 4 m rear setback insets edges 9–13', async () => {
  const report = await readAcceptance('lyon');
  const envelope = envelopeOf(report);
  assert.ok(envelope);
  const height = report.rules.find((r) => r.label.text === 'Hauteur Max-22');
  const prescription = report.features.find((f) => f.category === 'prescription' && f.label.text === 'Hauteur Max-22');
  assert.deepEqual(envelope.volume.ceilings, [
    { kind: 'height', metres: 22, within: prescription.rings, ruleIds: [height.id] }
  ]);
  const roles = Object.fromEntries(report.edges.map((e) => [e.edge, e.role]));
  const edges = boundaryOf('lyon');
  const distances = edges.map((e) => (roles[e.edge] === 'rear' ? 4 : 0));
  assert.deepEqual(
    edges.filter((e) => roles[e.edge] === 'rear').map((e) => e.edge),
    [9, 10, 11, 12, 13]
  );
  assertValid(edges.map((e) => e.a), distances, { ring: envelope.rings[0] }, 'Lyon');
  for (const e of edges.filter((x) => roles[x.edge] === 'street'))
    assert.ok(envelope.rings[0].some((q) => gap(q, e.a, e.b) < 0.006), `street edge ${e.edge}`);
  assert.ok(blocksOf(report, 'assumptions')[0].ids.includes('envelope-height-within'));
});

test('criterion 4: a rule to confirm shapes nothing and is listed « à confirmer »; the section confirming it adds its ceiling; without it, gone again', async () => {
  const without = await readAcceptance('lyon', { section: null });
  const height = without.rules.find((r) => r.label.text === 'Hauteur Max-22');
  assert.equal(height.status, 'to_confirm');
  assert.equal(envelopeOf(without), undefined, 'no confirmed rule: no outline, no volume');
  assert.ok(noticeKeys(without).includes('fr-urban-rules.envelope.notice.noRule'));
  assert.equal(reasonOf(without, 'Hauteur Max-22'), 'fr-urban-rules.envelope.reason.toConfirm');
  const confirmed = await readAcceptance('lyon');
  assert.equal(envelopeOf(confirmed).volume.ceilings[0].ruleIds[0], height.id);
  assert.equal(reasonOf(confirmed, 'Hauteur Max-22'), undefined);
  assert.ok(appliedRows(confirmed).some((row) => row[0].text === 'Hauteur Max-22'));
  const again = await readAcceptance('lyon', { section: null });
  assert.equal(envelopeOf(again), undefined);
});

test('criterion 7: Rochefort (not on the GPU) has no envelope and says why; Gordes (nothing confirmed that shapes one) says so', async () => {
  const rochefort = await readAcceptance('rochefort');
  assert.equal(rochefort.regime.code, 'not_published');
  assert.equal(envelopeOf(rochefort), undefined, 'the entered 10 m height invents no envelope');
  assert.deepEqual(noticeKeys(rochefort), ['fr-urban-rules.envelope.notice.notPublished']);
  const gordes = await readAcceptance('gordes');
  assert.equal(envelopeOf(gordes), undefined);
  assert.deepEqual(noticeKeys(gordes), ['fr-urban-rules.envelope.notice.noRule']);
  for (const row of notAppliedRows(gordes))
    assert.equal(row[1].key, 'fr-urban-rules.envelope.reason.budget', 'the extension caps are budgets');
});

test('DEC-3: Mouzay (carte communale, constructible sector) draws as the RNU — a 3 m inset and the R.111-16 and R.111-17 slopes', async () => {
  const report = await readAcceptance('mouzay');
  assert.equal(report.regime.code, 'cc');
  const envelope = envelopeOf(report);
  assert.ok(envelope);
  const roles = Object.fromEntries(report.edges.map((e) => [e.edge, e.role]));
  const edges = boundaryOf('mouzay');
  const distances = edges.map((e) => (roles[e.edge] === 'street' ? 0 : 3));
  assertValid(edges.map((e) => e.a), distances, { ring: envelope.rings[0] }, 'Mouzay');
  assert.ok(envelope.volume.ceilings.some((c) => c.rise === 2 && c.ruleIds[0] === 'rnu:R.111-17'));
  assert.ok(envelope.volume.ceilings.some((c) => c.rise === 1 && c.ruleIds[0] === 'rnu:R.111-16'));
  // L.111-3 is the RNU's alone.
  assert.equal(report.rules.some((r) => r.id === 'rnu:L.111-3'), false);
});

test('criterion 9: the Envelope view — ground area, the confirmed height, applied and not applied rules, the corrected volume sentence — after the checks, no volume in m³', async () => {
  const report = await readAcceptance('lyon');
  const ids = report.views.map((v) => v.id);
  assert.equal(ids.indexOf('envelope'), ids.indexOf('checks') + 1, 'after the checks view');
  const view = envelopeView(report);
  assert.deepEqual(view.label, { key: 'fr-urban-rules.view.envelope' });
  const rows = blocksOf(report, 'fields')[0].rows;
  assert.deepEqual(
    rows.map((r) => [r.label.key, r.value.unit]),
    [
      ['fr-urban-rules.envelope.field.groundArea', 'm2'],
      ['fr-urban-rules.envelope.field.heightWithin', 'm']
    ]
  );
  assert.ok(Math.abs(rows[0].value.value - Math.abs(area(envelopeOf(report).rings[0]))) < 0.01);
  assert.equal(rows[1].value.value, 22);
  assert.deepEqual(
    appliedRows(report).map((row) => [row[0].key ?? row[0].text, row[1].key, row[2].value ?? row[2].key]),
    [
      ['fr-urban-rules.entered.kind.rear_setback', 'fr-urban-rules.envelope.effect.insetRear', 4],
      ['Hauteur Max-22', 'fr-urban-rules.envelope.effect.heightWithin', 22]
    ]
  );
  assert.equal(reasonOf(report, 'fr-urban-rules.entered.kind.footprint_ratio'), 'fr-urban-rules.envelope.reason.notRegulated');
  const assumed = blocksOf(report, 'assumptions')[0].ids;
  for (const id of ['envelope-approximate', 'envelope-reentrant-corners', 'envelope-lattice', 'envelope-checks', 'envelope-height-ground'])
    assert.ok(assumed.includes(id), id);
  for (const id of assumed) assert.ok(report.assumptions.some((a) => a.id === id), `${id} is in the report`);
  // No figure in m³ anywhere in the view.
  assert.doesNotMatch(JSON.stringify(view), /m3|volume\.m/);
});

// ── Synthetic reads (002.0's Lyon recording, a section and a boundary of the test's) ──

const plots = {};
before(async () => {
  for (const plot of ['lyon', 'mouzay']) plots[plot] = await loadPlot(plot);
});
const SOUTH_ROAD = [
  { id: 'r', line: [p(-20, -6), p(80, -6)], kind: 'road', level: 'ground', widthMetres: 6, name: 'Rue', attribution: '© IGN' }
];
function store(initial) {
  let held = initial;
  return {
    service: {
      read: () => (held === undefined ? undefined : structuredClone(held)),
      write: (next) => {
        held = structuredClone(next);
        return true;
      }
    }
  };
}
function lyonReader({ boundary, overrides = {}, scaled = false } = {}) {
  const { site: recordedSite, conversions, answers } = plots.lyon;
  const site = boundary === undefined ? recordedSite : { ...recordedSite, boundary: { ring: boundary } };
  const recorded = recordedSiteService(site, conversions);
  const service = scaled
    ? {
        ...recorded,
        toGeographicRing: (ring) => ring.map((q) => ({ longitude: q.easting / 1e5, latitude: q.northing / 1e5 })),
        fromGeographicRing: (ring) => ring.map((q) => ({ easting: q.longitude * 1e5, northing: q.latitude * 1e5 }))
      }
    : recorded;
  const data = store(undefined);
  const reader = createReader({
    fetch: recordedFetch(answers, overrides).fetch,
    site: () => service,
    roads: () => ({ queryRoads: async () => SOUTH_ROAD }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  return { reader, site };
}
const read = (context) => context.reader.read(requestFor(context.site), { signal: signal() });
const act = (context, actionId, target, values) =>
  context.reader.runAction(
    { actionId, target, ...(values === undefined ? {} : { values }), site: context.site },
    { signal: signal() }
  );
const ruleActions = (report) =>
  report.views
    .find((v) => v.id === 'rules')
    .blocks.filter((b) => b.kind === 'actions')
    .flatMap((b) => b.actions);
const enter = async (context, form, kind, value) => {
  const report = await read(context);
  const target = ruleActions(report).find((a) => a.id === form).target;
  const answer = await act(context, form, target, { kind, statement: 'limit', value, source: 'Règlement' });
  assert.equal(answer.status, 'done', JSON.stringify(answer));
};
const BOX = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];

test('criterion 5: a façade height, the budgets and the distance between buildings are listed under Not applied, each with its reason', async () => {
  const context = lyonReader({ boundary: BOX });
  await enter(context, 'add-distance', 'height_facade', 9);
  await enter(context, 'add-ratio', 'footprint_ratio', 40);
  await enter(context, 'add-ratio', 'green_ratio', 20);
  await enter(context, 'add-distance', 'building_distance', 4);
  await enter(context, 'add-distance', 'rear_setback', 5);
  const report = await read(context);
  assert.equal(reasonOf(report, 'fr-urban-rules.entered.kind.height_facade'), 'fr-urban-rules.envelope.reason.heightFacade');
  for (const key of ['footprint_ratio', 'green_ratio', 'building_distance'])
    assert.equal(reasonOf(report, `fr-urban-rules.entered.kind.${key}`), 'fr-urban-rules.envelope.reason.budget', key);
  // The rear setback alone shapes it: an outline, no volume, and the view says why.
  const envelope = envelopeOf(report);
  assert.equal(envelope.volume, undefined);
  assert.ok(noticeKeys(report).includes('fr-urban-rules.envelope.notice.noCeiling'));
  // Review 2026-10-21: confirmed rules the envelope does not draw leave it looser than the
  // rules — an assumption, so the sheet (which prints assumptions, not the view) says it.
  assert.ok(blocksOf(report, 'assumptions')[0].ids.includes('envelope-not-applied'));
  assert.ok(report.assumptions.some((a) => a.id === 'envelope-not-applied'));
  assert.ok(Math.abs(Math.max(...envelope.rings[0].map((q) => q.northing)) - 25) < 1e-3);
});

test('criterion 6: setbacks that consume the plot, and an inset that splits it, give no outline, no volume and a notice', async () => {
  const consumed = lyonReader({ boundary: BOX });
  await enter(consumed, 'add-distance', 'rear_setback', 31);
  await enter(consumed, 'add-distance', 'height_total', 12);
  let report = await read(consumed);
  assert.equal(envelopeOf(report), undefined);
  assert.ok(noticeKeys(report).includes('fr-urban-rules.envelope.notice.collapsed'));
  assert.equal(reasonOf(report, 'fr-urban-rules.entered.kind.height_total'), 'fr-urban-rules.envelope.reason.noOutline');
  // A dumbbell plot facing the road on its south edges; 3 m on its sides and rear splits it.
  const dumbbell = [
    p(0, 0), p(20, 0), p(20, 8), p(30, 8), p(30, 0), p(50, 0),
    p(50, 20), p(30, 20), p(30, 12), p(20, 12), p(20, 20), p(0, 20)
  ];
  const split = lyonReader({ boundary: dumbbell });
  await enter(split, 'add-distance', 'side_setback', 3);
  await enter(split, 'add-distance', 'rear_setback', 3);
  await enter(split, 'add-distance', 'street_setback', 3);
  report = await read(split);
  assert.equal(envelopeOf(report), undefined);
  assert.ok(noticeKeys(report).includes('fr-urban-rules.envelope.notice.shape'));
});

test('criterion 8: two heights over the whole plot merge into the lower, naming both; every volume sent is within 096.9’s limits', async () => {
  const context = lyonReader({ boundary: BOX });
  await enter(context, 'add-distance', 'height_total', 12);
  await enter(context, 'add-distance', 'height_total', 10);
  const report = await read(context);
  const ceilings = envelopeOf(report).volume.ceilings;
  assert.equal(ceilings.length, 1);
  assert.equal(ceilings[0].kind, 'height');
  assert.equal(ceilings[0].metres, 10);
  assert.equal(ceilings[0].within, undefined);
  assert.equal(ceilings[0].ruleIds.length, 2);
  // No setback: the outline is the boundary itself, drawn because a ceiling stands on it.
  assert.ok(Math.abs(area(envelopeOf(report).rings[0]) - 600) < 1e-6);
  assert.deepEqual(VOLUME_LIMITS, { ceilings: 8, rise: 20, metres: 500, start: 500, volumes: 16 });
});

/** `count` drawn heights (CNIG 39), each over its own 10 m square, in plain-scaled coordinates. */
function drawnHeights(count, metres = (i) => 9 + i) {
  return {
    type: 'FeatureCollection',
    totalFeatures: count,
    features: Array.from({ length: count }, (_, i) => {
      const x = 2 * i;
      const ring = [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]].map(([e, n]) => [e / 1e5, n / 1e5]);
      return {
        type: 'Feature',
        id: `prescription_surf.${i}`,
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { libelle: `Hauteur Max-${metres(i)}`, txt: String(metres(i)), typepsc: '39', stypepsc: '02', datvalid: '20260326' }
      };
    })
  };
}

test('criterion 8: a lower height within a prescription than over the plot is kept; one above it is dropped; past 8 ceilings the volume is not sent, the outline kept, the view says so', async () => {
  const confirmAll = async (context) => {
    let report = await read(context);
    for (const rule of report.rules.filter((r) => r.kind === 'height_total' && r.status === 'to_confirm')) {
      const action = ruleActions(report).find((a) => a.id === 'confirm' && a.target.ruleId === rule.id);
      await act(context, 'confirm', action.target);
      report = await read(context);
    }
    return report;
  };
  const two = lyonReader({
    boundary: BOX,
    scaled: true,
    overrides: { 'apicarto-prescription-surf': answering(200, drawnHeights(2, (i) => [9, 30][i])) }
  });
  await enter(two, 'add-distance', 'height_total', 20);
  let report = await confirmAll(two);
  let ceilings = envelopeOf(report).volume.ceilings;
  assert.deepEqual(
    ceilings.map((c) => [c.metres, c.within === undefined]).sort(),
    [[20, true], [9, false]].sort(),
    'the 30 m within is above the 20 m everywhere: dropped'
  );
  const nine = lyonReader({
    boundary: BOX,
    scaled: true,
    overrides: { 'apicarto-prescription-surf': answering(200, drawnHeights(9)) }
  });
  await enter(nine, 'add-distance', 'rear_setback', 2);
  report = await confirmAll(nine);
  assert.equal(report.rules.filter((r) => r.kind === 'height_total' && r.status === 'confirmed').length, 9);
  const envelope = envelopeOf(report);
  assert.ok(envelope, 'the outline is kept');
  assert.equal(envelope.volume, undefined, 'nine ceilings: not sent');
  assert.ok(noticeKeys(report).includes('fr-urban-rules.envelope.notice.pastLimits'));
  assert.equal(reasonOf(report, 'Hauteur Max-9'), 'fr-urban-rules.envelope.reason.pastLimits');
  ceilings = undefined;
});

test('criterion 7: a carte communale sector closed to construction has no envelope, and says why; a plot only partly in one draws it, said', async () => {
  const { site: recorded, conversions, answers } = plots.mouzay;
  // 002.0's Mouzay recording has no Site boundary: a rectangle of the test's.
  const site = { ...recorded, boundary: { ring: BOX } };
  const readWith = async (edit) => {
    const sectors = structuredClone(answers.get('apicarto-secteur-cc').body);
    edit(sectors);
    const reader = createReader({
      fetch: recordedFetch(answers, { 'apicarto-secteur-cc': answering(200, sectors) }).fetch,
      site: () => recordedSiteService(site, conversions),
      roads: () => ({ queryRoads: async () => [] })
    });
    return reader.read(requestFor(site), { signal: signal() });
  };
  const closed = await readWith((sectors) => {
    sectors.features[0].properties.typesect = '03';
  });
  assert.equal(envelopeOf(closed), undefined);
  assert.deepEqual(noticeKeys(closed), ['fr-urban-rules.envelope.notice.ccRestricted']);
  const partly = await readWith((sectors) => {
    const second = structuredClone(sectors.features[0]);
    second.id = 'secteur_cc.2';
    second.properties.typesect = '03';
    sectors.features.push(second);
  });
  assert.ok(envelopeOf(partly));
  assert.ok(noticeKeys(partly).includes('fr-urban-rules.envelope.notice.ccPartly'));
  // Review 2026-10-21: drawn over the restricted part too, so said where the sheet reads it.
  assert.ok(partly.assumptions.some((a) => a.id === 'envelope-cc-partly'));
});

test('review 2026-10-21: a street edge with no opposite alignment still gets R.111-16’s slope — from the edge itself, stricter — and says so', async () => {
  const { site: recorded, conversions, answers } = plots.mouzay;
  // A carte communale (national rules), no road found, the south edge named the street by the user.
  const site = { ...recorded, boundary: { ring: BOX } };
  const data = store({
    schema: 1,
    edgeRoles: [
      {
        plot: [...new Set((site.parcels ?? []).map((parcel) => String(parcel.featureId)))].sort(),
        ends: [[0, 0], [20, 0]],
        role: 'street',
        at: '2026-10-21T09:00:00.000Z'
      }
    ]
  });
  const reader = createReader({
    fetch: recordedFetch(answers).fetch,
    site: () => recordedSiteService(site, conversions),
    roads: () => ({ queryRoads: async () => [] }),
    packageData: () => data.service,
    document: () => ({ find: () => [] }),
    translate: (key) => key
  });
  const report = await reader.read(requestFor(site), { signal: signal() });
  assert.equal(report.regime.code, 'cc');
  assert.deepEqual(
    report.edges.filter((e) => e.role === 'street').map((e) => e.edge),
    [1]
  );
  assert.equal(report.features.some((f) => f.category === 'alignment'), false, 'no alignment derived');
  const ceilings = envelopeOf(report).volume.ceilings;
  // Before the review R.111-16 was "not applied" here, and the volume stood over the street
  // front unbounded by it.
  const r11116 = ceilings.filter((c) => c.ruleIds[0] === 'rnu:R.111-16');
  assert.deepEqual(r11116.map((c) => [c.from, c.rise]), [[[p(0, 0), p(20, 0)], 1]]);
  assert.ok(ceilings.length <= VOLUME_LIMITS.ceilings);
  assert.ok(blocksOf(report, 'assumptions')[0].ids.includes('envelope-alignment-missing'));
  assert.ok(
    appliedRows(report).some(
      (row) => row[0].key === 'fr-urban-rules.rule.R111-16' && row[1].key === 'fr-urban-rules.envelope.effect.slopeStreet'
    )
  );
  assert.equal(reasonOf(report, 'fr-urban-rules.rule.R111-16'), undefined);
});

test('criterion 7: `unknown` (no Site, or the source silent) has no envelope view at all — never read as RNU', async () => {
  const reader = createReader({ fetch: () => Promise.reject(new Error('down')), site: () => undefined });
  const report = await reader.read(requestFor(undefined), { signal: signal() });
  assert.equal(report.regime.code, 'unknown');
  assert.equal(envelopeView(report), undefined);
  assert.equal(envelopeOf(report), undefined);
});
