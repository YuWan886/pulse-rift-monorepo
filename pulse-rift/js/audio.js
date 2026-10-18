/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — procedural synthwave engine + rhythmic SFX
   Everything you hear is generated at runtime from oscillators
   and noise. No audio files. 120 BPM. A minor orbit.
   ═══════════════════════════════════════════════════════════════ */
(function (PR) {
  'use strict';

  const U = PR.U;
  const { clamp, mod, midiToFreq, rand, pick } = U;

  // ── harmony ──────────────────────────────────────────────────
  const CHORDS = {
    am7: { root: 45, pad: [57, 60, 64, 67], arp: [57, 60, 64, 67, 69, 72, 76], scale: [57, 60, 62, 64, 67, 69, 72, 74] },
    fmaj7: { root: 41, pad: [53, 57, 60, 64], arp: [53, 57, 60, 64, 65, 69, 72], scale: [53, 55, 57, 60, 62, 64, 65, 69] },
    cadd9: { root: 48, pad: [48, 52, 55, 62], arp: [48, 52, 55, 62, 64, 67, 72], scale: [48, 50, 52, 55, 57, 59, 62, 64] },
    g: { root: 43, pad: [55, 59, 62, 67], arp: [55, 59, 62, 67, 69, 71, 74], scale: [55, 57, 59, 62, 64, 67, 69, 71] },
    dm7: { root: 38, pad: [50, 53, 57, 60], arp: [50, 53, 57, 60, 62, 65, 69], scale: [50, 53, 55, 57, 60, 62, 65, 67] },
    e7: { root: 40, pad: [52, 56, 59, 62], arp: [52, 56, 59, 62, 64, 68, 71], scale: [52, 56, 58, 59, 62, 64, 68, 71] },
    bb: { root: 46, pad: [58, 62, 65, 69], arp: [58, 62, 65, 69, 70, 74, 77], scale: [58, 60, 62, 65, 67, 69, 70, 74] },
    gm7: { root: 43, pad: [55, 58, 62, 65], arp: [55, 58, 62, 65, 67, 70, 74], scale: [55, 57, 58, 60, 62, 65, 67, 70] },
    a7: { root: 45, pad: [57, 61, 64, 67], arp: [57, 61, 64, 67, 69, 73, 76], scale: [57, 59, 61, 64, 65, 67, 69, 73] }
  };

  const PROGS = {
    menu: ['am7', 'fmaj7', 'cadd9', 'g'],
    run: ['am7', 'fmaj7', 'cadd9', 'g', 'am7', 'fmaj7', 'dm7', 'e7'],
    boss: ['dm7', 'bb', 'gm7', 'a7', 'dm7', 'bb', 'gm7', 'a7'],
    victory: ['fmaj7', 'cadd9', 'g', 'am7'],
    gameover: ['am7', 'dm7', 'e7', 'am7']
  };

  const BASS_PATTERN = [0, 0, 12, 0, 0, 7, 12, 7];

  class AudioEngine {
    constructor(settings) {
      this.settings = settings || { master: 80, music: 70, sfx: 80, offset: 0 };
      this.ctx = null;
      this.ready = false;
      this.failed = false;
      this.readyPromise = null;
      this.mode = 'menu';
      this.energy = 0.42;
      this.wave = 1;
      this.overdrive = false;
      this.tracks = { drive: 0, arp: 0, pad: 0, perc: 0 };
      this.beatDur = PR.BEAT_DURATION;
      this.stepDur = PR.STEP_DURATION;
      this.startTime = 0;
      this.nextStep = 0;
      this.nextStepTime = 0;
      this.schedulerId = null;
      this.latency = 0.02;
      this.calibration = (this.settings.offset || 0) / 1000;
      this.paused = false;
      this.muted = false;
      this.userMuted = false;
      this._masterTarget = 0.7;
      this.bar = 0;
      this.barChordKey = 'am7';
      this.barChord = CHORDS.am7;
      this._pendingCrash = false;
      this._lastSfx = Object.create(null);
      this._spec = null;

      this._silentBase = performance.now() / 1000;
      this._silentPauseStart = 0;
      this._silentPauseAccum = 0;
    }

    // ── clock ─────────────────────────────────────────────────
    now() {
      if (this.ready && this.ctx) return this.ctx.currentTime;
      if (this.paused) return this._silentPauseStart - this._silentBase - this._silentPauseAccum;
      return performance.now() / 1000 - this._silentBase - this._silentPauseAccum;
    }

    /** Audible beat position (latency + user calibration compensated). */
    beat() {
      const audible = (this.latency + this.calibration) / this.beatDur;
      return (this.now() - this.startTime) / this.beatDur - audible;
    }

    rawBeat() {
      return (this.now() - this.startTime) / this.beatDur;
    }

    // ── boot ──────────────────────────────────────────────────
    init() {
      if (this.ready) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return Promise.resolve(true);
      }
      if (this.readyPromise) return this.readyPromise;

      this.readyPromise = (async () => {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) throw new Error('WebAudio is not available');
          this.ctx = new AC({ latencyHint: 'interactive' });
          if (this.ctx.state === 'suspended') await this.ctx.resume();
          this._buildGraph();
          this.latency = this.ctx.outputLatency || this.ctx.baseLatency || 0.018;
          this.startTime = this.ctx.currentTime + 0.12;
          this.nextStep = 0;
          this.nextStepTime = this.startTime;
          this.ready = true;
          this.paused = false;
          this.setVolumes(this.settings);
          this.schedulerId = setInterval(() => this._scheduler(), 25);
          // Give the menu time to start before anyone expects a beat.
          return true;
        } catch (err) {
          this.failed = true;
          this.ready = false;
          console.warn('[PULSE//RIFT] Audio unavailable — running silent.', err);
          return false;
        }
      })();
      return this.readyPromise;
    }

    _buildGraph() {
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0.8;

      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -13;
      this.limiter.knee.value = 16;
      this.limiter.ratio.value = 10;
      this.limiter.attack.value = 0.004;
      this.limiter.release.value = 0.2;

      this.master.connect(this.limiter);
      this.limiter.connect(ctx.destination);

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.limiter.connect(this.analyser);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.72;
      this.sfxBus.connect(this.master);

      // sidechain duck
      this.duckBus = ctx.createGain();
      this.duckBus.gain.value = 1;
      this.duckBus.connect(this.musicBus);

      // instrument groups
      this.padGroup = ctx.createGain(); this.padGroup.gain.value = 1;
      this.arpGroup = ctx.createGain(); this.arpGroup.gain.value = 0.9;
      this.bassGroup = ctx.createGain(); this.bassGroup.gain.value = 1;
      this.leadGroup = ctx.createGain(); this.leadGroup.gain.value = 0.85;
      this.drumGroup = ctx.createGain(); this.drumGroup.gain.value = 0.9;
      this.padGroup.connect(this.duckBus);
      this.arpGroup.connect(this.duckBus);
      this.bassGroup.connect(this.duckBus);
      this.leadGroup.connect(this.duckBus);
      this.drumGroup.connect(this.musicBus);

      // reverb
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._makeImpulse(2.4, 2.7);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.5;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.musicBus);
      this.reverbSfxSend = ctx.createGain();
      this.reverbSfxSend.gain.value = 0.4;
      this.reverbSfxSend.connect(this.reverb);

      // dotted-eighth delay
      this.delay = ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.375;
      this.delayFeedback = ctx.createGain();
      this.delayFeedback.gain.value = 0.33;
      this.delayFilter = ctx.createBiquadFilter();
      this.delayFilter.type = 'lowpass';
      this.delayFilter.frequency.value = 2400;
      this.delayWet = ctx.createGain();
      this.delayWet.gain.value = 0.5;
      this.delaySend = ctx.createGain();
      this.delaySend.gain.value = 1;
      this.delaySend.connect(this.delay);
      this.delay.connect(this.delayFilter);
      this.delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delay);
      this.delayFilter.connect(this.delayWet);
      this.delayWet.connect(this.musicBus);

      // shared sends
      this._send(this.padGroup, this.reverbSend, 0.36);
      this._send(this.arpGroup, this.delaySend, 0.24);
      this._send(this.arpGroup, this.reverbSend, 0.16);
      this._send(this.leadGroup, this.delaySend, 0.3);
      this._send(this.leadGroup, this.reverbSend, 0.28);

      // noise + impulse buffers
      const rate = ctx.sampleRate;
      const nLen = rate * 2;
      this.noiseBuffer = ctx.createBuffer(1, nLen, rate);
      const nd = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;

      this._spec = new Uint8Array(this.analyser.frequencyBinCount);
    }

    _send(source, dest, amount) {
      const g = this.ctx.createGain();
      g.gain.value = amount;
      source.connect(g);
      g.connect(dest);
      return g;
    }

    _makeImpulse(seconds, decay) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const impulse = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        }
      }
      return impulse;
    }

    setVolumes(settings) {
      this.settings = settings;
      this.calibration = (settings.offset || 0) / 1000;
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const master = clamp((settings.master ?? 80) / 100, 0, 1);
      const music = clamp((settings.music ?? 70) / 100, 0, 1);
      const sfx = clamp((settings.sfx ?? 80) / 100, 0, 1);
      this._masterTarget = Math.pow(master, 1.55);
      this.master.gain.setTargetAtTime(this.userMuted ? 0 : this._masterTarget, now, 0.03);
      this.musicBus.gain.setTargetAtTime(0.58 * music, now, 0.03);
      this.sfxBus.gain.setTargetAtTime(0.78 * sfx, now, 0.03);
      this.muted = master <= 0.001 || this.userMuted;
    }

    setMuted(muted) {
      this.userMuted = !!muted;
      this.muted = this.userMuted || (this.settings.master ?? 80) <= 0.1;
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.userMuted ? 0 : this._masterTarget, now, 0.05);
    }

    toggleMute() {
      this.setMuted(!this.userMuted);
      return this.userMuted;
    }

    setMode(mode) {
      if (this.mode === mode) return;
      this.mode = mode;
      if (mode === 'run' || mode === 'boss') this._pendingCrash = true;
    }

    setEnergy(value) { this.energy = clamp(value, 0, 1); }
    setWave(wave) { this.wave = wave; }
    setOverdrive(on) { this.overdrive = !!on; }
    setTracks(tracks) { this.tracks = tracks || { drive: 0, arp: 0, pad: 0, perc: 0 }; }
    setCalibration(ms) { this.calibration = (ms || 0) / 1000; }

    // ── pause / resume ────────────────────────────────────────
    pause() {
      this.paused = true;
      if (!this.ready) { this._silentPauseStart = performance.now() / 1000; return; }
      try { this.ctx.suspend(); } catch (e) { /* ignore */ }
    }

    resume() {
      if (!this.ready) {
        if (this.paused) this._silentPauseAccum += performance.now() / 1000 - this._silentPauseStart;
        this.paused = false;
        return;
      }
      if (!this.paused && this.ctx.state === 'running') return;
      this.paused = false;
      const p = this.ctx.resume();
      if (p && p.then) {
        p.then(() => {
          // Skip past steps that elapsed while suspended so nothing bursts.
          const now = this.ctx.currentTime;
          let guard = 0;
          while (this.nextStepTime < now - 0.04 && guard++ < 400) {
            this.nextStep++;
            this.nextStepTime = this.startTime + this.nextStep * this.stepDur;
          }
        }).catch(() => {});
      }
    }

    // ── scheduler ─────────────────────────────────────────────
    _scheduler() {
      if (!this.ready || !this.ctx || this.paused) return;
      if (this.ctx.state !== 'running') return;
      const horizon = this.ctx.currentTime + 0.14;
      // recover from a long stall
      if (this.nextStepTime < this.ctx.currentTime - 0.35) {
        let guard = 0;
        while (this.nextStepTime < this.ctx.currentTime - 0.1 && guard++ < 1000) {
          this.nextStep++;
          this.nextStepTime = this.startTime + this.nextStep * this.stepDur;
        }
      }
      let safety = 0;
      while (this.nextStepTime < horizon && safety++ < 64) {
        this._scheduleStep(this.nextStep, this.nextStepTime);
        this.nextStep++;
        this.nextStepTime = this.startTime + this.nextStep * this.stepDur;
      }
    }

    _scheduleStep(step, t) {
      const stepInBar = mod(step, 16);
      const bar = Math.floor(step / 16);
      const mode = this.mode;

      if (stepInBar === 0) {
        const prog = PROGS[mode] || PROGS.run;
        this.bar = bar;
        this.barChordKey = prog[mod(bar, prog.length)];
        this.barChord = CHORDS[this.barChordKey] || CHORDS.am7;
        this._schedulePad(t, this.barChord);
        if (this._pendingCrash) {
          this.crash(t, mode === 'boss' ? 0.7 : 0.5);
          this._pendingCrash = false;
        }
        if (mode !== 'gameover' && bar % 8 === 0) this.crash(t, 0.28);
      }

      const chord = this.barChord;
      const e = mode === 'menu' ? 0.36 : mode === 'victory' ? 0.55 : mode === 'gameover' ? 0.14 : clamp(this.energy, 0.15, 1);
      const menu = mode === 'menu';
      const dead = mode === 'gameover';
      const boss = mode === 'boss';
      const drive = this.tracks.drive > 0 || (mode === 'run' && this.wave >= 6) || boss;

      if (dead) {
        // sparse heartbeat + distant arp only
        if (stepInBar === 0 || stepInBar === 8) this._kick(t, 0.24);
        if (stepInBar % 8 === 4) this._arp(t, chord.arp[(bar + 2) % chord.arp.length] + 12, 0.35);
        return;
      }

      // ── drums ──
      if (mode !== 'menu' || stepInBar % 4 === 0) {
        if (stepInBar % 4 === 0) this._kick(t, (menu ? 0.36 : boss ? 0.95 : 0.82) + (e > 0.8 ? 0.06 : 0));
      }
      if (!menu && (stepInBar === 4 || stepInBar === 12) && e > 0.3) {
        this._snare(t, boss ? 0.16 : 0.13);
      }
      if (menu && stepInBar === 12) this._snare(t, 0.045);
      const hatStep = menu ? stepInBar % 8 === 4 : stepInBar % 2 === 0;
      if (hatStep) {
        const open = stepInBar === 14 && (boss || e > 0.55);
        this._hat(t, (stepInBar % 4 === 2 ? 0.045 : 0.028) * (0.7 + e * 0.6), open);
      }
      if ((this.tracks.perc > 0 || this.wave >= 4 || boss) && !menu) {
        const v = stepInBar % 4 === 0 ? 0.02 : stepInBar % 2 === 0 ? 0.012 : 0.006;
        this._shaker(t, v * (0.6 + e));
      }
      if (!menu && bar % 4 === 3 && stepInBar >= 12 && e > 0.6) {
        this._snare(t, 0.05 + (stepInBar - 12) * 0.025);
      }
      if ((boss || this.overdrive) && stepInBar % 2 === 0 && e > 0.7) {
        this._hat(t, 0.012, false, 0.35);
      }

      // ── bass ──
      if (stepInBar % 2 === 0) {
        const idx = stepInBar / 2;
        const off = BASS_PATTERN[idx % BASS_PATTERN.length];
        const midi = chord.root + off;
        const accent = stepInBar % 4 === 0 ? 1 : 0.68;
        this._bass(t, midi, this.stepDur * 1.7, (menu ? 0.13 : 0.17) * accent * (dead ? 0.5 : 1), drive);
        if (stepInBar === 0 && !menu) this._sub(t, midi - 12, 0.3, 0.15);
      }

      // ── arpeggio ──
      const arpEvery = menu ? 4 : 2;
      if (stepInBar % arpEvery === 0) {
        const noteIdx = (stepInBar / 2 + bar * 3) | 0;
        let note = chord.arp[noteIdx % chord.arp.length];
        if (e > 0.75 && (stepInBar % 8 === 6)) note += 12;
        const vol = (menu ? 0.03 : 0.036) * (0.65 + e * 0.5) * (this.overdrive ? 1.25 : 1);
        this._arp(t, note, vol);
        if (this.tracks.arp > 0 && stepInBar % 4 === 2) {
          this._arp(t, note + (this.tracks.arp > 1 ? 7 : 3), vol * 0.55);
        }
        if (this.overdrive) this._arp(t, note + 12, vol * 0.35);
      }

      // ── lead ──
      const leadOn = boss || this.wave >= 7 || this.tracks.pad > 0 || this.overdrive;
      if (leadOn && stepInBar % 8 === (bar % 2 === 0 ? 0 : 6) && e > 0.45) {
        const notes = chord.arp;
        const note = notes[(bar * 2 + (stepInBar === 0 ? 1 : 3)) % notes.length];
        this._lead(t, note + (boss ? 0 : 12), boss ? 0.055 : 0.04);
      }
    }

    // ── instruments ───────────────────────────────────────────
    _kick(t, velocity = 0.8) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(175, t);
      osc.frequency.exponentialRampToValueAtTime(46, t + 0.105);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(velocity, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain);
      gain.connect(this.drumGroup);
      osc.start(t);
      osc.stop(t + 0.32);

      // transient click
      const click = this._noise(t, 0.025);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(velocity * 0.3, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      click.connect(hp);
      hp.connect(cg);
      cg.connect(this.drumGroup);

      // sidechain pump
      this.duckBus.gain.cancelScheduledValues(t);
      this.duckBus.gain.setValueAtTime(0.58, t);
      this.duckBus.gain.linearRampToValueAtTime(1, t + 0.17);
    }

    _snare(t, velocity = 0.12) {
      const ctx = this.ctx;
      const noise = this._noise(t, 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1750;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(velocity, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      noise.connect(bp);
      bp.connect(g);
      g.connect(this.drumGroup);
      this._send(g, this.reverbSend, 0.1);

      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(190, t);
      body.frequency.exponentialRampToValueAtTime(130, t + 0.07);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(velocity * 0.55, t + 0.005);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      body.connect(bg);
      bg.connect(this.drumGroup);
      body.start(t);
      body.stop(t + 0.1);
    }

    _hat(t, velocity = 0.03, open = false, pan = null) {
      const ctx = this.ctx;
      const dur = open ? 0.2 : 0.045;
      const noise = this._noise(t, dur + 0.02);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = open ? 7000 : 8500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(velocity, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noise.connect(hp);
      hp.connect(g);
      if (pan !== null) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(this.drumGroup);
      } else {
        g.connect(this.drumGroup);
      }
    }

    _shaker(t, velocity) {
      const ctx = this.ctx;
      const noise = this._noise(t, 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 6800;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      const p = ctx.createStereoPanner();
      p.pan.value = rand(-0.4, 0.4);
      noise.connect(bp);
      bp.connect(g);
      g.connect(p);
      p.connect(this.drumGroup);
    }

    _bass(t, midi, dur, velocity, drive) {
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 6.5;
      filter.frequency.setValueAtTime(340 + this.energy * 1000, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + dur * 0.85);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(velocity, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = freq;
      o2.detune.value = 8;
      o1.connect(filter);
      o2.connect(filter);
      if (drive) {
        const o3 = ctx.createOscillator();
        o3.type = 'square';
        o3.frequency.value = freq * 2;
        const dg = ctx.createGain();
        dg.gain.value = 0.18;
        o3.connect(dg);
        dg.connect(filter);
        o3.start(t);
        o3.stop(t + dur + 0.03);
      }
      filter.connect(g);
      g.connect(this.bassGroup);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.03); o2.stop(t + dur + 0.03);
    }

    _sub(t, midi, dur, velocity) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiToFreq(midi);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(velocity, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.bassGroup);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    _schedulePad(t, chord) {
      const ctx = this.ctx;
      const barDur = PR.STEP_DURATION * 16;
      const base = this.mode === 'menu' ? 0.86 : this.mode === 'gameover' ? 0.5 : this.mode === 'victory' ? 1 : 0.78;
      const panPositions = [-0.42, -0.14, 0.14, 0.42];
      const cutoff = 620 + this.energy * 950 + (this.mode === 'boss' ? 260 : 0);

      chord.pad.forEach((note, i) => {
        const freq = midiToFreq(note);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.55;
        const g = ctx.createGain();
        const peak = 0.036 * base * (this.tracks.pad > 0 ? 1.15 : 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.3);
        g.gain.setValueAtTime(peak, t + barDur - 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + barDur + 0.35);
        const p = ctx.createStereoPanner();
        p.pan.value = panPositions[i % panPositions.length];
        for (const detune of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = freq;
          o.detune.value = detune + rand(-2, 2);
          o.connect(filter);
          o.start(t);
          o.stop(t + barDur + 0.38);
        }
        filter.connect(g);
        g.connect(p);
        p.connect(this.padGroup);
      });

      // high shimmer, unlocked by pad-track upgrades or intensity
      if (this.tracks.pad > 0 || this.energy > 0.8) {
        const highNote = chord.pad[chord.pad.length - 1] + 12;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = midiToFreq(highNote);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.014, t + 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + barDur + 0.2);
        o.connect(g);
        g.connect(this.padGroup);
        o.start(t);
        o.stop(t + barDur + 0.22);
      }
    }

    _arp(t, midi, velocity) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = midiToFreq(midi);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000 + this.energy * 2200, t);
      filter.frequency.exponentialRampToValueAtTime(900, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(filter);
      filter.connect(g);
      g.connect(this.arpGroup);
      o.start(t);
      o.stop(t + 0.16);
    }

    _lead(t, midi, velocity) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(midi);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = midiToFreq(midi);
      o2.detune.value = -6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 7;
      lfo.connect(lfoGain);
      lfoGain.connect(o.detune);
      lfoGain.connect(o2.detune);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(velocity, t + 0.06);
      g.gain.setValueAtTime(velocity, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      o.connect(filter);
      o2.connect(filter);
      filter.connect(g);
      g.connect(this.leadGroup);
      o.start(t); o2.start(t); lfo.start(t);
      o.stop(t + 1); o2.stop(t + 1); lfo.stop(t + 1);
    }

    _noise(t, dur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.start(t);
      src.stop(t + dur + 0.02);
      return src;
    }

    crash(t, velocity = 0.4) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const noise = this._noise(t, 1.4);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity * 0.24), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      noise.connect(hp);
      hp.connect(g);
      g.connect(this.drumGroup);
      this._send(g, this.reverbSend, 0.25);
    }

    // ── SFX ───────────────────────────────────────────────────
    _now() {
      return this.ready && this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : null;
    }

    _rate(key, gap) {
      const t = this._now();
      if (t === null) return null;
      if (this._lastSfx[key] !== undefined && t - this._lastSfx[key] < gap) return null;
      this._lastSfx[key] = t;
      return t;
    }

    _sfxNote(freq, t, opts = {}) {
      const ctx = this.ctx;
      const type = opts.type || 'triangle';
      const dur = opts.dur || 0.2;
      const vol = opts.vol || 0.08;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (opts.glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.glide), t + dur);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.cutoff || 6000, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (opts.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f);
      f.connect(g);
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan || 0;
      g.connect(p);
      p.connect(this.sfxBus);
      if (opts.reverb) this._send(p, this.reverbSfxSend, opts.reverb);
      if (opts.delay) this._send(p, this.delaySend, opts.delay);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    _sfxNoise(t, opts = {}) {
      const ctx = this.ctx;
      const dur = opts.dur || 0.12;
      const noise = this._noise(t, dur);
      const f = ctx.createBiquadFilter();
      if (opts.band) {
        f.type = 'bandpass';
        f.frequency.value = opts.freq || 1500;
        f.Q.value = opts.q || 1;
      } else if (opts.low) {
        f.type = 'lowpass';
        f.frequency.setValueAtTime(opts.freq || 1200, t);
        if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
      } else {
        f.type = 'highpass';
        f.frequency.value = opts.freq || 2000;
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.vol || 0.05), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noise.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      if (opts.reverb) this._send(g, this.reverbSfxSend, opts.reverb);
      return g;
    }

    shoot(quality, index = 0) {
      const t = this._now();
      if (t === null) return;
      const chord = this.barChord || CHORDS.am7;
      const notes = chord.arp;
      if (quality === 'perfect') {
        const midi = notes[(index * 2 + (this.bar % 3)) % notes.length] + (index % 5 === 4 ? 12 : 0);
        const freq = midiToFreq(midi);
        this._sfxNote(freq, t, { type: 'triangle', dur: 0.2, vol: 0.075, cutoff: 7000, attack: 0.002, pan: rand(-0.22, 0.22), delay: 0.16, reverb: 0.14 });
        this._sfxNote(freq * 2, t, { type: 'sine', dur: 0.1, vol: 0.02, pan: rand(-0.3, 0.3) });
        this._sfxNote(freq / 2, t, { type: 'sine', dur: 0.12, vol: 0.035 });
      } else if (quality === 'good') {
        const midi = notes[(index + 1) % notes.length];
        this._sfxNote(midiToFreq(midi) / 2, t, { type: 'square', dur: 0.09, vol: 0.032, cutoff: 1500, pan: rand(-0.15, 0.15), delay: 0.05 });
      } else if (quality === 'auto') {
        this._sfxNote(880, t, { type: 'sine', dur: 0.045, vol: 0.017, glide: 0.72 });
      } else {
        this._sfxNoise(t, { dur: 0.055, low: true, freq: 700, sweepTo: 260, vol: 0.035 });
        this._sfxNote(105, t, { type: 'square', dur: 0.055, vol: 0.025, cutoff: 500, glide: 0.7 });
      }
    }

    hit() {
      const t = this._rate('hit', 0.035);
      if (t === null) return;
      this._sfxNoise(t, { dur: 0.035, band: true, freq: 3400, q: 1.2, vol: 0.024 });
    }

    kill() {
      const t = this._rate('kill', 0.045);
      if (t === null) return;
      this._sfxNoise(t, { dur: 0.22, low: true, freq: 3400, sweepTo: 240, vol: 0.045, reverb: 0.1 });
      this._sfxNote(rand(70, 100), t, { type: 'sine', dur: 0.16, vol: 0.04, glide: 0.5 });
    }

    graze() {
      const t = this._rate('graze', 0.055);
      if (t === null) return;
      this._sfxNote(rand(2100, 2900), t, { type: 'sine', dur: 0.035, vol: 0.011, pan: rand(-0.5, 0.5) });
    }

    dash(perfect) {
      const t = this._now();
      if (t === null) return;
      this._sfxNoise(t, { dur: perfect ? 0.28 : 0.16, band: true, freq: perfect ? 900 : 600, q: 1.4, vol: perfect ? 0.07 : 0.04, reverb: 0.12 });
      if (perfect) {
        this._sfxNote(392, t, { type: 'triangle', dur: 0.26, vol: 0.045, glide: 1.5, delay: 0.18, reverb: 0.18 });
        this._sfxNote(73, t, { type: 'sine', dur: 0.12, vol: 0.06, glide: 0.6 });
      }
    }

    pickup() {
      const t = this._now();
      if (t === null) return;
      this._sfxNote(880, t, { type: 'triangle', dur: 0.09, vol: 0.04 });
      this._sfxNote(1318.5, t + 0.075, { type: 'sine', dur: 0.16, vol: 0.035, reverb: 0.16 });
    }

    shieldBreak() {
      const t = this._now();
      if (t === null) return;
      this._sfxNoise(t, { dur: 0.3, band: true, freq: 2600, q: 1.8, vol: 0.055, reverb: 0.18 });
      this._sfxNote(1046.5, t, { type: 'sine', dur: 0.4, vol: 0.045, glide: 0.55, reverb: 0.22 });
      this._sfxNote(1568, t + 0.06, { type: 'triangle', dur: 0.3, vol: 0.03, glide: 0.7 });
    }

    syncReady() {
      const t = this._now();
      if (t === null) return;
      this._sfxNote(880, t, { type: 'sine', dur: 0.5, vol: 0.03, reverb: 0.3, delay: 0.15 });
      this._sfxNote(1174.7, t + 0.09, { type: 'sine', dur: 0.6, vol: 0.026, reverb: 0.3, delay: 0.15 });
    }

    overdriveStart() {
      const t = this._now();
      if (t === null) return;
      this.crash(t, 1.2);
      this._sfxNoise(t, { dur: 0.55, band: true, freq: 500, q: 2.5, vol: 0.07, reverb: 0.2 });
      const ctx = this.ctx;
      const r = ctx.createOscillator();
      r.type = 'sawtooth';
      r.frequency.setValueAtTime(110, t);
      r.frequency.exponentialRampToValueAtTime(880, t + 0.55);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(4200, t + 0.55);
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      r.connect(f); f.connect(g); g.connect(this.sfxBus);
      r.start(t); r.stop(t + 0.62);
      this._sfxNote(55, t, { type: 'sine', dur: 0.5, vol: 0.16, glide: 0.7 });
      const chord = this.barChord || CHORDS.am7;
      chord.pad.forEach((n, i) => {
        this._sfxNote(midiToFreq(n + 12), t + 0.32 + i * 0.035, { type: 'triangle', dur: 0.9, vol: 0.026, reverb: 0.3, delay: 0.12 });
      });
    }

    overdriveEnd() {
      const t = this._now();
      if (t === null) return;
      this._sfxNoise(t, { dur: 0.35, low: true, freq: 3000, sweepTo: 300, vol: 0.045 });
      this._sfxNote(523.25, t, { type: 'sine', dur: 0.4, vol: 0.03, reverb: 0.3, glide: 0.5 });
    }

    waveClear() {
      const t = this._now();
      if (t === null) return;
      const chord = this.barChord || CHORDS.am7;
      const root = midiToFreq(chord.pad[0] + 12);
      [1, 1.5, 2].forEach((m, i) => {
        this._sfxNote(root * m, t + i * 0.09, { type: 'sine', dur: 0.5, vol: 0.045, reverb: 0.28, delay: 0.1 });
      });
    }

    upgrade(rarity = 'common') {
      const t = this._now();
      if (t === null) return;
      const chord = this.barChord || CHORDS.am7;
      const base = chord.pad[0] + 12;
      const intervals = rarity === 'epic' ? [0, 4, 7, 11, 14] : rarity === 'rare' ? [0, 4, 7, 11] : [0, 4, 7];
      intervals.forEach((iv, i) => {
        this._sfxNote(midiToFreq(base + iv), t + i * 0.055, { type: 'triangle', dur: 0.7, vol: 0.035, reverb: 0.28, delay: 0.14 });
      });
      this._sfxNoise(t, { dur: 0.25, high: true, freq: 5000, vol: 0.015, reverb: 0.15 });
    }

    bossAlarm() {
      const t = this._now();
      if (t === null) return;
      const ctx = this.ctx;
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const tt = t + i * 0.5;
        o.frequency.setValueAtTime(150, tt);
        o.frequency.linearRampToValueAtTime(260, tt + 0.22);
        o.frequency.linearRampToValueAtTime(150, tt + 0.45);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.linearRampToValueAtTime(0.045, tt + 0.04);
        g.gain.setValueAtTime(0.045, tt + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.48);
        o.connect(f); f.connect(g); g.connect(this.sfxBus);
        o.start(tt); o.stop(tt + 0.5);
      }
      this._sfxNote(55, t, { type: 'sine', dur: 1.0, vol: 0.12, glide: 1.2, reverb: 0.2 });
    }

    hurt() {
      const t = this._now();
      if (t === null) return;
      this._sfxNote(180, t, { type: 'sawtooth', dur: 0.35, vol: 0.1, cutoff: 800, glide: 0.4, reverb: 0.1 });
      this._sfxNoise(t, { dur: 0.22, low: true, freq: 1600, sweepTo: 180, vol: 0.11 });
      this._sfxNote(60, t, { type: 'sine', dur: 0.25, vol: 0.1, glide: 0.7 });
    }

    gameOver() {
      const t = this._now();
      if (t === null) return;
      const ctx = this.ctx;
      [45, 48, 52, 57].forEach((midi, i) => {
        this._sfxNote(midiToFreq(midi), t + i * 0.03, { type: 'sawtooth', dur: 2.4, vol: 0.028, cutoff: 900, reverb: 0.4 });
      });
      this._sfxNote(55, t, { type: 'sine', dur: 1.8, vol: 0.09, glide: 0.6 });
    }

    victory() {
      const t = this._now();
      if (t === null) return;
      const notes = [65, 69, 72, 77, 81, 84];
      notes.forEach((midi, i) => {
        this._sfxNote(midiToFreq(midi), t + i * 0.11, { type: 'triangle', dur: 1.0, vol: 0.045, reverb: 0.35, delay: 0.15 });
      });
      this.crash(t, 0.9);
      this._sfxNote(65, t, { type: 'sine', dur: 1.4, vol: 0.09, glide: 1.5 });
    }

    ui() {
      const t = this._now();
      if (t === null) return;
      this._sfxNote(760, t, { type: 'square', dur: 0.04, vol: 0.012, cutoff: 2400 });
    }

    // ── spectrum ──────────────────────────────────────────────
    spectrum() {
      if (!this.ready || this.muted) return null;
      this.analyser.getByteFrequencyData(this._spec);
      return this._spec;
    }
  }

  PR.AudioEngine = AudioEngine;
  PR.CHORDS = CHORDS;
})(window.PR = window.PR || {});
