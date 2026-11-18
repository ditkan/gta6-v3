// main.js — Port Azura: Heat's conductor: the game state, input, the player on
// foot and in cars, the camera, day and night, event processing (crimes become
// heat, busts and deaths resolve), world rendering, and the boot sequence.
// Every other src file is one system; this file wires them together.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  const VIEW_W = 960;
  const VIEW_H = 540;

  const G = {
    mode: 'title',
    time: 0,
    timeOfDay: 10,
    rng: U.makeRng(2026),
    player: null,
    cars: [],
    peds: [],
    police: [],
    bullets: [],
    effects: [],
    events: [],
    wanted: null,
    bust: { meter: 0 },
    mission: null,
    storyIndex: 0,
    dialogue: null,
    foundCases: new Set(),
    stats: null,
    notice: null,
    prompt: null,
    revealCasesUntil: 0,
    bustFlash: 0,
    wastedFlash: 0,
    overInfo: { title: '', text: '' },
    completeInfo: { text: '' },
    camera: { x: 0, y: 0 },
    input: { keys: new Set(), mouseX: VIEW_W / 2, mouseY: VIEW_H / 2, mouseDown: false },
    saveTimer: 0,
    started: false,
  };

  function freshPlayer() {
    const safe = City.poiById('safehouse');
    return {
      x: safe.doorX,
      y: safe.doorY + 6,
      angle: -Math.PI / 2,
      aimAngle: -Math.PI / 2,
      radius: 10,
      speedMag: 0,
      health: 100,
      armour: 0,
      cash: 120,
      hasPistol: false,
      ammo: 0,
      reserve: 0,
      reloading: 0,
      shootCd: 0,
      meleeCd: 0,
      swingT: 0,
      hurtT: 0,
      inCar: false,
      car: null,
    };
  }

  function freshStats() {
    return { jobsDone: 0, carsStolen: 0, casesFound: 0, shotsFired: 0, busts: 0, deaths: 0 };
  }

  function resetWorld() {
    G.cars = [];
    G.peds = [];
    G.police = [];
    G.bullets = [];
    G.effects = [];
    G.events = [];
    G.mission = null;
    G.dialogue = null;
    G.wanted = {
      stars: 0, heat: 0, seen: false,
      lastSeenX: 0, lastSeenY: 0, lastSeenAt: -99, lastCrimeAt: -99, lastCrimeX: 0, lastCrimeY: 0,
      spawnTimer: 0,
    };
    G.bust.meter = 0;
    PA.Vehicles.spawnTraffic(G);
    PA.Vehicles.spawnParked(G);
    PA.Peds.spawn(G, 26);
  }

  function newGame() {
    resetWorld();
    G.player = freshPlayer();
    G.storyIndex = 0;
    G.foundCases = new Set();
    G.stats = freshStats();
    G.timeOfDay = 10;
    PA.Save.clear();
    startPlaying('Welcome to Port Azura. Marisol is waiting at Rosa\'s Safehouse.');
  }

  function continueGame() {
    const data = PA.Save.load();
    resetWorld();
    G.player = freshPlayer();
    G.storyIndex = 0;
    G.foundCases = new Set();
    G.stats = freshStats();
    if (data) PA.Save.apply(G, data);
    startPlaying('Welcome back to Port Azura.');
  }

  function startPlaying(noticeText) {
    G.mode = 'playing';
    G.started = true;
    PA.Audio.init();
    PA.Audio.musicStart();
    if (noticeText) G.notice = { text: noticeText, until: G.time + 4 };
  }

  // ---------------------------------------------------------------- input
  function bindInput(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      G.input.keys.add(e.code);
      onKeyPress(e.code);
    });
    window.addEventListener('keyup', (e) => G.input.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      G.input.mouseX = ((e.clientX - r.left) / r.width) * VIEW_W;
      G.input.mouseY = ((e.clientY - r.top) / r.height) * VIEW_H;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) G.input.mouseDown = true;
    });
    window.addEventListener('mouseup', () => {
      G.input.mouseDown = false;
    });
  }

  function onKeyPress(code) {
    if (code === 'KeyM') {
      const m = PA.Audio.setMuted(!PA.Audio.isMuted());
      G.notice = { text: m ? 'Sound off.' : 'Sound on.', until: G.time + 1.6 };
      return;
    }
    if (G.mode === 'title') return;
    if (code === 'KeyP' || code === 'Escape') {
      if (G.mode === 'playing') G.mode = 'paused';
      else if (G.mode === 'paused') G.mode = 'playing';
      return;
    }
    if (G.mode !== 'playing') return;
    if (G.dialogue) {
      if (code === 'Enter' || code === 'KeyE' || code === 'KeyF') advanceDialogue();
      return;
    }
    if (code === 'Enter') {
      const target = PA.Missions.currentTarget(G);
      if (!G.mission && target && target.idle && U.dist(G.player.x, G.player.y, target.x, target.y) < 48) {
        PA.Missions.startStoryMission(G);
      }
      return;
    }
    if (code === 'KeyF' || code === 'KeyE') contextAction();
    if (code === 'KeyR') PA.Combat.startReload(G);
  }

  function advanceDialogue() {
    const d = G.dialogue;
    if (!d) return;
    d.index += 1;
    if (d.index >= d.lines.length) {
      G.dialogue = null;
      if (d.onDone) d.onDone();
    }
  }

  function contextAction() {
    const p = G.player;
    if (p.inCar) {
      exitCar();
      return;
    }
    const car = PA.Vehicles.nearestCar(p.x, p.y, 54, G.cars);
    if (car && !car.occupied) {
      enterCar(car);
      return;
    }
    const poiDef = City.nearestPoi(p.x, p.y, 46);
    if (poiDef) PA.Missions.usePoi(G, poiDef);
  }

  function enterCar(car) {
    const p = G.player;
    if (Math.abs(car.speed) > 90) {
      G.notice = { text: 'Too fast to grab — slow it down or block it first.', until: G.time + 2 };
      return;
    }
    const wasTraffic = car.kind === 'traffic';
    if (wasTraffic) {
      // Yank the driver out; they bail and run.
      PA.Peds.spawnAt(G, car.x + 14, car.y + 10);
      PA.Police.crime(G, 'carjack');
      G.stats.carsStolen += 1;
    } else if (car.kind === 'police') {
      PA.Police.crime(G, 'carjack');
      PA.Police.crime(G, 'copHit');
      G.stats.carsStolen += 1;
    } else if (car.kind === 'parked') {
      let witnessed = false;
      for (const ped of G.peds) {
        if (U.distSq(ped.x, ped.y, p.x, p.y) < 170 * 170) {
          witnessed = true;
          break;
        }
      }
      if (witnessed) PA.Police.crime(G, 'carjack');
      G.stats.carsStolen += 1;
    }
    if (car.kind !== 'mission') car.kind = 'player';
    car.occupied = true;
    car.control = { throttle: 0, steer: 0, handbrake: false };
    p.inCar = true;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    PA.Audio.engineStart();
  }

  function exitCar() {
    const p = G.player;
    const car = p.car;
    if (!car) return;
    car.occupied = false;
    car.control = { throttle: 0, steer: 0, handbrake: false };
    if (car.kind === 'player') car.kind = 'parked';
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * (car.h / 2 + 14);
    p.y = car.y + Math.sin(side) * (car.h / 2 + 14);
    City.collideCircle(p);
    p.inCar = false;
    p.car = null;
    PA.Audio.engineStop();
  }

  // ---------------------------------------------------------------- player
  function updatePlayer(dt) {
    const p = G.player;
    const keys = G.input.keys;
    if (p.inCar) {
      const car = p.car;
      if (car.dead) {
        exitCar();
        G.notice = { text: 'That ride is wrecked. Find another.', until: G.time + 2.5 };
        return;
      }
      car.control = {
        throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0),
        steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0),
        handbrake: keys.has('Space'),
      };
      p.x = car.x;
      p.y = car.y;
      p.aimAngle = car.angle;
      p.speedMag = Math.abs(car.speed);
      PA.Audio.engineSet(Math.abs(car.speed) / car.model.maxSpeed, true);
      return;
    }
    PA.Audio.engineSet(0, false);

    let mx = 0;
    let my = 0;
    if (!G.dialogue) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    }
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = running ? 205 : 122;
    if (mx !== 0 || my !== 0) {
      const len = Math.sqrt(mx * mx + my * my);
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.angle = Math.atan2(my, mx);
      p.speedMag = speed;
    } else {
      p.speedMag = 0;
    }
    City.collideCircle(p);

    // Cars are solid to a pedestrian.
    for (const car of G.cars) {
      const d = U.dist(p.x, p.y, car.x, car.y);
      const min = car.radius * 0.78 + p.radius;
      if (d > 0 && d < min) {
        if (Math.abs(car.speed) > 65 && p.hurtT <= 0) {
          PA.Combat.hurtPlayer(G, Math.abs(car.speed) * 0.22);
          p.hurtT = 0.9; // a breath between impacts: one hit must not chain into death
          G.events.push({ type: 'playerHitByCar', car });
          p.x += ((p.x - car.x) / d) * 22;
          p.y += ((p.y - car.y) / d) * 22;
        } else {
          p.x = car.x + ((p.x - car.x) / d) * min;
          p.y = car.y + ((p.y - car.y) / d) * min;
        }
      }
    }

    // Aim at the mouse, in world space.
    const worldMouseX = G.camera.x + G.input.mouseX;
    const worldMouseY = G.camera.y + G.input.mouseY;
    p.aimAngle = U.angleTo(p.x, p.y, worldMouseX, worldMouseY);

    if (G.input.mouseDown && !G.dialogue) {
      PA.Combat.tryShoot(G); // a fired shot reports itself as a gunshot event
    }
  }

  function computePrompt() {
    const p = G.player;
    G.prompt = null;
    if (G.mode !== 'playing' || G.dialogue) return;
    if (p.inCar) {
      G.prompt = 'F — Exit vehicle';
      return;
    }
    const target = PA.Missions.currentTarget(G);
    if (!G.mission && target && target.idle && U.dist(p.x, p.y, target.x, target.y) < 48) {
      const next = PA.Missions.STORY[G.storyIndex];
      G.prompt = next ? 'ENTER — Meet Marisol: "' + next.title + '" (' + U.formatMoney(next.pay) + ')' : null;
      return;
    }
    const car = PA.Vehicles.nearestCar(p.x, p.y, 54, G.cars);
    if (car && !car.occupied) {
      G.prompt = 'F — ' + (car.kind === 'parked' ? 'Steal the ' : 'Take the ') + car.model.name;
      return;
    }
    const poiDef = City.nearestPoi(p.x, p.y, 46);
    if (poiDef) G.prompt = 'F — ' + poiDef.name;
  }

  // ---------------------------------------------------------------- events
  function witnessedByCrowd(x, y, range) {
    for (const ped of G.peds) {
      if (ped.state !== 'down' && U.distSq(x, y, ped.x, ped.y) < range * range) return true;
    }
    return G.police.length > 0;
  }

  function processEvents() {
    for (const ev of G.events) {
      switch (ev.type) {
        case 'gunshot':
          if (ev.byPlayer) {
            G.stats.shotsFired += 1;
            if (witnessedByCrowd(ev.x, ev.y, 300)) PA.Police.crime(G, 'gunshot');
          }
          break;
        case 'pedHit':
          if (ev.byPlayer) PA.Police.crime(G, 'pedHit');
          break;
        case 'copShot':
          PA.Police.crime(G, 'copHit');
          break;
        case 'crash':
          if (G.wanted.seen) PA.Police.crime(G, 'reckless');
          break;
        case 'busted':
          doBusted();
          break;
        case 'wasted':
          doWasted();
          break;
        case 'missionComplete':
          if (ev.story) {
            G.completeInfo.text = '"' + ev.title + '" — ' + U.formatMoney(ev.pay) + '. ' + ev.outro;
            G.mode = 'complete';
          } else {
            G.notice = { text: ev.title + ' complete: ' + U.formatMoney(ev.pay), until: G.time + 3.4 };
          }
          break;
        case 'missionFailed':
          G.notice = { text: '"' + ev.title + '" failed. ' + ev.reason, until: G.time + 3.4 };
          break;
        case 'briefcase':
          G.notice = { text: 'Briefcase found (' + ev.found + '/10): +$250', until: G.time + 3 };
          break;
        case 'notice':
          G.notice = { text: ev.text, until: G.time + 3.2 };
          break;
        case 'starsUp':
          G.notice = { text: 'Wanted level ' + ev.stars + ' ★', until: G.time + 2 };
          break;
        default:
          break;
      }
    }
    G.events.length = 0;
  }

  function doBusted() {
    const p = G.player;
    G.stats.busts += 1;
    const fine = Math.min(p.cash, 150 + G.wanted.stars * 60);
    p.cash -= fine;
    if (G.mission) PA.Missions.failMission(G, 'Busted.');
    PA.Police.clear(G);
    if (p.inCar) exitCar();
    const hq = City.poiById('policehq');
    p.x = hq.doorX;
    p.y = hq.doorY + 8;
    p.health = Math.max(p.health, 55);
    G.bustFlash = 1.6;
    G.notice = { text: 'Busted. The APD takes ' + U.formatMoney(fine) + ' and your afternoon.', until: G.time + 3.6 };
    PA.Save.store(PA.Save.snapshot(G));
  }

  function doWasted() {
    G.stats.deaths += 1;
    G.wastedFlash = 1.2;
    G.overInfo = {
      title: 'WASTED',
      text: 'You wake up at St. Marina Hospital. The bill is $100 and your pride is on life support.',
    };
    if (G.mission) PA.Missions.failMission(G, 'You were wasted.');
    G.mode = 'over';
  }

  function respawnFromWasted() {
    const p = G.player;
    p.cash = Math.max(0, p.cash - 100);
    PA.Police.clear(G);
    if (p.inCar) exitCar();
    const hosp = City.poiById('hospital');
    p.x = hosp.doorX;
    p.y = hosp.doorY + 8;
    p.health = 100;
    G.mode = 'playing';
    PA.Save.store(PA.Save.snapshot(G));
  }

  // ---------------------------------------------------------------- step
  function step(dt) {
    G.time += dt;
    if (G.bustFlash > 0) G.bustFlash -= dt;
    if (G.wastedFlash > 0) G.wastedFlash -= dt;

    if (G.mode === 'title') {
      // The city idles behind the menu: traffic rolls, people stroll.
      PA.Vehicles.update(G, dt);
      PA.Peds.update(G, dt);
      G.events.length = 0;
      updateCamera(dt, true);
      return;
    }
    if (G.mode !== 'playing') return;

    G.timeOfDay = (G.timeOfDay + dt / 45) % 24;
    updatePlayer(dt);
    PA.Vehicles.update(G, dt);
    PA.Peds.update(G, dt);
    PA.Police.update(G, dt);
    PA.Combat.update(G, dt);
    PA.Missions.update(G, dt);
    PA.Missions.updateBriefcases(G);
    processEvents();
    computePrompt();
    updateCamera(dt, false);

    G.saveTimer += dt;
    if (G.saveTimer > 20) {
      G.saveTimer = 0;
      PA.Save.store(PA.Save.snapshot(G));
    }
  }

  function updateCamera(dt, idle) {
    const focus = G.player && !idle ? G.player : { x: City.WORLD / 2, y: City.WORLD / 2 };
    let tx = focus.x - VIEW_W / 2;
    let ty = focus.y - VIEW_H / 2;
    if (idle) {
      tx = City.WORLD / 2 - VIEW_W / 2 + Math.sin(G.time * 0.05) * 500;
      ty = City.WORLD / 2 - VIEW_H / 2 + Math.cos(G.time * 0.04) * 500;
    }
    const k = idle ? 1 : Math.min(1, dt * 6);
    G.camera.x = U.lerp(G.camera.x, U.clamp(tx, 0, City.WORLD - VIEW_W), k);
    G.camera.y = U.lerp(G.camera.y, U.clamp(ty, 0, City.WORLD - VIEW_H), k);
  }

  function nightFactor() {
    const h = G.timeOfDay;
    const sun = Math.sin(((h - 6) / 12) * Math.PI); // >0 in the day
    if (h < 5 || h > 19.5) return 1;
    return U.clamp(1 - sun * 1.5, 0, 1);
  }

  // ---------------------------------------------------------------- render
  function drawPlayer(ctx, view) {
    const p = G.player;
    if (p.inCar) return;
    const sx = p.x - view.x;
    const sy = p.y - view.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 9, 6, 0, 0, U.TAU);
    ctx.fill();
    ctx.rotate(p.angle);
    ctx.fillStyle = '#232833';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 7, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#c23b2a';
    ctx.beginPath();
    ctx.ellipse(1, 0, 6.5, 5.5, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(5, 0, 4.6, 0, U.TAU);
    ctx.fill();
    ctx.restore();

    // The pistol, and a melee swing arc.
    if (p.hasPistol) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.aimAngle);
      ctx.fillStyle = '#14161c';
      ctx.fillRect(8, -2, 10, 4);
      ctx.restore();
    }
    if (p.swingT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 30, p.aimAngle - 0.7, p.aimAngle + 0.5);
      ctx.stroke();
    }
    // Bust meter ring while the police have you pinned.
    if (G.bust.meter > 0.02) {
      ctx.strokeStyle = '#5c9dff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx, sy, 20, -Math.PI / 2, -Math.PI / 2 + G.bust.meter * U.TAU);
      ctx.stroke();
    }
  }

  function drawTargetMarker(ctx, view, time) {
    const target = PA.Missions.currentTarget(G);
    if (!target || G.mode !== 'playing') return;
    const sx = target.x - view.x;
    const sy = target.y - view.y;
    const pulse = 0.75 + Math.sin(time * 5) * 0.25;
    ctx.strokeStyle = `rgba(255,217,74,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, 22, 0, U.TAU);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,217,74,${0.35 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 90);
    ctx.lineTo(sx - 9, sy - 26);
    ctx.lineTo(sx + 9, sy - 26);
    ctx.closePath();
    ctx.fill();
    // An edge arrow when the objective is off-screen.
    if (sx < 0 || sy < 0 || sx > VIEW_W || sy > VIEW_H) {
      const cx = U.clamp(sx, 26, VIEW_W - 26);
      const cy = U.clamp(sy, 26, VIEW_H - 26);
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function render(ctx) {
    const view = { x: G.camera.x, y: G.camera.y, w: VIEW_W, h: VIEW_H };
    const night = nightFactor();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    City.draw(ctx, view, night, G.foundCases);
    for (const car of G.cars) PA.Vehicles.draw(ctx, view, car, night, G.time);
    for (const ped of G.peds) PA.Peds.draw(ctx, view, ped, G.time);
    if (G.started) drawPlayer(ctx, view);
    PA.Combat.drawBullets(ctx, view, G);
    PA.Combat.drawEffects(ctx, view, G);
    drawTargetMarker(ctx, view, G.time);

    if (night > 0.02) {
      ctx.fillStyle = `rgba(10,14,46,${night * 0.38})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (G.player && G.player.hurtT > 0) {
      ctx.fillStyle = `rgba(200,30,20,${G.player.hurtT * 0.55})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (G.player && G.player.health < 30 && G.mode === 'playing') {
      ctx.fillStyle = `rgba(160,10,0,${0.12 + Math.sin(G.time * 6) * 0.05})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // ---------------------------------------------------------------- boot
  function onAction(action) {
    if (action === 'new') newGame();
    else if (action === 'continue') continueGame();
    else if (action === 'resume') G.mode = 'playing';
    else if (action === 'restart') newGame();
    else if (action === 'again') respawnFromWasted();
    else if (action === 'keepPlaying') G.mode = 'playing';
  }

  function boot() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    resetWorld();
    G.player = freshPlayer();
    G.stats = freshStats();
    bindInput(canvas);
    PA.Hud.init(onAction);
    updateCamera(1, true);

    let last = -1;
    function frame(ts) {
      if (last < 0) last = ts;
      const dt = Math.min(0.033, (ts - last) / 1000);
      last = ts;
      step(dt);
      render(ctx);
      PA.Hud.update(G);
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Exposed for the headless play-test harness and for debugging.
  PA.Game = { G, step, render, newGame, continueGame, onAction, nightFactor };
})();
