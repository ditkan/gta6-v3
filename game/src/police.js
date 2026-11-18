// police.js — the Azura Police Department: the wanted system (heat that maps to
// one-to-five stars), cruiser spawning, pursuit driving that chases and rams,
// line-of-sight so hiding actually works, and the bust meter that ends a chase
// when officers pin a slow or on-foot player.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  // Heat costs of the crimes the city notices.
  const CRIME_HEAT = {
    carjack: 34,
    gunshot: 16,
    pedHit: 55,
    pedDown: 95,
    copHit: 60,
    copDown: 120,
    reckless: 10,
    mission: 70,
  };

  function starsForHeat(heat) {
    if (heat <= 0) return 0;
    return U.clamp(Math.ceil(heat / 60), 1, 5);
  }

  function addHeat(G, amount) {
    const w = G.wanted;
    w.heat = U.clamp(w.heat + amount, 0, 300);
    w.stars = starsForHeat(w.heat);
    w.lastCrimeAt = G.time;
    w.lastCrimeX = G.player.x;
    w.lastCrimeY = G.player.y;
    // Cruisers roll toward the scene of the latest crime until they spot the
    // player themselves; without this they would hunt a stale position.
    w.lastSeenX = w.lastCrimeX;
    w.lastSeenY = w.lastCrimeY;
  }

  function crime(G, kind) {
    addHeat(G, CRIME_HEAT[kind] || 10);
  }

  function lineOfSight(x1, y1, x2, y2) {
    const d = U.dist(x1, y1, x2, y2);
    const steps = Math.max(2, Math.floor(d / 60));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (City.circleHitsBuilding(U.lerp(x1, x2, t), U.lerp(y1, y2, t), 8)) return false;
    }
    return true;
  }

  function desiredCruisers(stars) {
    if (stars <= 0) return 0;
    return Math.min(2 + stars, 7);
  }

  function spawnPoint(G) {
    // A street intersection in a ring around the player: close enough to join
    // the chase, far enough to drive in rather than pop in.
    const rng = G.rng;
    for (let tries = 0; tries < 12; tries++) {
      const a = rng() * U.TAU;
      const r = U.randRange(rng, 540, 720);
      const x = U.clamp(G.player.x + Math.cos(a) * r, 60, City.WORLD - 60);
      const y = U.clamp(G.player.y + Math.sin(a) * r, 60, City.WORLD - 60);
      const ix = City.STREETS[U.clamp(Math.round((x - 130) / City.STREET_PITCH), 0, 12)];
      const iy = City.STREETS[U.clamp(Math.round((y - 130) / City.STREET_PITCH), 0, 12)];
      return { x: ix, y: iy };
    }
    return { x: G.player.x + 600, y: G.player.y };
  }

  function spawnCruiser(G) {
    const p = spawnPoint(G);
    const car = PA.Vehicles.createCar(p.x, p.y, U.angleTo(p.x, p.y, G.player.x, G.player.y), 'police', G.rng);
    car.ai.cruise = 300;
    G.cars.push(car);
    G.police.push(car);
    return car;
  }

  function nearestStreetIndex(v) {
    let best = 0;
    let bestD = Infinity;
    City.STREETS.forEach((s, i) => {
      const d = Math.abs(s - v);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function pursuitControl(G, car, dt) {
    const w = G.wanted;
    const px = w.seen ? G.player.x : w.lastSeenX;
    const py = w.seen ? G.player.y : w.lastSeenY;
    // Aim a little ahead of a moving target so cruisers cut corners and ram.
    const tx = G.player.car ? G.player.car.x : px;
    const ty = G.player.car ? G.player.car.y : py;
    const d = U.dist(car.x, car.y, tx, ty);

    // Far away — or close but with a building in the way — cruisers navigate
    // the road grid: along their current street to the target's column or
    // row, then along that street to the target's crossing. Aiming along the
    // street (never at a point just behind them) keeps them driving instead
    // of U-turning on the spot, and routing around blocks beats grinding
    // along a wall face. Only a clear line of sight switches a cruiser to a
    // direct line at the target.
    let aimX = tx;
    let aimY = ty;
    const direct = d <= 200 && lineOfSight(car.x, car.y, tx, ty);
    if (!direct) {
      const cix = nearestStreetIndex(car.x);
      const ciy = nearestStreetIndex(car.y);
      const pix = nearestStreetIndex(tx);
      const piy = nearestStreetIndex(ty);
      const atCrossing =
        Math.abs(car.x - City.STREETS[cix]) < 48 && Math.abs(car.y - City.STREETS[ciy]) < 48;
      const onHorizontal = Math.abs(car.y - City.STREETS[ciy]) <= City.ROAD_HALF + 12;
      const onVertical = Math.abs(car.x - City.STREETS[cix]) <= City.ROAD_HALF + 12;
      if (atCrossing) {
        if (cix !== pix) {
          aimX = City.STREETS[pix];
          aimY = City.STREETS[ciy];
        } else if (ciy !== piy) {
          aimX = City.STREETS[cix];
          aimY = City.STREETS[piy];
        }
      } else if (onHorizontal && cix !== pix) {
        aimX = City.STREETS[pix];
        aimY = City.STREETS[ciy];
      } else if (onVertical && ciy !== piy) {
        aimX = City.STREETS[cix];
        aimY = City.STREETS[piy];
      } else if (onHorizontal) {
        aimX = City.STREETS[cix];
        aimY = City.STREETS[piy];
      } else if (onVertical) {
        aimX = City.STREETS[pix];
        aimY = City.STREETS[ciy];
      } else {
        aimX = City.STREETS[cix];
        aimY = City.STREETS[ciy];
      }
    }
    // Someone in the way: swerve around them instead of leaning on their
    // bumper forever (a head-on traffic jam helps nobody).
    const aheadX = car.x + Math.cos(car.angle) * 54;
    const aheadY = car.y + Math.sin(car.angle) * 54;
    for (const other of G.cars) {
      if (other === car) continue;
      if (U.distSq(aheadX, aheadY, other.x, other.y) < 36 * 36 || U.distSq(car.x, car.y, other.x, other.y) < 48 * 48) {
        aimX += -Math.sin(car.angle) * 34;
        aimY += Math.cos(car.angle) * 34;
        break;
      }
    }

    const want = U.angleTo(car.x, car.y, aimX, aimY);
    const diff = U.angleDiff(car.angle, want);
    let steer = U.clamp(diff * 2.6, -1, 1);
    let throttle = 1;
    // A cruiser at speed has a wide turning circle; brake into very sharp
    // turns so it stays on the road, but keep rolling — a stopped cruiser
    // with its nose against a corner is a stuck cruiser.
    if (Math.abs(diff) > 1.7 && car.speed > 120) throttle = -0.6;
    else if (Math.abs(diff) > 1.7) throttle = 0.45;
    else if (Math.abs(diff) > 0.8 && car.speed > 170) throttle = -0.4;

    if (Math.abs(car.speed) < 8) car.ai.stuckTime += dt;
    else car.ai.stuckTime = 0;
    if (car.ai.stuckTime > 1.2) {
      throttle = -1;
      steer = -steer;
      if (car.ai.stuckTime > 2) {
        car.ai.stuckTime = 0;
        car.ai.stuckCount = (car.ai.stuckCount || 0) + 1;
      }
    } else if (!G.player.inCar && d < 170) {
      // Target on foot: pull up alongside and bust them — never run them down.
      // Brake early so the cruiser arrives at walking pace, not at full speed.
      if (car.speed > 42) throttle = -0.9;
      else if (d < 55) throttle = car.speed > 25 ? -0.8 : 0.1;
      else throttle = 0.5;
    } else if (d < 26) {
      throttle = 0.4; // stay on top of them
    }
    car.control = { throttle, steer, handbrake: Math.abs(diff) > 2.2 };
  }

  function update(G, dt) {
    const w = G.wanted;
    const prevStars = w.stars;

    // Who can see the player right now?
    w.seen = false;
    for (const car of G.police) {
      if (car.dead) continue;
      const d = U.dist(car.x, car.y, G.player.x, G.player.y);
      if (d < 350 && lineOfSight(car.x, car.y, G.player.x, G.player.y)) {
        w.seen = true;
        w.lastSeenX = G.player.x;
        w.lastSeenY = G.player.y;
        w.lastSeenAt = G.time;
        break;
      }
    }

    // Heat decays only while nobody is watching and no fresh crime lands.
    if (!w.seen && G.time - w.lastSeenAt > 5 && G.time - w.lastCrimeAt > 4) {
      w.heat = Math.max(0, w.heat - 7 * dt);
      w.stars = starsForHeat(w.heat);
    }
    if (w.stars !== prevStars && w.stars > prevStars) {
      G.events.push({ type: 'starsUp', stars: w.stars });
    }

    // Spawn and despawn to the wanted level.
    const want = desiredCruisers(w.stars);
    if (G.police.length < want) {
      w.spawnTimer -= dt;
      if (w.spawnTimer <= 0) {
        spawnCruiser(G);
        w.spawnTimer = 1.6;
      }
    }
    for (let i = G.police.length - 1; i >= 0; i--) {
      const car = G.police[i];
      const d = U.dist(car.x, car.y, G.player.x, G.player.y);
      if ((w.stars === 0 && d > 420) || d > 1100) {
        G.police.splice(i, 1);
        const ci = G.cars.indexOf(car);
        if (ci >= 0) G.cars.splice(ci, 1);
      }
    }

    // Drive the pursuit. A cruiser that keeps getting stuck is quietly
    // re-deployed to a fresh intersection: the chase must never stall.
    for (const car of G.police) {
      if (car.dead) continue;
      if ((car.ai.stuckCount || 0) >= 3) {
        const p = spawnPoint(G);
        car.x = p.x;
        car.y = p.y;
        car.speed = 0;
        car.angle = U.angleTo(p.x, p.y, G.player.x, G.player.y);
        car.ai.stuckCount = 0;
        car.ai.stuckTime = 0;
      }
      pursuitControl(G, car, dt);
    }

    // The bust meter: pinned on foot, or boxed in while crawling in a car.
    let pinned = false;
    if (w.stars > 0) {
      let close = 0;
      for (const car of G.police) {
        if (!car.dead && U.dist(car.x, car.y, G.player.x, G.player.y) < 78) close++;
      }
      const slow = G.player.inCar ? Math.abs(G.player.car.speed) < 18 : G.player.speedMag < 30;
      if (close >= 1 && slow && !G.player.inCar) pinned = true;
      if (close >= 2 && slow && G.player.inCar) pinned = true;
    }
    if (pinned) {
      G.bust.meter = Math.min(1, G.bust.meter + dt / 2.2);
      if (G.bust.meter >= 1) G.events.push({ type: 'busted' });
    } else {
      G.bust.meter = Math.max(0, G.bust.meter - dt / 1.4);
    }

    // Siren loudness follows the nearest live cruiser.
    let nearest = Infinity;
    for (const car of G.police) {
      if (!car.dead) nearest = Math.min(nearest, U.dist(car.x, car.y, G.player.x, G.player.y));
    }
    PA.Audio.sirenSet(G.police.length > 0 && w.stars > 0, nearest === Infinity ? 0 : U.clamp(1 - nearest / 700, 0, 1));
  }

  function clear(G) {
    G.wanted.heat = 0;
    G.wanted.stars = 0;
    G.wanted.seen = false;
    G.bust.meter = 0;
    for (const car of G.police) {
      const ci = G.cars.indexOf(car);
      if (ci >= 0) G.cars.splice(ci, 1);
    }
    G.police.length = 0;
    PA.Audio.sirenSet(false, 0);
  }

  PA.Police = { CRIME_HEAT, starsForHeat, addHeat, crime, update, clear, lineOfSight };
})();
