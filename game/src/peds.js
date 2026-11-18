// peds.js — the people of Port Azura. They stroll the sidewalks between block
// corners, stop to chat, and run from gunfire, crashes and fast cars. They can
// be hurt (which the police notice), knocked down, and — when their car is
// stolen from under them — they bail out and sprint away.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  const SHIRTS = ['#d96b4a', '#4a90d9', '#e8e4da', '#7ab648', '#b45ad9', '#d9c84a', '#4ad0c2', '#d94a6b'];
  const SKINS = ['#f2c79b', '#c98d5e', '#8a5a34', '#6e4525', '#ffd9b3'];

  function sidewalkPoint(rng) {
    const bx = U.randInt(rng, 0, 11);
    const by = U.randInt(rng, 0, 11);
    const ox = City.STREETS[bx] + City.ROAD_HALF;
    const oy = City.STREETS[by] + City.ROAD_HALF;
    const size = City.STREET_PITCH - City.ROAD_HALF * 2;
    const side = U.randInt(rng, 0, 3);
    const t = rng() * size;
    const inset = 7;
    if (side === 0) return { x: ox + t, y: oy + inset };
    if (side === 1) return { x: ox + t, y: oy + size - inset };
    if (side === 2) return { x: ox + inset, y: oy + t };
    return { x: ox + size - inset, y: oy + t };
  }

  function makePed(x, y, rng) {
    return {
      x, y,
      angle: rng() * U.TAU,
      speed: 0,
      radius: 9,
      shirt: U.pick(rng, SHIRTS),
      skin: U.pick(rng, SKINS),
      health: 100,
      state: 'walk',
      target: null,
      waitTime: 0,
      fleeFrom: null,
      fleeTime: 0,
      downTime: 0,
      walkPhase: rng() * U.TAU,
    };
  }

  function spawn(G, count) {
    const rng = U.makeRng(31337);
    for (let i = 0; i < count; i++) {
      const p = sidewalkPoint(rng);
      G.peds.push(makePed(p.x, p.y, rng));
    }
  }

  function spawnAt(G, x, y) {
    const ped = makePed(x, y, G.rng);
    ped.state = 'flee';
    ped.fleeFrom = { x: G.player.x, y: G.player.y };
    ped.fleeTime = 2.5;
    G.peds.push(ped);
    return ped;
  }

  function hurt(G, ped, dmg, fromAngle) {
    if (ped.state === 'down') return;
    ped.health -= dmg;
    ped.x += Math.cos(fromAngle) * 6;
    ped.y += Math.sin(fromAngle) * 6;
    if (ped.health <= 0) {
      ped.state = 'down';
      ped.downTime = 0;
      G.events.push({ type: 'pedDown', x: ped.x, y: ped.y, ped });
    } else {
      ped.state = 'flee';
      ped.fleeFrom = { x: ped.x - Math.cos(fromAngle) * 50, y: ped.y - Math.sin(fromAngle) * 50 };
      ped.fleeTime = 2.2;
    }
  }

  function update(G, dt) {
    const rng = G.rng;
    // Fresh dangers this frame: shots and crashes send everyone running.
    const dangers = [];
    for (const ev of G.events) {
      if (ev.type === 'gunshot' || ev.type === 'crash' || ev.type === 'pedDown') {
        dangers.push(ev);
      }
    }

    for (const ped of G.peds) {
      if (ped.state === 'down') {
        ped.downTime += dt;
        continue;
      }
      for (const d of dangers) {
        if (U.distSq(ped.x, ped.y, d.x, d.y) < 230 * 230) {
          ped.state = 'flee';
          ped.fleeFrom = { x: d.x, y: d.y };
          ped.fleeTime = U.randRange(rng, 2, 3.5);
        }
      }
      // A car bearing down is its own danger.
      if (ped.state !== 'flee') {
        for (const car of G.cars) {
          if (Math.abs(car.speed) > 120 && U.distSq(ped.x, ped.y, car.x, car.y) < 55 * 55) {
            ped.state = 'flee';
            ped.fleeFrom = { x: car.x, y: car.y };
            ped.fleeTime = 1.2;
            break;
          }
        }
      }

      let moveX = 0;
      let moveY = 0;
      let speed = 0;
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        const away = U.angleTo(ped.fleeFrom.x, ped.fleeFrom.y, ped.x, ped.y);
        ped.angle = U.turnToward(ped.angle, away, dt * 8);
        speed = 155;
        if (ped.fleeTime <= 0) {
          ped.state = 'walk';
          ped.target = null;
        }
      } else {
        if (ped.waitTime > 0) {
          ped.waitTime -= dt;
        } else {
          if (!ped.target || U.dist(ped.x, ped.y, ped.target.x, ped.target.y) < 12) {
            if (rng() < 0.25) {
              ped.waitTime = U.randRange(rng, 1, 3.5); // stop, check phone, chat
              ped.target = null;
            } else {
              ped.target = sidewalkPoint(rng);
            }
          }
          if (ped.target) {
            const want = U.angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
            ped.angle = U.turnToward(ped.angle, want, dt * 5);
            speed = 52;
          }
        }
      }
      if (speed > 0) {
        moveX = Math.cos(ped.angle) * speed * dt;
        moveY = Math.sin(ped.angle) * speed * dt;
        ped.x += moveX;
        ped.y += moveY;
        ped.walkPhase += dt * (speed / 14);
        City.collideCircle(ped);
      }
      ped.speed = speed;

      // Run over: a fast car through a pedestrian is a crime scene.
      for (const car of G.cars) {
        if (Math.abs(car.speed) < 55) continue;
        if (U.distSq(ped.x, ped.y, car.x, car.y) < (car.radius * 0.8) * (car.radius * 0.8)) {
          const byPlayer = G.player.car === car;
          hurt(G, ped, Math.abs(car.speed) * 0.45, car.angle);
          G.events.push({ type: 'pedHit', x: ped.x, y: ped.y, byPlayer, ped });
          break;
        }
      }
    }

    // The city stays populated: the downed are quietly replaced across town.
    for (let i = G.peds.length - 1; i >= 0; i--) {
      if (G.peds[i].state === 'down' && G.peds[i].downTime > 25) {
        G.peds.splice(i, 1);
        const p = sidewalkPoint(rng);
        G.peds.push(makePed(p.x, p.y, rng));
      }
    }
  }

  function draw(ctx, view, ped, time) {
    const sx = ped.x - view.x;
    const sy = ped.y - view.y;
    if (sx < -24 || sy < -24 || sx > view.w + 24 || sy > view.h + 24) return;
    ctx.save();
    ctx.translate(sx, sy);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 6, 0, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(13, 0, 5, 0, U.TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(ped.angle);
    const bob = ped.speed > 0 ? Math.sin(ped.walkPhase * 6) * 1.6 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 9, 6, 0, 0, U.TAU);
    ctx.fill();
    // Legs (two little strides), body, head.
    ctx.strokeStyle = '#2c3242';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-5, bob);
    ctx.moveTo(-2, 0);
    ctx.lineTo(-5, -bob);
    ctx.stroke();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5, 6.5, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(4.5, 0, 4.6, 0, U.TAU);
    ctx.fill();
    ctx.restore();
    void time;
  }

  PA.Peds = { spawn, spawnAt, update, hurt, draw, sidewalkPoint };
})();
