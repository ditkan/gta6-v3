// vehicles.js — every car in Port Azura: the physics (acceleration, braking,
// steering, handbrake, damage), the traffic brain that drives the road network
// lane by lane, parked cars waiting to be stolen, and car drawing. Police
// cruisers are cars too; police.js just writes their controls each frame.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  const MODELS = [
    { name: 'Harbor Sedan', color: '#b8bcc4', maxSpeed: 265, accel: 190, grip: 3.4 },
    { name: 'Comet Coupe', color: '#d4543c', maxSpeed: 345, accel: 265, grip: 3.9 },
    { name: 'Dock Van', color: '#7d8a96', maxSpeed: 225, accel: 155, grip: 2.9 },
    { name: 'Taxi Sol', color: '#f2b63c', maxSpeed: 275, accel: 200, grip: 3.4 },
    { name: 'Palm Convertible', color: '#3fa7a0', maxSpeed: 320, accel: 240, grip: 3.7 },
    { name: 'Market Hatch', color: '#5d8a4a', maxSpeed: 245, accel: 180, grip: 3.2 },
  ];

  let nextId = 1;

  function createCar(x, y, angle, kind, rng) {
    const model = kind === 'police'
      ? { name: 'APD Interceptor', color: '#e8ecf2', maxSpeed: 335, accel: 260, grip: 3.9 }
      : U.pick(rng, MODELS);
    return {
      id: nextId++,
      x, y, angle,
      speed: 0,
      w: 46, h: 22, radius: 25,
      kind,
      model,
      color: model.color,
      health: 100,
      dead: false,
      occupied: false,
      control: { throttle: 0, steer: 0, handbrake: false },
      ai: { wp: null, cruise: U.randRange(rng, 105, 150), stuckTime: 0 },
      flash: 0,
    };
  }

  // A point on the correct (right-hand) lane for a car at an intersection,
  // heading in direction dir (0=E, 1=S, 2=W, 3=N), steps streets further on.
  const DIRS = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];

  function laneOffsetFor(dir) {
    // Right-hand traffic: eastbound rides the south lane, southbound the west.
    if (dir === 0) return { x: 0, y: 13 };
    if (dir === 1) return { x: -13, y: 0 };
    if (dir === 2) return { x: 0, y: -13 };
    return { x: 13, y: 0 };
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

  function dirFromAngle(a) {
    const q = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
    return q;
  }

  // Choose the traffic car's next waypoint: the next intersection along its
  // street, then (decided on arrival) straight on or a turn onto the cross
  // street, always landing in the correct lane.
  function nextWaypoint(car, rng) {
    const dir = dirFromAngle(car.angle);
    const d = DIRS[dir];
    const off = laneOffsetFor(dir);
    const si = nearestStreetIndex(dir === 0 || dir === 2 ? car.y : car.x);
    const ci = nearestStreetIndex(dir === 0 || dir === 2 ? car.x : car.y);
    let ni = ci + (dir === 0 || dir === 1 ? 1 : -1);
    ni = U.clamp(ni, 0, City.STREETS.length - 1);
    if (ni === ci) {
      // At the map edge: turn around by aiming at the far lane point.
      const back = (dir + 2) % 4;
      const bo = laneOffsetFor(back);
      car.ai.wp = { x: car.x + DIRS[back].x * 120 + bo.x, y: car.y + DIRS[back].y * 120 + bo.y, turn: back };
      return;
    }
    const ix = dir === 0 || dir === 2 ? City.STREETS[ni] : City.STREETS[si];
    const iy = dir === 0 || dir === 2 ? City.STREETS[si] : City.STREETS[ni];
    car.ai.wp = { x: ix + off.x, y: iy + off.y, arriveDir: dir, ix, iy };
    car.ai.wpPending = true;
    void rng;
  }

  function chooseAtIntersection(car, rng) {
    const wp = car.ai.wp;
    const dir = wp.arriveDir;
    const options = [dir, (dir + 1) % 4, (dir + 3) % 4];
    const nd = U.pick(rng, options);
    const off = laneOffsetFor(nd);
    const d = DIRS[nd];
    car.ai.wp = {
      x: wp.ix + off.x + d.x * City.STREET_PITCH,
      y: wp.iy + off.y + d.y * City.STREET_PITCH,
      arriveDir: nd,
      ix: wp.ix + d.x * City.STREET_PITCH,
      iy: wp.iy + d.y * City.STREET_PITCH,
    };
    // Snap the stored intersection to the real street crossing for next time.
    car.ai.wp.ix = City.STREETS[nearestStreetIndex(car.ai.wp.ix)];
    car.ai.wp.iy = City.STREETS[nearestStreetIndex(car.ai.wp.iy)];
    car.ai.wp.x = car.ai.wp.ix + off.x;
    car.ai.wp.y = car.ai.wp.iy + off.y;
    car.ai.wpPending = false;
  }

  function trafficControl(G, car, dt) {
    const rng = G.rng;
    if (!car.ai.wp) nextWaypoint(car, rng);
    const wp = car.ai.wp;
    const d = U.dist(car.x, car.y, wp.x, wp.y);
    if (d < 30) {
      if (car.ai.wpPending) chooseAtIntersection(car, rng);
      else nextWaypoint(car, rng);
    }
    const target = car.ai.wp;
    const want = U.angleTo(car.x, car.y, target.x, target.y);
    const diff = U.angleDiff(car.angle, want);
    let steer = U.clamp(diff * 2.2, -1, 1);
    let throttle = 1;
    let targetSpeed = car.ai.cruise * (Math.abs(diff) > 0.5 ? 0.45 : 1);

    // Slow for whatever is ahead: another car, or the player standing around.
    const aheadX = car.x + Math.cos(car.angle) * 52;
    const aheadY = car.y + Math.sin(car.angle) * 52;
    for (const other of G.cars) {
      if (other === car) continue;
      if (U.distSq(aheadX, aheadY, other.x, other.y) < 34 * 34) {
        targetSpeed = Math.min(targetSpeed, Math.abs(other.speed) * 0.8);
        if (U.distSq(car.x, car.y, other.x, other.y) < 46 * 46) targetSpeed = 0;
      }
    }
    if (!G.player.inCar && U.distSq(aheadX, aheadY, G.player.x, G.player.y) < 30 * 30) targetSpeed = 0;

    if (car.speed > targetSpeed + 4) throttle = -0.7;
    else if (car.speed < targetSpeed - 4) throttle = 0.9;
    else throttle = 0.15;

    // Stuck against a building or in a jam (including a head-on standoff,
    // where collision averaging holds both cars at a crawl): back up briefly
    // and re-aim.
    if (Math.abs(car.speed) < 25 && throttle > 0.3) car.ai.stuckTime += dt;
    else car.ai.stuckTime = 0;
    if (car.ai.stuckTime > 1.4) {
      throttle = -1;
      steer = -steer;
      if (car.ai.stuckTime > 2.2) {
        car.ai.stuckTime = 0;
        car.ai.wp = null;
      }
    }
    car.control = { throttle, steer, handbrake: false };
  }

  function stepCar(G, car, dt) {
    const c = car.control;
    const m = car.model;
    if (car.dead) {
      car.speed = U.lerp(car.speed, 0, Math.min(1, dt * 3));
    } else {
      if (c.throttle > 0) car.speed += m.accel * c.throttle * dt;
      else if (c.throttle < 0) {
        if (car.speed > 12) car.speed -= 320 * dt; // braking
        else car.speed += 120 * c.throttle * dt; // reverse
      }
      const drag = c.handbrake ? 2.6 : 0.55;
      car.speed -= car.speed * drag * dt;
      if (!c.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
      car.speed = U.clamp(car.speed, -95, m.maxSpeed);
      // Steering authority grows with speed but never vanishes: at a crawl the
      // car can still pivot, which keeps AI drivers from deadlocking nose-first
      // against a corner they cannot turn out of.
      const steerRate = m.grip * U.clamp(Math.abs(car.speed) / 120, 0.28, 1) * Math.sign(car.speed || 1);
      car.angle += c.steer * steerRate * dt * (c.handbrake ? 1.5 : 1);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    car.x = nx;
    car.y = ny;

    // Building collision: test the four corners as small circles.
    let bonk = 0;
    const corners = U.rectCorners(car.x, car.y, car.w, car.h, car.angle);
    for (const p of corners) {
      const probe = { x: p.x, y: p.y, radius: 7 };
      if (City.collideCircle(probe)) {
        car.x += probe.x - p.x;
        car.y += probe.y - p.y;
        bonk = Math.max(bonk, Math.abs(car.speed));
      }
    }
    car.x = U.clamp(car.x, 20, City.WORLD - 20);
    car.y = U.clamp(car.y, 20, City.WORLD - 20);
    if (bonk > 40) {
      damageCar(G, car, bonk * 0.05);
      car.speed *= -0.25;
      if (G.player.car === car) PA.Audio.crash(bonk / 300);
    } else if (bonk > 0) {
      car.speed *= 0.6;
    }
  }

  function carCarCollisions(G) {
    const cars = G.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const d2 = U.distSq(a.x, a.y, b.x, b.y);
        const min = (a.radius + b.radius) * 0.82;
        if (d2 > min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        // An empty, stationary car is shoved aside rather than anchoring the
        // moving one: most of the separation goes to the still car, and the
        // moving car keeps most of its speed. (Shoving parked cars out of the
        // way is half the fun of a chase.)
        const aStill = !a.occupied && Math.abs(a.speed) < 5;
        const bStill = !b.occupied && Math.abs(b.speed) < 5;
        let pushA = push;
        let pushB = push;
        if (aStill && !bStill) {
          pushA = push * 1.7;
          pushB = push * 0.3;
        } else if (bStill && !aStill) {
          pushA = push * 0.3;
          pushB = push * 1.7;
        }
        a.x -= ux * pushA;
        a.y -= uy * pushA;
        b.x += ux * pushB;
        b.y += uy * pushB;
        const impact = Math.abs(a.speed - b.speed);
        const avg = (a.speed + b.speed) / 2;
        if (aStill && !bStill) {
          a.speed = avg;
          b.speed *= 0.82;
        } else if (bStill && !aStill) {
          b.speed = avg;
          a.speed *= 0.82;
        } else {
          a.speed = avg;
          b.speed = avg;
        }
        if (impact > 90) {
          damageCar(G, a, impact * 0.04);
          damageCar(G, b, impact * 0.04);
          if (G.player.car === a || G.player.car === b) {
            PA.Audio.crash(impact / 260);
            G.events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          }
        }
      }
    }
  }

  function damageCar(G, car, amount) {
    if (car.dead) return;
    car.health -= amount;
    car.flash = 0.12;
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      G.events.push({ type: 'carDead', car });
    }
  }

  function update(G, dt) {
    for (const car of G.cars) {
      if (car.kind === 'traffic' && !car.occupied) trafficControl(G, car, dt);
      stepCar(G, car, dt);
      if (car.flash > 0) car.flash -= dt;
    }
    carCarCollisions(G);
  }

  function spawnTraffic(G) {
    const rng = U.makeRng(4451);
    for (let i = 0; i < 14; i++) {
      const horizontal = rng() < 0.5;
      const si = U.randInt(rng, 0, 12);
      const along = U.randRange(rng, 80, City.WORLD - 80);
      const dir = horizontal ? (rng() < 0.5 ? 0 : 2) : rng() < 0.5 ? 1 : 3;
      const off = laneOffsetFor(dir);
      const x = horizontal ? along : City.STREETS[si] + off.x;
      const y = horizontal ? City.STREETS[si] + off.y : along;
      if (City.circleHitsBuilding(x, y, 26)) continue;
      const car = createCar(x, y, (dir * Math.PI) / 2, 'traffic', rng);
      G.cars.push(car);
    }
  }

  function spawnParked(G) {
    const rng = U.makeRng(9021);
    // On the parking lots first.
    for (const lot of City.data.lots) {
      const n = U.randInt(rng, 2, 4);
      for (let i = 0; i < n; i++) {
        const x = lot.x + 30 + i * 52;
        const y = lot.y + 40 + (i % 2) * 90;
        if (x > lot.x + lot.w - 20) continue;
        const car = createCar(x, y, Math.PI / 2, 'parked', rng);
        G.cars.push(car);
      }
    }
    // Then parallel-parked along street edges.
    for (let i = 0; i < 16; i++) {
      const horizontal = rng() < 0.5;
      const si = U.randInt(rng, 0, 12);
      const along = U.randRange(rng, 120, City.WORLD - 120);
      const side = rng() < 0.5 ? -1 : 1;
      const x = horizontal ? along : City.STREETS[si] + side * (City.ROAD_HALF - 12);
      const y = horizontal ? City.STREETS[si] + side * (City.ROAD_HALF - 12) : along;
      const angle = horizontal ? 0 : Math.PI / 2;
      if (City.circleHitsBuilding(x, y, 26)) continue;
      const car = createCar(x, y, angle, 'parked', rng);
      G.cars.push(car);
    }
  }

  function nearestCar(x, y, maxDist, filter) {
    let best = null;
    let bestD = maxDist;
    for (const car of filter) {
      const d = U.dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function draw(ctx, view, car, night, time) {
    const sx = car.x - view.x;
    const sy = car.y - view.y;
    if (sx < -60 || sy < -60 || sx > view.w + 60 || sy > view.h + 60) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(car.angle);

    // Shadow, body, cabin, details.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
    ctx.fillStyle = car.dead ? '#2c2c30' : car.flash > 0 ? '#ffffff' : car.color;
    ctx.beginPath();
    ctx.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,26,36,0.9)';
    ctx.beginPath();
    ctx.roundRect(-car.w * 0.16, -car.h * 0.36, car.w * 0.34, car.h * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(car.w * 0.28, -car.h * 0.34, 4, car.h * 0.68);

    if (car.kind === 'police') {
      ctx.fillStyle = '#2a4d8f';
      ctx.fillRect(-car.w * 0.05, -car.h / 2, car.w * 0.16, car.h);
      const phase = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff4040' : '#ffd0d0';
      ctx.fillRect(-6, -8, 6, 6);
      ctx.fillStyle = phase ? '#cfe4ff' : '#4080ff';
      ctx.fillRect(1, 2, 6, 6);
    }
    if (car.model.name === 'Taxi Sol') {
      ctx.fillStyle = '#10131c';
      ctx.fillRect(-4, -4, 8, 8);
    }

    // Headlights after dark.
    if (night > 0.3 && !car.dead) {
      ctx.fillStyle = `rgba(255,240,180,${0.25 + night * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(car.w / 2, -7);
      ctx.lineTo(car.w / 2 + 46, -16);
      ctx.lineTo(car.w / 2 + 46, 16);
      ctx.lineTo(car.w / 2, 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Damage smoke.
    if (!car.dead && car.health < 45) {
      const puff = 3 + Math.sin(time * 7 + car.id) * 1.5;
      ctx.fillStyle = 'rgba(60,60,60,0.4)';
      ctx.beginPath();
      ctx.arc(sx + Math.cos(car.angle) * 16, sy + Math.sin(car.angle) * 16 - 4, puff + (45 - car.health) * 0.08, 0, U.TAU);
      ctx.fill();
    }
  }

  PA.Vehicles = {
    MODELS,
    createCar,
    spawnTraffic,
    spawnParked,
    update,
    draw,
    nearestCar,
    damageCar,
    laneOffsetFor,
    dirFromAngle,
  };
})();
