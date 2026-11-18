// combat.js — fists and the pistol: mouse-aimed shooting with a magazine and
// reloads, muzzle flash and tracers, melee swings, bullet travel and hits on
// pedestrians, cars and cruisers, and the player's own health/armour damage
// model. Crimes are reported as events; police.js turns them into heat.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  const MAG_SIZE = 12;
  const BULLET_SPEED = 980;
  const FIRE_INTERVAL = 0.16;
  const MELEE_RANGE = 44;
  const MELEE_ARC = 0.85;

  function tryShoot(G) {
    const p = G.player;
    if (p.inCar || p.reloading > 0 || p.shootCd > 0) return false;
    if (!p.hasPistol || p.ammo <= 0) return tryMelee(G);
    p.ammo -= 1;
    p.shootCd = FIRE_INTERVAL;
    const spread = (G.rng() - 0.5) * 0.045;
    const a = p.aimAngle + spread;
    G.bullets.push({
      x: p.x + Math.cos(p.aimAngle) * 16,
      y: p.y + Math.sin(p.aimAngle) * 16,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      life: 0.55,
      fromPlayer: true,
    });
    G.effects.push({ type: 'flash', x: p.x + Math.cos(p.aimAngle) * 20, y: p.y + Math.sin(p.aimAngle) * 20, t: 0.05, max: 0.05 });
    G.events.push({ type: 'gunshot', x: p.x, y: p.y, byPlayer: true });
    PA.Audio.gunshot();
    if (p.ammo === 0 && p.reserve > 0) startReload(G);
    return true;
  }

  function tryMelee(G) {
    const p = G.player;
    if (p.inCar || p.meleeCd > 0) return false;
    p.meleeCd = 0.38;
    p.swingT = 0.18;
    PA.Audio.punch();
    let hitAny = false;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      const d = U.dist(p.x, p.y, ped.x, ped.y);
      if (d > MELEE_RANGE) continue;
      if (Math.abs(U.angleDiff(p.aimAngle, U.angleTo(p.x, p.y, ped.x, ped.y))) > MELEE_ARC) continue;
      PA.Peds.hurt(G, ped, 30, p.aimAngle);
      G.events.push({ type: 'pedHit', x: ped.x, y: ped.y, byPlayer: true, ped, melee: true });
      hitAny = true;
    }
    for (const car of G.cars) {
      if (U.dist(p.x, p.y, car.x, car.y) > MELEE_RANGE + car.radius * 0.5) continue;
      PA.Vehicles.damageCar(G, car, 4);
      G.effects.push({ type: 'spark', x: car.x, y: car.y, t: 0.15, max: 0.15 });
      hitAny = true;
    }
    return hitAny;
  }

  function startReload(G) {
    const p = G.player;
    if (!p.hasPistol || p.reloading > 0 || p.reserve <= 0 || p.ammo >= MAG_SIZE) return false;
    p.reloading = 0.9;
    return true;
  }

  function finishReload(G) {
    const p = G.player;
    const take = Math.min(MAG_SIZE - p.ammo, p.reserve);
    p.ammo += take;
    p.reserve -= take;
    p.reloading = 0;
  }

  // Armour soaks 60% of incoming damage until it is gone.
  function hurtPlayer(G, dmg) {
    const p = G.player;
    if (p.health <= 0) return;
    let rest = dmg;
    if (p.armour > 0) {
      const soaked = Math.min(p.armour, dmg * 0.6);
      p.armour -= soaked;
      rest = dmg - soaked;
    }
    p.health -= rest;
    p.hurtT = 0.25;
    PA.Audio.hurt();
    if (p.health <= 0) {
      p.health = 0;
      G.events.push({ type: 'wasted' });
    }
  }

  function updateBullets(G, dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && City.circleHitsBuilding(b.x, b.y, 2)) {
        G.effects.push({ type: 'spark', x: b.x, y: b.y, t: 0.12, max: 0.12 });
        dead = true;
      }
      if (!dead) {
        for (const ped of G.peds) {
          if (ped.state === 'down') continue;
          if (U.distSq(b.x, b.y, ped.x, ped.y) < 11 * 11) {
            PA.Peds.hurt(G, ped, 34, Math.atan2(b.vy, b.vx));
            if (b.fromPlayer) G.events.push({ type: 'pedHit', x: ped.x, y: ped.y, byPlayer: true, ped });
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of G.cars) {
          if (U.distSq(b.x, b.y, car.x, car.y) < car.radius * car.radius * 0.72) {
            PA.Vehicles.damageCar(G, car, 7);
            G.effects.push({ type: 'spark', x: b.x, y: b.y, t: 0.12, max: 0.12 });
            if (b.fromPlayer && car.kind === 'police') {
              G.events.push({ type: 'copShot', x: car.x, y: car.y });
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
  }

  function update(G, dt) {
    const p = G.player;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.meleeCd > 0) p.meleeCd -= dt;
    if (p.swingT > 0) p.swingT -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) finishReload(G);
    }
    updateBullets(G, dt);
    for (let i = G.effects.length - 1; i >= 0; i--) {
      G.effects[i].t -= dt;
      if (G.effects[i].t <= 0) G.effects.splice(i, 1);
    }
  }

  function drawBullets(ctx, view, G) {
    ctx.strokeStyle = 'rgba(255,230,150,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const b of G.bullets) {
      const sx = b.x - view.x;
      const sy = b.y - view.y;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - b.vx * 0.014, sy - b.vy * 0.014);
    }
    ctx.stroke();
  }

  function drawEffects(ctx, view, G) {
    for (const fx of G.effects) {
      const sx = fx.x - view.x;
      const sy = fx.y - view.y;
      const k = fx.t / fx.max;
      if (fx.type === 'flash') {
        ctx.fillStyle = `rgba(255,200,80,${0.85 * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 12 * k + 3, 0, U.TAU);
        ctx.fill();
      } else if (fx.type === 'spark') {
        ctx.strokeStyle = `rgba(255,210,110,${k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * U.TAU + fx.x;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(a) * 10 * k, sy + Math.sin(a) * 10 * k);
        }
        ctx.stroke();
      } else if (fx.type === 'ring') {
        ctx.strokeStyle = `rgba(255,217,74,${k})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, (1 - k) * 30 + 6, 0, U.TAU);
        ctx.stroke();
      }
    }
  }

  PA.Combat = {
    MAG_SIZE,
    tryShoot,
    tryMelee,
    startReload,
    hurtPlayer,
    update,
    drawBullets,
    drawEffects,
  };
})();
