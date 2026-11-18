// city.js — Port Azura itself: the road grid, six districts, ten points of
// interest, every building (with collision), parks, parking lots, trees and the
// ten hidden briefcase spots. The layout is generated from a fixed seed, so the
// city is identical on every load and in every test run.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;

  const WORLD = 3380; // the city is a square, 3380 x 3380 world units
  const STREET_FIRST = 130;
  const STREET_PITCH = 260;
  const STREET_COUNT = 13;
  const ROAD_HALF = 34; // roads are 68 wide, centred on the street lines
  const BLOCK_INSET = 10; // sidewalk between the kerb and the buildings

  const STREETS = [];
  for (let i = 0; i < STREET_COUNT; i++) STREETS.push(STREET_FIRST + i * STREET_PITCH);

  const DISTRICT_NAMES = [
    ['North Heights', 'Casino Row', 'The Marina'],
    ['Industrial Yards', 'Old Market', 'Harbor Point'],
  ];
  const DISTRICT_TINTS = [
    ['#57785a', '#6d7a58', '#5d8272'],
    ['#77755e', '#7a6a58', '#5f7a86'],
  ];

  const BUILDING_PALETTE = [
    '#c96f4a', '#d9a05b', '#b8574f', '#e0c084', '#9db38a',
    '#7fa3a1', '#c98a6b', '#a8b8c8', '#d98cb3', '#8a7fbf',
  ];

  // Points of interest: bx/by are block coordinates (0..11). The POI building
  // fills its block; kind decides what pressing F in front of it does.
  const POI_DEFS = [
    { id: 'safehouse', name: "Rosa's Safehouse", kind: 'safehouse', bx: 5, by: 7, color: '#e0c084', sign: '⌂' },
    { id: 'garage', name: 'Harbor Garage', kind: 'garage', bx: 9, by: 10, color: '#7fa3a1', sign: '⚙' },
    { id: 'gunshop', name: 'Azura Arms', kind: 'gunshop', bx: 5, by: 2, color: '#b8574f', sign: '✛' },
    { id: 'hospital', name: 'St. Marina Hospital', kind: 'hospital', bx: 9, by: 2, color: '#e8e4da', sign: '+' },
    { id: 'casino', name: 'Port Azura Casino', kind: 'casino', bx: 6, by: 1, color: '#8a7fbf', sign: '♦' },
    { id: 'warehouse', name: 'Docks Warehouse', kind: 'warehouse', bx: 10, by: 11, color: '#9a8a76', sign: '▦' },
    { id: 'policehq', name: 'Azura Police HQ', kind: 'police', bx: 6, by: 6, color: '#5d7ba8', sign: '★' },
    { id: 'pawn', name: 'Palm Pawn', kind: 'pawn', bx: 1, by: 8, color: '#d9a05b', sign: '$' },
    { id: 'fuel', name: 'Fuel & Go', kind: 'fuel', bx: 1, by: 1, color: '#c96f4a', sign: '⛽' },
    { id: 'lookout', name: 'The Lookout', kind: 'lookout', bx: 11, by: 0, color: '#9db38a', sign: '▲' },
  ];

  function blockOrigin(bx, by) {
    return {
      x: STREETS[bx] + ROAD_HALF,
      y: STREETS[by] + ROAD_HALF,
    };
  }

  function districtIndexAt(x, y) {
    const col = U.clamp(Math.floor(x / (WORLD / 3)), 0, 2);
    const row = U.clamp(Math.floor(y / (WORLD / 2)), 0, 1);
    return { col, row };
  }

  function districtAt(x, y) {
    const { col, row } = districtIndexAt(x, y);
    return { name: DISTRICT_NAMES[row][col], col, row };
  }

  function isOnRoad(x, y) {
    for (const s of STREETS) {
      if (Math.abs(x - s) <= ROAD_HALF || Math.abs(y - s) <= ROAD_HALF) return true;
    }
    return false;
  }

  function build() {
    const rng = U.makeRng(20261117);
    const buildings = [];
    const trees = [];
    const parks = [];
    const lots = [];
    const pois = [];
    const byBlock = new Map();

    const poiByBlock = new Map();
    for (const def of POI_DEFS) poiByBlock.set(def.bx + ',' + def.by, def);

    function addBuilding(bx, by, b) {
      b.blockKey = bx + ',' + by;
      buildings.push(b);
      if (!byBlock.has(b.blockKey)) byBlock.set(b.blockKey, []);
      byBlock.get(b.blockKey).push(b);
      return b;
    }

    for (let by = 0; by < 12; by++) {
      for (let bx = 0; bx < 12; bx++) {
        const o = blockOrigin(bx, by);
        const inner = STREET_PITCH - ROAD_HALF * 2 - BLOCK_INSET * 2; // 172
        const ix = o.x + BLOCK_INSET;
        const iy = o.y + BLOCK_INSET;
        const def = poiByBlock.get(bx + ',' + by);

        if (def) {
          const b = addBuilding(bx, by, {
            x: ix + 8, y: iy + 8, w: inner - 16, h: inner - 16,
            color: def.color, poi: def.id, seed: rng(),
          });
          pois.push({
            ...def,
            x: b.x + b.w / 2,
            y: b.y + b.h / 2,
            doorX: b.x + b.w / 2,
            doorY: b.y + b.h + 16,
            building: b,
          });
          continue;
        }

        const roll = rng();
        if (roll < 0.14) {
          // A small park: grass, trees, no collision but the trunks.
          parks.push({ x: o.x, y: o.y, w: STREET_PITCH - ROAD_HALF * 2, h: STREET_PITCH - ROAD_HALF * 2 });
          const n = U.randInt(rng, 5, 9);
          for (let i = 0; i < n; i++) {
            trees.push({
              x: o.x + U.randRange(rng, 24, 168),
              y: o.y + U.randRange(rng, 24, 168),
              r: U.randRange(rng, 9, 15),
            });
          }
          continue;
        }
        if (roll < 0.24) {
          lots.push({ x: o.x, y: o.y, w: STREET_PITCH - ROAD_HALF * 2, h: STREET_PITCH - ROAD_HALF * 2 });
          continue;
        }

        const layout = U.randInt(rng, 0, 2);
        if (layout === 0) {
          addBuilding(bx, by, {
            x: ix + 10, y: iy + 10, w: inner - 20, h: inner - 20,
            color: U.pick(rng, BUILDING_PALETTE), seed: rng(),
          });
        } else if (layout === 1) {
          const w = (inner - 14) / 2;
          addBuilding(bx, by, { x: ix, y: iy + 8, w, h: inner - 16, color: U.pick(rng, BUILDING_PALETTE), seed: rng() });
          addBuilding(bx, by, { x: ix + w + 14, y: iy + 8, w, h: inner - 16, color: U.pick(rng, BUILDING_PALETTE), seed: rng() });
        } else {
          const w = (inner - 14) / 2;
          const h = (inner - 14) / 2;
          const skip = U.randInt(rng, 0, 3);
          const cells = [
            [ix, iy], [ix + w + 14, iy],
            [ix, iy + h + 14], [ix + w + 14, iy + h + 14],
          ];
          cells.forEach(([cx, cy], i) => {
            if (i === skip) return;
            addBuilding(bx, by, { x: cx, y: cy, w, h, color: U.pick(rng, BUILDING_PALETTE), seed: rng() });
          });
        }
      }
    }

    // Ten briefcases on sidewalk corners, spread over the whole map.
    const caseRng = U.makeRng(777001);
    const briefcases = [];
    const usedCorners = new Set();
    for (let i = 0; i < 10; i++) {
      let sx = 0;
      let sy = 0;
      let key = '';
      do {
        const ci = U.randInt(caseRng, 1, 11);
        const cj = U.randInt(caseRng, 1, 11);
        const ox = caseRng() < 0.5 ? -1 : 1;
        const oy = caseRng() < 0.5 ? -1 : 1;
        sx = STREETS[ci] + ox * (ROAD_HALF + 9);
        sy = STREETS[cj] + oy * (ROAD_HALF + 9);
        key = ci + ',' + cj + ',' + ox + ',' + oy;
      } while (usedCorners.has(key));
      usedCorners.add(key);
      briefcases.push({ id: i, x: sx, y: sy });
    }

    return { buildings, trees, parks, lots, pois, briefcases, byBlock };
  }

  const data = build();

  function poiById(id) {
    return data.pois.find((p) => p.id === id) || null;
  }

  function nearestPoi(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of data.pois) {
      const d = U.dist(x, y, p.doorX, p.doorY);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // Resolve a circle entity against the buildings of its block and the eight
  // neighbours. Returns true when it touched anything.
  function collideCircle(e) {
    let hit = false;
    const bx = U.clamp(Math.floor((e.x - STREET_FIRST) / STREET_PITCH), 0, 11);
    const by = U.clamp(Math.floor((e.y - STREET_FIRST) / STREET_PITCH), 0, 11);
    for (let j = by - 1; j <= by + 1; j++) {
      for (let i = bx - 1; i <= bx + 1; i++) {
        const list = data.byBlock.get(i + ',' + j);
        if (!list) continue;
        for (const b of list) {
          if (U.resolveCircleRect(e, b)) hit = true;
        }
      }
    }
    e.x = U.clamp(e.x, e.radius, WORLD - e.radius);
    e.y = U.clamp(e.y, e.radius, WORLD - e.radius);
    return hit;
  }

  function circleHitsBuilding(x, y, r) {
    const probe = { x, y, radius: r };
    const bx = U.clamp(Math.floor((x - STREET_FIRST) / STREET_PITCH), 0, 11);
    const by = U.clamp(Math.floor((y - STREET_FIRST) / STREET_PITCH), 0, 11);
    for (let j = by - 1; j <= by + 1; j++) {
      for (let i = bx - 1; i <= bx + 1; i++) {
        const list = data.byBlock.get(i + ',' + j);
        if (!list) continue;
        for (const b of list) {
          const nx = U.clamp(x, b.x, b.x + b.w);
          const ny = U.clamp(y, b.y, b.y + b.h);
          if (U.distSq(x, y, nx, ny) < r * r) return true;
        }
      }
    }
    return false;
  }

  function draw(ctx, view, night, foundCases) {
    const { x: vx, y: vy, w: vw, h: vh } = view;

    // Ground: district-tinted blocks of city ground.
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const dx = (col * WORLD) / 3;
        const dy = (row * WORLD) / 2;
        if (dx + WORLD / 3 < vx || dx > vx + vw || dy + WORLD / 2 < vy || dy > vy + vh) continue;
        ctx.fillStyle = DISTRICT_TINTS[row][col];
        ctx.fillRect(dx - vx, dy - vy, WORLD / 3 + 1, WORLD / 2 + 1);
      }
    }

    // Block interiors (sidewalk concrete) and parks and lots.
    ctx.fillStyle = '#9aa0a3';
    for (let by = 0; by < 12; by++) {
      for (let bx = 0; bx < 12; bx++) {
        const o = blockOrigin(bx, by);
        const size = STREET_PITCH - ROAD_HALF * 2;
        if (o.x + size < vx || o.x > vx + vw || o.y + size < vy || o.y > vy + vh) continue;
        ctx.fillRect(o.x - vx, o.y - vy, size, size);
      }
    }
    ctx.fillStyle = '#4e7d46';
    for (const p of data.parks) ctx.fillRect(p.x - vx, p.y - vy, p.w, p.h);
    ctx.fillStyle = '#6f7276';
    for (const l of data.lots) {
      ctx.fillRect(l.x - vx, l.y - vy, l.w, l.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(l.x - vx, l.y - vy + (l.h / 4) * i);
        ctx.lineTo(l.x + l.w - vx, l.y - vy + (l.h / 4) * i);
        ctx.stroke();
      }
    }

    // Roads: dark strips along every street line, with dashed centre lines.
    ctx.fillStyle = '#3c3f45';
    for (const s of STREETS) {
      if (s + ROAD_HALF >= vx && s - ROAD_HALF <= vx + vw) ctx.fillRect(s - ROAD_HALF - vx, -vy, ROAD_HALF * 2, WORLD);
      if (s + ROAD_HALF >= vy && s - ROAD_HALF <= vy + vh) ctx.fillRect(-vx, s - ROAD_HALF - vy, WORLD, ROAD_HALF * 2);
    }
    ctx.strokeStyle = 'rgba(240,220,150,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    for (const s of STREETS) {
      ctx.beginPath();
      ctx.moveTo(s - vx, -vy);
      ctx.lineTo(s - vx, WORLD - vy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-vx, s - vy);
      ctx.lineTo(WORLD - vx, s - vy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Buildings: flat roofs with a drop shadow, lit windows after dark.
    for (const b of data.buildings) {
      if (b.x + b.w < vx || b.x > vx + vw || b.y + b.h < vy || b.y > vy + vh) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x - vx + 5, b.y - vy + 7, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - vx, b.y - vy, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - vx, b.y - vy, b.w, b.h);
      if (night > 0.25) {
        ctx.fillStyle = `rgba(255,214,120,${0.35 + night * 0.5})`;
        const cols = Math.max(1, Math.floor(b.w / 26));
        const rows = Math.max(1, Math.floor(b.h / 26));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const lit = Math.sin(b.seed * 997 + i * 31 + j * 57) > 0.1;
            if (lit) ctx.fillRect(b.x - vx + 8 + i * 26, b.y - vy + 8 + j * 26, 9, 12);
          }
        }
      }
    }

    // Trees.
    for (const t of data.trees) {
      if (t.x < vx - 20 || t.x > vx + vw + 20 || t.y < vy - 20 || t.y > vy + vh + 20) continue;
      ctx.fillStyle = '#2f5d33';
      ctx.beginPath();
      ctx.arc(t.x - vx, t.y - vy, t.r, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = '#3f7a44';
      ctx.beginPath();
      ctx.arc(t.x - vx - 2, t.y - vy - 2, t.r * 0.65, 0, U.TAU);
      ctx.fill();
    }

    // POI markers: a floating sign disc over each place.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of data.pois) {
      if (p.x < vx - 40 || p.x > vx + vw + 40 || p.y < vy - 40 || p.y > vy + vh + 40) continue;
      ctx.fillStyle = 'rgba(10,12,18,0.8)';
      ctx.beginPath();
      ctx.arc(p.x - vx, p.y - vy, 13, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffd98a';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(p.sign, p.x - vx, p.y - vy + 1);
    }

    // Hidden briefcases still unfound: a small gold case with a soft glint.
    for (const c of data.briefcases) {
      if (foundCases && foundCases.has(c.id)) continue;
      if (c.x < vx - 20 || c.x > vx + vw + 20 || c.y < vy - 20 || c.y > vy + vh + 20) continue;
      ctx.fillStyle = '#8a6d1f';
      ctx.fillRect(c.x - vx - 8, c.y - vy - 6, 16, 12);
      ctx.fillStyle = '#ffd94a';
      ctx.fillRect(c.x - vx - 8, c.y - vy - 2, 16, 3);
    }
  }

  PA.City = {
    WORLD,
    STREETS,
    ROAD_HALF,
    STREET_PITCH,
    data,
    districtAt,
    isOnRoad,
    poiById,
    nearestPoi,
    collideCircle,
    circleHitsBuilding,
    draw,
  };
})();
