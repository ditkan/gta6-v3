// hud.js — everything the player reads: health and armour bars, cash, wanted
// stars, the clock, the mission banner, context prompts, dialogue boxes, the
// end-state overlays, the menu screens, and the live circular minimap with
// streets, the player, the mission marker and the police.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});
  const U = PA.util;
  const City = PA.City;

  const els = {};
  let minimapCtx = null;
  let lastDistrict = '';
  let lastCash = null;
  let lastStars = -1;

  function el(id) {
    return document.getElementById(id);
  }

  function init(onAction) {
    const ids = [
      'hud', 'bar-health', 'bar-armour', 'hud-district', 'hud-cash', 'hud-stars', 'hud-clock',
      'hud-banner', 'banner-title', 'banner-text', 'hud-weapon', 'weapon-name', 'weapon-ammo',
      'hud-prompt', 'hud-dialogue', 'dialogue-name', 'dialogue-text', 'hud-busted', 'hud-wasted',
      'screen-start', 'screen-pause', 'screen-over', 'screen-complete',
      'btn-continue', 'pause-stats', 'over-title', 'over-text', 'complete-text',
    ];
    for (const id of ids) els[id] = el(id);
    const mm = el('minimap');
    if (mm && mm.getContext) minimapCtx = mm.getContext('2d');

    const wire = (id, action) => {
      const b = el(id);
      if (b && b.addEventListener) b.addEventListener('click', () => onAction(action));
    };
    wire('btn-new-game', 'new');
    wire('btn-continue', 'continue');
    wire('btn-resume', 'resume');
    wire('btn-restart', 'restart');
    wire('btn-again', 'again');
    wire('btn-continue-play', 'keepPlaying');
  }

  function setVisible(node, vis) {
    if (!node || !node.classList) return;
    node.classList.toggle('hidden', !vis);
  }

  function showScreens(G) {
    setVisible(els['screen-start'], G.mode === 'title');
    setVisible(els['screen-pause'], G.mode === 'paused');
    setVisible(els['screen-over'], G.mode === 'over');
    setVisible(els['screen-complete'], G.mode === 'complete');
    setVisible(els['hud'], G.mode === 'playing' || G.mode === 'paused' || G.mode === 'complete');
    if (G.mode === 'title') setVisible(els['btn-continue'], PA.Save.exists());
    if (G.mode === 'paused' && els['pause-stats']) {
      els['pause-stats'].innerHTML =
        'Cash ' + U.formatMoney(G.player.cash) +
        ' · Jobs done ' + G.stats.jobsDone +
        ' · Briefcases ' + G.foundCases.size + '/10' +
        ' · Cars stolen ' + G.stats.carsStolen;
    }
    if (G.mode === 'over' && els['over-title']) {
      els['over-title'].textContent = G.overInfo.title;
      els['over-text'].textContent = G.overInfo.text;
    }
    if (G.mode === 'complete' && els['complete-text']) {
      els['complete-text'].textContent = G.completeInfo.text;
    }
  }

  function updateBars(G) {
    if (els['bar-health']) els['bar-health'].style.width = U.clamp(G.player.health, 0, 100) + '%';
    if (els['bar-armour']) els['bar-armour'].style.width = U.clamp(G.player.armour, 0, 100) + '%';
    if (lastCash !== G.player.cash && els['hud-cash']) {
      els['hud-cash'].textContent = U.formatMoney(G.player.cash);
      lastCash = G.player.cash;
    }
    if (els['hud-clock']) els['hud-clock'].textContent = U.formatClock(G.timeOfDay);
    if (lastStars !== G.wanted.stars && els['hud-stars']) {
      let html = '';
      for (let i = 0; i < 5; i++) {
        html += i < G.wanted.stars ? '★' : '<span class="off">★</span>';
      }
      // A flashing frame while the police are losing sight of you.
      if (G.wanted.stars > 0 && !G.wanted.seen && Math.floor(G.time * 2) % 2 === 0) {
        html = '';
        for (let i = 0; i < 5; i++) html += i < G.wanted.stars ? '<span class="off">★</span>' : '<span class="off">★</span>';
      }
      els['hud-stars'].innerHTML = html;
      lastStars = G.wanted.stars;
    }
    const district = City.districtAt(G.player.x, G.player.y).name;
    if (district !== lastDistrict && els['hud-district']) {
      els['hud-district'].textContent = district;
      lastDistrict = district;
    }
  }

  function updateWeapon(G) {
    const show = G.player.hasPistol && !G.player.inCar;
    setVisible(els['hud-weapon'], show);
    if (show && els['weapon-ammo']) {
      els['weapon-ammo'].textContent = G.player.reloading > 0
        ? '···'
        : G.player.ammo + ' / ' + G.player.reserve;
      els['weapon-ammo'].classList.toggle('low', G.player.ammo <= 3 && G.player.reloading <= 0);
    }
  }

  function updateBanner(G) {
    let title = '';
    let text = '';
    let show = false;
    if (G.notice && G.time < G.notice.until) {
      text = G.notice.text;
      show = true;
    } else if (G.mission) {
      title = G.mission.def.title.toUpperCase();
      const target = PA.Missions.currentTarget(G);
      text = target ? target.label : '';
      if (G.mission.timer != null) {
        text += ' — <span class="timer">' + Math.max(0, Math.ceil(G.mission.timer)) + 's</span>';
      }
      show = true;
    } else if (G.storyIndex >= PA.Missions.STORY.length && !G.mission) {
      title = 'PORT AZURA';
      text = 'Story complete. The city is yours — courier work pays at Palm Pawn.';
      show = true;
    }
    setVisible(els['hud-banner'], show);
    if (show && els['banner-title']) {
      els['banner-title'].textContent = title;
      els['banner-text'].innerHTML = text;
    }
  }

  function updateDialogue(G) {
    const d = G.dialogue;
    setVisible(els['hud-dialogue'], !!d);
    if (d && els['dialogue-text']) {
      const line = d.lines[d.index];
      els['dialogue-name'].textContent = line.name;
      els['dialogue-text'].textContent = line.text;
    }
  }

  function updatePrompt(G) {
    setVisible(els['hud-prompt'], !!G.prompt);
    if (G.prompt && els['hud-prompt']) els['hud-prompt'].textContent = G.prompt;
  }

  function drawMinimap(G) {
    if (!minimapCtx) return;
    const ctx = minimapCtx;
    const S = 184;
    const scale = S / City.WORLD;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, U.TAU);
    ctx.clip();
    ctx.fillStyle = '#232a33';
    ctx.fillRect(0, 0, S, S);

    // Blocks and roads.
    ctx.fillStyle = '#39424e';
    for (let by = 0; by < 12; by++) {
      for (let bx = 0; bx < 12; bx++) {
        const x = (City.STREETS[bx] + City.ROAD_HALF) * scale;
        const y = (City.STREETS[by] + City.ROAD_HALF) * scale;
        const w = (City.STREET_PITCH - City.ROAD_HALF * 2) * scale;
        ctx.fillRect(x, y, w, w);
      }
    }
    ctx.strokeStyle = 'rgba(220,225,235,0.25)';
    ctx.lineWidth = 1;
    for (const p of City.data.pois) {
      ctx.fillStyle = '#ffd98a';
      ctx.fillRect(p.x * scale - 1.5, p.y * scale - 1.5, 3, 3);
    }

    // Briefcases, while the Lookout reveal lasts.
    if (G.revealCasesUntil > G.time) {
      ctx.fillStyle = '#ffd94a';
      for (const c of City.data.briefcases) {
        if (G.foundCases.has(c.id)) continue;
        ctx.fillRect(c.x * scale - 2, c.y * scale - 2, 4, 4);
      }
    }

    // The mission marker breathes gold.
    const target = PA.Missions.currentTarget(G);
    if (target && G.mode === 'playing') {
      const r = 4 + Math.sin(G.time * 5) * 1.4;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.arc(target.x * scale, target.y * scale, r, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = '#10131c';
      ctx.stroke();
    }

    // Police as blue dots.
    ctx.fillStyle = '#5c9dff';
    for (const car of G.police) {
      ctx.beginPath();
      ctx.arc(car.x * scale, car.y * scale, 2.6, 0, U.TAU);
      ctx.fill();
    }

    // The player: a white arrow on foot, a white wedge in a car.
    const px = G.player.x * scale;
    const py = G.player.y * scale;
    const facing = G.player.inCar ? G.player.car.angle : G.player.aimAngle;
    ctx.translate(px, py);
    ctx.rotate(facing);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function update(G) {
    showScreens(G);
    if (G.mode === 'title') return;
    updateBars(G);
    updateWeapon(G);
    updateBanner(G);
    updateDialogue(G);
    updatePrompt(G);
    setVisible(els['hud-busted'], G.bustFlash > 0);
    setVisible(els['hud-wasted'], G.wastedFlash > 0);
    drawMinimap(G);
  }

  PA.Hud = { init, update };
})();
