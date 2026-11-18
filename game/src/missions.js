// missions.js — the work of Port Azura: Marisol Vega's six-job story chain
// (dialogue, markers, timers, payouts from $750 to $5,000), repeatable courier
// jobs between the points of interest, the ten hidden briefcases, and what each
// point of interest does when you walk up and press F.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  function poi(id) {
    return City.poiById(id);
  }

  // The story. Each job: intro dialogue, then stages. A stage is one objective:
  // goto (reach a point), steal (get into the marked car), deliver (reach a
  // point in the marked car), wreck (beat a car down), or escape (reach a point
  // after scripted heat). time, when present, counts down to failure.
  const STORY = [
    {
      id: 'first-run',
      title: 'First Run',
      pay: 750,
      intro: [
        { name: 'MARISOL VEGA', text: 'Nico Ferreira. Rosa said you can drive and keep your mouth shut. Both true?' },
        { name: 'NICO', text: 'Both true. What is the work?' },
        { name: 'MARISOL VEGA', text: 'A package waits at the Docks Warehouse. Take it to the casino service door. Quietly.' },
      ],
      stages: [
        { type: 'goto', poi: 'warehouse', label: 'Pick up the package at the Docks Warehouse' },
        { type: 'goto', poi: 'casino', label: 'Deliver the package to the casino service door' },
      ],
      outro: 'Clean work. The casino thanks you, and so do I.',
    },
    {
      id: 'hot-wheels',
      title: 'Hot Wheels',
      pay: 1200,
      intro: [
        { name: 'MARISOL VEGA', text: 'A Comet Coupe in North Heights owes me money its owner does not have.' },
        { name: 'NICO', text: 'So I collect the car instead.' },
        { name: 'MARISOL VEGA', text: 'Bring it to the Harbor Garage. Intact, Nico. Mostly intact.' },
      ],
      stages: [
        { type: 'steal', label: 'Steal the marked Comet Coupe' },
        { type: 'deliver', poi: 'garage', label: 'Deliver the coupe to the Harbor Garage' },
      ],
      outro: 'The garage boys are already arguing over who gets to wash it.',
    },
    {
      id: 'dockside-pickup',
      title: 'Dockside Pickup',
      pay: 1800,
      intro: [
        { name: 'MARISOL VEGA', text: 'Customs seized a case at the warehouse. Tonight it walks out the back gate.' },
        { name: 'NICO', text: 'And the police?' },
        { name: 'MARISOL VEGA', text: 'Will have opinions. Drive like you mean it. Palm Pawn buys it, no questions.' },
      ],
      stages: [
        { type: 'goto', poi: 'warehouse', label: 'Grab the seized case at the warehouse', crime: 'mission' },
        { type: 'goto', poi: 'pawn', label: 'Take the case to Palm Pawn' },
      ],
      outro: 'The pawnbroker paid in full and asked nothing. My favourite kind of man.',
    },
    {
      id: 'the-collector',
      title: 'The Collector',
      pay: 2600,
      intro: [
        { name: 'MARISOL VEGA', text: 'A street racer named Dario runs my corners and pays nobody. His car is his pride.' },
        { name: 'NICO', text: 'You want the car humbled.' },
        { name: 'MARISOL VEGA', text: 'Wreck it where the Row can see. Then come home. He will understand the message.' },
      ],
      stages: [
        { type: 'wreck', label: "Wreck Dario's pride — beat his car down" },
        { type: 'goto', poi: 'safehouse', label: 'Return to the safehouse' },
      ],
      outro: 'Dario paid his corner fees an hour later. In cash. Shaking.',
    },
    {
      id: 'night-run',
      title: 'Night Run',
      pay: 3600,
      intro: [
        { name: 'MARISOL VEGA', text: 'Five drops, one night, no names. The route is on your map, the clock is not your friend.' },
        { name: 'NICO', text: 'Five checkpoints. And if the clock wins?' },
        { name: 'MARISOL VEGA', text: 'Then the buyers walk, and so do you. Go.' },
      ],
      stages: [
        { type: 'checkpoints', label: 'Hit every checkpoint before the clock runs out', time: 170 },
      ],
      outro: 'Every buyer paid. You drive like the city owes you money.',
    },
    {
      id: 'heat-on-the-harbor',
      title: 'Heat on the Harbor',
      pay: 5000,
      intro: [
        { name: 'MARISOL VEGA', text: 'Last one, Nico. The gold case at the docks — the whole port knows it moves tonight.' },
        { name: 'NICO', text: 'Every cruiser in Azura will come.' },
        { name: 'MARISOL VEGA', text: 'Then lose them, and bring it home to me. Five thousand, and my respect. Both are rare.' },
      ],
      stages: [
        { type: 'goto', poi: 'warehouse', label: 'Take the gold case from the Docks Warehouse', heat: 245 },
        { type: 'escape', poi: 'safehouse', label: 'Lose the heat and reach the safehouse' },
      ],
      outro: 'Port Azura is yours now, Nico. Try not to spend it all on repairs.',
    },
  ];

  const CHECKPOINT_POIS = ['fuel', 'lookout', 'casino', 'hospital', 'pawn'];

  function stagePoint(stage) {
    if (stage.poi) {
      const p = poi(stage.poi);
      return { x: p.doorX, y: p.doorY };
    }
    return { x: stage.x, y: stage.y };
  }

  function startStoryMission(G) {
    const def = STORY[G.storyIndex];
    if (!def) return false;
    G.dialogue = {
      lines: def.intro,
      index: 0,
      onDone: () => beginMission(G, { kind: 'story', def, stageIndex: 0, stage: null, timer: null, targetCar: null }),
    };
    return true;
  }

  function beginMission(G, m) {
    G.mission = m;
    setupStage(G);
    G.events.push({ type: 'missionStart', mission: m });
  }

  function setupStage(G) {
    const m = G.mission;
    const stage = m.def.stages[m.stageIndex];
    m.stage = stage;
    m.timer = typeof stage.time === 'number' ? stage.time : null;
    m.stageTime = 0;
    if (stage.type === 'steal' || stage.type === 'wreck') {
      // Spawn the marked car on a North Heights / Casino Row street.
      const rng = G.rng;
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 20; tries++) {
        const si = U.randInt(rng, 0, 5);
        const along = U.randRange(rng, 300, 1500);
        x = City.STREETS[si] + (rng() < 0.5 ? -20 : 20);
        y = along;
        if (!City.circleHitsBuilding(x, y, 26)) break;
      }
      const car = PA.Vehicles.createCar(x, y, Math.PI / 2, 'parked', rng);
      if (stage.type === 'steal') car.model = { name: 'Comet Coupe', color: '#d4543c', maxSpeed: 345, accel: 265, grip: 3.9 };
      if (stage.type === 'steal') car.color = '#d4543c';
      if (stage.type === 'wreck') {
        car.color = '#e8e4da';
        car.model = { name: "Dario's Comet", color: '#e8e4da', maxSpeed: 330, accel: 250, grip: 3.8 };
      }
      car.missionTarget = true;
      G.cars.push(car);
      m.targetCar = car;
    }
    if (stage.type === 'checkpoints') {
      m.checkpoints = CHECKPOINT_POIS.map((id) => {
        const p = poi(id);
        return { x: p.doorX, y: p.doorY, name: p.name, done: false };
      });
      m.cpIndex = 0;
    }
    // Note: a stage's crime/heat fires on arrival, in update() below — grabbing
    // the case is the crime, not being told about it.
  }

  function currentTarget(G) {
    const m = G.mission;
    if (!m) {
      if (G.storyIndex < STORY.length) {
        const p = poi('safehouse');
        return { x: p.doorX, y: p.doorY, label: 'Meet Marisol at the safehouse', idle: true };
      }
      return null;
    }
    const stage = m.stage;
    if (!stage) return null;
    if (stage.type === 'steal' || stage.type === 'wreck' || stage.type === 'deliver') {
      if (stage.type !== 'deliver' || !G.player.inCar) {
        return { x: m.targetCar.x, y: m.targetCar.y, label: stage.label };
      }
    }
    if (stage.type === 'checkpoints') {
      const cp = m.checkpoints[m.cpIndex];
      if (cp) return { x: cp.x, y: cp.y, label: stage.label + ' (' + (m.cpIndex + 1) + '/' + m.checkpoints.length + ')' };
    }
    const pt = stagePoint(stage);
    return { x: pt.x, y: pt.y, label: stage.label };
  }

  function completeMission(G) {
    const m = G.mission;
    G.player.cash += m.def.pay;
    G.stats.jobsDone += 1;
    if (m.kind === 'story') {
      G.storyIndex += 1;
      G.events.push({ type: 'missionComplete', title: m.def.title, pay: m.def.pay, outro: m.def.outro, story: true });
    } else {
      G.events.push({ type: 'missionComplete', title: m.def.title, pay: m.def.pay, outro: '', story: false });
    }
    PA.Audio.cash();
    if (m.targetCar) m.targetCar.missionTarget = false;
    G.mission = null;
    PA.Save.store(PA.Save.snapshot(G));
  }

  function failMission(G, reason) {
    const m = G.mission;
    if (!m) return;
    if (m.targetCar) {
      m.targetCar.missionTarget = false;
      const i = G.cars.indexOf(m.targetCar);
      if (i >= 0 && m.stage && (m.stage.type === 'steal' || m.stage.type === 'wreck')) G.cars.splice(i, 1);
    }
    G.events.push({ type: 'missionFailed', title: m.def.title, reason });
    G.mission = null;
  }

  function update(G, dt) {
    const m = G.mission;
    if (!m) return;
    const stage = m.stage;
    m.stageTime += dt;
    if (m.timer != null) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(G, 'Out of time.');
        return;
      }
    }
    const p = G.player;
    const advance = () => {
      m.stageIndex += 1;
      if (m.stageIndex >= m.def.stages.length) completeMission(G);
      else setupStage(G);
    };

    if (stage.type === 'goto' || stage.type === 'escape') {
      const pt = stagePoint(stage);
      if (U.dist(p.x, p.y, pt.x, pt.y) < 40) {
        if (stage.type === 'escape' && G.wanted.stars > 1) {
          // Not yet: the safehouse door stays shut while cruisers watch.
          if (m.stageTime > 1) {
            m.stageTime = 0;
            G.events.push({ type: 'notice', text: 'Too much heat — lose the police first!' });
          }
          return;
        }
        if (stage.crime) PA.Police.crime(G, stage.crime);
        if (stage.heat) PA.Police.addHeat(G, stage.heat);
        advance();
      }
    } else if (stage.type === 'steal') {
      if (p.inCar && p.car === m.targetCar) advance();
    } else if (stage.type === 'deliver') {
      const pt = stagePoint(stage);
      if (p.inCar && p.car === m.targetCar && U.dist(p.x, p.y, pt.x, pt.y) < 52) advance();
      else if (m.targetCar.dead) failMission(G, 'The car was destroyed.');
    } else if (stage.type === 'wreck') {
      if (m.targetCar.health <= 45 || m.targetCar.dead) advance();
    } else if (stage.type === 'checkpoints') {
      const cp = m.checkpoints[m.cpIndex];
      if (cp && U.dist(p.x, p.y, cp.x, cp.y) < 46) {
        cp.done = true;
        m.cpIndex += 1;
        PA.Audio.pickup();
        if (m.cpIndex >= m.checkpoints.length) advance();
      }
    }
  }

  // --- Courier jobs ---------------------------------------------------------
  function startCourier(G) {
    if (G.mission) return false;
    const rng = G.rng;
    const ids = City.data.pois.map((p) => p.id).filter((id) => id !== 'safehouse' && id !== 'policehq');
    const from = poi(U.pick(rng, ids));
    let to = poi(U.pick(rng, ids));
    let guard = 0;
    while (to.id === from.id && guard++ < 8) to = poi(U.pick(rng, ids));
    const d = U.dist(from.doorX, from.doorY, to.doorX, to.doorY);
    const pay = Math.round(110 + d * 0.14);
    const time = Math.round(d / 8.5) + 25;
    const def = {
      id: 'courier',
      title: 'Courier Run',
      pay,
      stages: [
        { type: 'goto', x: from.doorX, y: from.doorY, label: 'Pick up the parcel at ' + from.name },
        { type: 'goto', x: to.doorX, y: to.doorY, label: 'Deliver to ' + to.name, time },
      ],
    };
    beginMission(G, { kind: 'courier', def, stageIndex: 0, stage: null, timer: null, targetCar: null });
    G.events.push({ type: 'notice', text: 'Courier job: ' + from.name + ' → ' + to.name + ' — ' + U.formatMoney(pay) });
    return true;
  }

  // --- Briefcases -------------------------------------------------------------
  function updateBriefcases(G) {
    for (const c of City.data.briefcases) {
      if (G.foundCases.has(c.id)) continue;
      if (U.dist(G.player.x, G.player.y, c.x, c.y) < 22) {
        G.foundCases.add(c.id);
        G.player.cash += 250;
        G.stats.casesFound += 1;
        G.effects.push({ type: 'ring', x: c.x, y: c.y, t: 0.5, max: 0.5 });
        G.events.push({ type: 'briefcase', found: G.foundCases.size });
        PA.Audio.pickup();
        PA.Save.store(PA.Save.snapshot(G));
      }
    }
  }

  // --- Points of interest -------------------------------------------------------
  function usePoi(G, poiDef) {
    const p = G.player;
    const notice = (text) => G.events.push({ type: 'notice', text });
    switch (poiDef.kind) {
      case 'gunshop': {
        if (!p.hasPistol) {
          if (p.cash >= 500) {
            p.cash -= 500;
            p.hasPistol = true;
            p.ammo = PA.Combat.MAG_SIZE;
            p.reserve = 24;
            notice('Pistol bought. Stay safe out there.');
            PA.Audio.cash();
          } else notice('A pistol costs $500. Come back richer.');
        } else if (p.armour < 100) {
          if (p.cash >= 300) {
            p.cash -= 300;
            p.armour = 100;
            notice('Armour fitted. You feel heavier and safer.');
            PA.Audio.cash();
          } else notice('Armour costs $300.');
        } else if (p.cash >= 120) {
          p.cash -= 120;
          p.reserve += 48;
          notice('Ammo restocked: +48 rounds.');
          PA.Audio.cash();
        } else {
          notice('Ammo costs $120.');
        }
        break;
      }
      case 'hospital': {
        if (p.health >= 100) {
          notice('The nurse says you look fine.');
        } else if (p.cash >= 80) {
          p.cash -= 80;
          p.health = 100;
          notice('Patched up. Try to keep the blood inside.');
          PA.Audio.cash();
        } else {
          p.health = 100;
          notice('St. Marina treats you on the house this time.');
        }
        break;
      }
      case 'garage': {
        const car = p.inCar ? p.car : PA.Vehicles.nearestCar(p.x, p.y, 70, G.cars);
        if (!car) notice('Bring a car to the Harbor Garage first.');
        else if (car.health >= 100 && !car.dead) notice('That ride is already spotless.');
        else if (p.cash >= 150) {
          p.cash -= 150;
          car.health = 100;
          car.dead = false;
          notice('Good as new. The boys work fast.');
          PA.Audio.cash();
        } else notice('A full repair costs $150.');
        break;
      }
      case 'fuel': {
        const car = p.inCar ? p.car : null;
        if (!car) notice('Fuel & Go: drive in for a quick patch-up.');
        else if (car.health >= 100) notice('Tank full, panels straight. Off you go.');
        else if (p.cash >= 60) {
          p.cash -= 60;
          car.health = Math.min(100, car.health + 50);
          car.dead = car.health <= 0;
          notice('Quick patch: +50% bodywork.');
          PA.Audio.cash();
        } else notice('A quick patch costs $60.');
        break;
      }
      case 'casino': {
        if (p.cash < 100) {
          notice('The casino floor starts at $100.');
        } else {
          p.cash -= 100;
          if (G.rng() < 0.45) {
            p.cash += 200;
            notice('The wheel loves you: +$100 profit!');
          } else {
            notice('The house wins. It usually does.');
          }
          PA.Audio.cash();
        }
        break;
      }
      case 'pawn': {
        if (!G.mission) {
          if (startCourier(G)) break;
        }
        notice('Palm Pawn: "We buy anything. We ask nothing."');
        break;
      }
      case 'police': {
        if (G.wanted.stars > 0 && G.wanted.stars <= 2 && !G.wanted.seen) {
          if (p.cash >= 250) {
            p.cash -= 250;
            PA.Police.clear(G);
            notice('Fine paid at the desk. Your record is clean.');
            PA.Audio.cash();
          } else notice('The desk sergeant wants $250 to clear two stars or less.');
        } else if (G.wanted.stars > 2) {
          notice('The desk sergeant laughs. "Not for that heat, friend."');
        } else {
          notice('Azura Police HQ. Everyone is very polite. It is unsettling.');
        }
        break;
      }
      case 'safehouse': {
        p.health = Math.min(100, p.health + 50);
        G.timeOfDay = 8;
        PA.Save.store(PA.Save.snapshot(G));
        notice('You rest at Rosa\'s. Morning comes, and the game is saved.');
        break;
      }
      case 'lookout': {
        G.revealCasesUntil = G.time + 60;
        notice('From the Lookout, the city glitters — briefcases marked on your map for 60s.');
        break;
      }
      case 'warehouse': {
        notice('Crates, gulls, and men who do not make eye contact.');
        break;
      }
      default:
        notice(poiDef.name);
    }
  }

  PA.Missions = {
    STORY,
    startStoryMission,
    startCourier,
    currentTarget,
    update,
    failMission,
    updateBriefcases,
    usePoi,
  };
})();
