// util.js — small shared helpers for Port Azura: Heat: math, a seeded random
// generator (so the city is the same city on every load), collision shapes and
// text formatting. Everything hangs off the global PA namespace; the game uses
// classic scripts loaded in order from index.html.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  function angleTo(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  // Shortest signed difference between two headings, in (-PI, PI].
  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function turnToward(current, target, maxStep) {
    const d = angleDiff(current, target);
    if (Math.abs(d) <= maxStep) return target;
    return current + Math.sign(d) * maxStep;
  }

  // mulberry32: a tiny deterministic RNG. The city builder and the traffic
  // spawner share seeds so layouts are stable and testable.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function rng() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randRange(rng, lo, hi) {
    return lo + rng() * (hi - lo);
  }

  function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Push a circle (entity with x, y, radius) out of an axis-aligned rect.
  // Returns true when a push happened. Mutates the entity's x/y.
  function resolveCircleRect(e, rect) {
    const nx = clamp(e.x, rect.x, rect.x + rect.w);
    const ny = clamp(e.y, rect.y, rect.y + rect.h);
    let dx = e.x - nx;
    let dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 > e.radius * e.radius) return false;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      e.x = nx + (dx / d) * e.radius;
      e.y = ny + (dy / d) * e.radius;
    } else {
      // Centre is inside the rect: leave by the shallowest side.
      const left = e.x - rect.x;
      const right = rect.x + rect.w - e.x;
      const top = e.y - rect.y;
      const bottom = rect.y + rect.h - e.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) e.x = rect.x - e.radius;
      else if (m === right) e.x = rect.x + rect.w + e.radius;
      else if (m === top) e.y = rect.y - e.radius;
      else e.y = rect.y + rect.h + e.radius;
    }
    return true;
  }

  // The four corners of a rotated rectangle (cars), for collision tests.
  function rectCorners(x, y, w, h, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const hw = w / 2;
    const hh = h / 2;
    const pts = [];
    const local = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    for (const [lx, ly] of local) {
      pts.push({ x: x + lx * c - ly * s, y: y + lx * s + ly * c });
    }
    return pts;
  }

  function formatMoney(n) {
    const neg = n < 0;
    const s = String(Math.abs(Math.floor(n)));
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return (neg ? '-$' : '$') + out;
  }

  function formatClock(hoursFloat) {
    const h = Math.floor(hoursFloat) % 24;
    const m = Math.floor((hoursFloat - Math.floor(hoursFloat)) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  PA.util = {
    TAU,
    clamp,
    lerp,
    dist,
    distSq,
    angleTo,
    angleDiff,
    turnToward,
    makeRng,
    randRange,
    randInt,
    pick,
    pointInRect,
    rectsOverlap,
    resolveCircleRect,
    rectCorners,
    formatMoney,
    formatClock,
  };
})();
