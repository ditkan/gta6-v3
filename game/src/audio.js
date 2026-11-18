// audio.js — every sound in Port Azura: Heat is synthesised with WebAudio at
// play time: an engine hum that tracks your speed, a noise-burst gunshot, pickup
// and cash blips, a two-tone police siren, and a small bass-and-arp music loop.
// There are no audio files. If WebAudio is missing (or still locked behind the
// first user gesture) every call is a safe no-op.

(function () {
  'use strict';

  const PA = (window.PA = window.PA || {});

  let ctx = null;
  let master = null;
  let muted = false;

  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;

  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;

  let musicTimer = null;
  let musicStep = 0;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (err) {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    return true;
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setValueAtTime(m ? 0 : 0.6, ctx.currentTime);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  // --- Engine -------------------------------------------------------------
  function engineStart() {
    if (!init() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
  }

  function engineSet(speedNorm, running) {
    if (!engineOsc || !ctx) return;
    const t = ctx.currentTime;
    const f = 42 + speedNorm * 165;
    engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    engineOsc2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.06);
    engineFilter.frequency.setTargetAtTime(240 + speedNorm * 700, t, 0.08);
    engineGain.gain.setTargetAtTime(running ? 0.05 + speedNorm * 0.05 : 0.015, t, 0.09);
  }

  function engineStop() {
    if (!engineOsc || !ctx) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(0, t, 0.05);
    const osc = engineOsc;
    const osc2 = engineOsc2;
    window.setTimeout(() => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
      try { osc2.stop(); } catch (e) { /* already stopped */ }
    }, 180);
    engineOsc = null;
    engineOsc2 = null;
    engineGain = null;
    engineFilter = null;
  }

  // --- One-shots ----------------------------------------------------------
  function blip(freqA, freqB, dur, type, vol) {
    if (!init()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
    g.gain.setValueAtTime(vol || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function gunshot() {
    if (!init()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.16);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const chan = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      chan[i] = (Math.random() * 2 - 1) * (1 - i / len) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    blip(160, 60, 0.1, 'triangle', 0.2);
  }

  function punch() {
    blip(110, 45, 0.09, 'triangle', 0.22);
  }

  function pickup() {
    blip(660, 660, 0.07, 'sine', 0.14);
    window.setTimeout(() => blip(990, 990, 0.1, 'sine', 0.14), 70);
  }

  function cash() {
    blip(880, 880, 0.06, 'square', 0.07);
    window.setTimeout(() => blip(1320, 1320, 0.12, 'square', 0.07), 60);
  }

  function hurt() {
    blip(220, 90, 0.18, 'sawtooth', 0.12);
  }

  function crash(intensity) {
    if (!init()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const chan = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) chan[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1 + 0.25 * Math.min(1, intensity), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(g);
    g.connect(master);
    src.start(t);
  }

  // --- Siren ----------------------------------------------------------------
  function sirenSet(active, closeness) {
    if (!init()) return;
    if (active && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 820;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 130;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    if (sirenOsc && ctx) {
      const target = active ? 0.012 + closeness * 0.05 : 0;
      sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
      if (!active && closeness <= 0) {
        const osc = sirenOsc;
        const lfo = sirenLfo;
        window.setTimeout(() => {
          try { osc.stop(); } catch (e) { /* already stopped */ }
          try { lfo.stop(); } catch (e) { /* already stopped */ }
        }, 500);
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    }
  }

  // --- Music: a slow minor groove, bass on the beat, a sparse arp above ------
  const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0];
  const ARP = [220, 0, 261.63, 329.63, 0, 261.63, 220, 0, 196, 0, 246.94, 293.66, 0, 246.94, 0, 0];

  function musicStart() {
    if (!init() || musicTimer) return;
    musicStep = 0;
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) {
        musicStep = (musicStep + 1) % 16;
        return;
      }
      const i = musicStep % 16;
      if (BASS[i]) blip(BASS[i], BASS[i], 0.22, 'triangle', 0.11);
      if (ARP[i]) blip(ARP[i], ARP[i], 0.16, 'sine', 0.045);
      musicStep++;
    }, 214);
  }

  function musicStop() {
    if (musicTimer) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  PA.Audio = {
    init,
    setMuted,
    isMuted,
    engineStart,
    engineSet,
    engineStop,
    gunshot,
    punch,
    pickup,
    cash,
    hurt,
    crash,
    sirenSet,
    musicStart,
    musicStop,
  };
})();
