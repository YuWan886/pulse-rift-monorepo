/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — DOM interface: title, cards, results, modals
   ═══════════════════════════════════════════════════════════════ */
(function (PR) {
  'use strict';
  const U = PR.U;

  class UI {
    constructor(game) {
      this.game = game;
      this.cardLock = false;
      this.toastTimer = null;
      this.toastHideTimer = null;
      this.currentModal = null;
      this.el = {
        title: document.getElementById('titleScreen'),
        upgrade: document.getElementById('upgradeScreen'),
        pause: document.getElementById('pauseScreen'),
        gameover: document.getElementById('gameoverScreen'),
        victory: document.getElementById('victoryScreen'),
        cards: document.getElementById('upgradeCards'),
        upWave: document.getElementById('upWave'),
        reroll: document.getElementById('btnReroll'),
        rerollCount: document.getElementById('rerollCount'),
        audioStatus: document.getElementById('audioStatus'),
        audioStatusText: document.getElementById('audioStatusText'),
        bestScore: document.getElementById('bestScore'),
        bestWave: document.getElementById('bestWave'),
        toast: document.getElementById('toast'),
        toastText: document.getElementById('toastText'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        help: document.getElementById('helpModal'),
        settings: document.getElementById('settingsModal'),
        fxScanlines: document.getElementById('fxScanlines'),
        goGrade: document.getElementById('goGrade'),
        goWave: document.getElementById('goWave'),
        goScore: document.getElementById('goScore'),
        goRecord: document.getElementById('goRecord'),
        goStats: document.getElementById('goStats'),
        goEndless: document.getElementById('goEndless'),
        winScore: document.getElementById('winScore'),
        winRecord: document.getElementById('winRecord'),
        winGrade: document.getElementById('winGrade'),
        winStats: document.getElementById('winStats'),
        setMaster: document.getElementById('setMaster'),
        setMusic: document.getElementById('setMusic'),
        setSfx: document.getElementById('setSfx'),
        setOffset: document.getElementById('setOffset'),
        setShake: document.getElementById('setShake'),
        setFlash: document.getElementById('setFlash'),
        setScan: document.getElementById('setScan'),
        valMaster: document.getElementById('valMaster'),
        valMusic: document.getElementById('valMusic'),
        valSfx: document.getElementById('valSfx'),
        valOffset: document.getElementById('valOffset'),
        valShake: document.getElementById('valShake')
      };
      this.screens = [this.el.title, this.el.upgrade, this.el.pause, this.el.gameover, this.el.victory];
      this.bind();
      this.syncSettingsUI();
    }

    bind() {
      const g = this.game;
      document.getElementById('btnStart').addEventListener('click', () => g.startRun());
      document.getElementById('btnHow').addEventListener('click', () => this.openModal('help'));
      document.getElementById('btnSettings').addEventListener('click', () => this.openModal('settings'));
      document.getElementById('btnResume').addEventListener('click', () => g.resumeGame());
      document.getElementById('btnPauseSettings').addEventListener('click', () => this.openModal('settings'));
      document.getElementById('btnQuit').addEventListener('click', () => g.quitToTitle());
      document.getElementById('btnRetry').addEventListener('click', () => g.retry());
      document.getElementById('btnGoTitle').addEventListener('click', () => g.quitToTitle());
      document.getElementById('btnWinTitle').addEventListener('click', () => g.quitToTitle());
      document.getElementById('btnContinue').addEventListener('click', () => g.continueEndless());
      document.getElementById('btnReroll').addEventListener('click', () => g.rerollUpgrades());
      document.getElementById('btnResetSettings').addEventListener('click', () => {
        g.applySettings({ ...g.defaultSettings });
        this.syncSettingsUI();
      });

      this.el.modalBackdrop.addEventListener('click', () => this.closeModal());
      document.querySelectorAll('[data-close]').forEach((btn) => {
        btn.addEventListener('click', () => this.closeModal());
      });

      const bindRange = (input, output, key, suffix = '') => {
        if (!input) return;
        input.addEventListener('input', () => {
          const value = Number(input.value);
          if (output) output.textContent = value + suffix;
          this.applyFromUI();
        });
      };
      bindRange(this.el.setMaster, this.el.valMaster, 'master');
      bindRange(this.el.setMusic, this.el.valMusic, 'music');
      bindRange(this.el.setSfx, this.el.valSfx, 'sfx');
      bindRange(this.el.setOffset, this.el.valOffset, 'offset', 'ms');
      bindRange(this.el.setShake, this.el.valShake, 'shake', '%');
      this.el.setFlash.addEventListener('change', () => this.applyFromUI());
      this.el.setScan.addEventListener('change', () => this.applyFromUI());

      document.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('button') && g.audio && g.audio.ready) g.audio.ui();
      });
    }

    applyFromUI() {
      const settings = {
        master: Number(this.el.setMaster.value),
        music: Number(this.el.setMusic.value),
        sfx: Number(this.el.setSfx.value),
        offset: Number(this.el.setOffset.value),
        shake: Number(this.el.setShake.value),
        flashes: this.el.setFlash.checked,
        scanlines: this.el.setScan.checked
      };
      this.el.valMaster.textContent = settings.master;
      this.el.valMusic.textContent = settings.music;
      this.el.valSfx.textContent = settings.sfx;
      this.el.valOffset.textContent = settings.offset + 'ms';
      this.el.valShake.textContent = settings.shake + '%';
      this.game.applySettings(settings);
    }

    syncSettingsUI() {
      const s = this.game.settings;
      this.el.setMaster.value = s.master;
      this.el.setMusic.value = s.music;
      this.el.setSfx.value = s.sfx;
      this.el.setOffset.value = s.offset;
      this.el.setShake.value = s.shake;
      this.el.setFlash.checked = !!s.flashes;
      this.el.setScan.checked = !!s.scanlines;
      this.el.valMaster.textContent = s.master;
      this.el.valMusic.textContent = s.music;
      this.el.valSfx.textContent = s.sfx;
      this.el.valOffset.textContent = s.offset + 'ms';
      this.el.valShake.textContent = s.shake + '%';
      this.el.fxScanlines.classList.toggle('off', !s.scanlines);
      document.body.classList.toggle('no-flash', !s.flashes);
    }

    // ── screen helpers ───────────────────────────────────────
    hideAllScreens() { this.screens.forEach((s) => s.classList.add('hidden')); }

    showTitle(best) {
      this.hideAllScreens();
      if (best) this.updateBest(best);
      this.el.title.classList.remove('hidden');
      this.setPlaying(false);
      this.closeModal();
    }

    beginRun() {
      this.closeModal();
      this.hideAllScreens();
      this.setPlaying(true);
    }

    setPlaying(on) {
      document.body.classList.toggle('playing', !!on);
    }

    updateBest(best) {
      this.el.bestScore.textContent = U.formatScore(best.score || 0);
      this.el.bestWave.textContent = best.wave || 0;
    }

    setAudioStatus(state) {
      // state: 'offline' | 'live' | 'failed'
      this.el.audioStatus.classList.toggle('live', state === 'live');
      if (state === 'live') {
        this.el.audioStatusText.textContent = 'AUDIO ONLINE · 120 BPM · 生成式配乐';
      } else if (state === 'failed') {
        this.el.audioStatusText.textContent = 'AUDIO UNAVAILABLE · 视觉节拍模式';
      } else {
        this.el.audioStatusText.textContent = 'AUDIO OFFLINE · 点击任意处接入声场';
      }
    }

    // ── upgrades ─────────────────────────────────────────────
    showUpgrade(cards, counts, wave, rerolls) {
      this.cardLock = false;
      this.hideAllScreens();
      this.el.upgrade.classList.remove('hidden');
      this.el.upWave.textContent = wave;
      this.renderCards(cards, counts);
      this.setReroll(rerolls);
      this.setPlaying(false);
    }

    renderCards(cards, counts) {
      const wrap = this.el.cards;
      wrap.innerHTML = '';
      cards.forEach((card, index) => {
        const accent = PR.CAT_COLORS[card.cat];
        const current = counts[card.id] || 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'upgrade-card';
        btn.style.setProperty('--accent', accent);
        btn.style.setProperty('--accent-soft', U.withAlpha(accent, 0.26));
        btn.style.setProperty('--i', index);
        btn.dataset.index = index;
        btn.setAttribute('aria-label', `${card.name} ${card.cn}: ${card.desc}`);

        const top = document.createElement('div');
        top.className = 'card-top';
        const cat = document.createElement('span');
        cat.className = 'card-cat';
        cat.textContent = `${card.cat} · ${PR.CAT_CN[card.cat]}`;
        const rarity = document.createElement('span');
        rarity.className = `card-rarity ${card.rarity}`;
        rarity.textContent = PR.RARITY_CN[card.rarity];
        top.append(cat, rarity);

        const glyph = document.createElement('div');
        glyph.className = 'card-glyph';
        glyph.textContent = card.glyph;

        const titleEn = document.createElement('div');
        titleEn.className = 'card-title-en';
        titleEn.textContent = card.name;
        const titleCn = document.createElement('div');
        titleCn.className = 'card-title-cn';
        titleCn.textContent = card.cn;
        const desc = document.createElement('p');
        desc.className = 'card-desc';
        desc.textContent = card.desc;

        const wave = document.createElement('div');
        wave.className = 'card-wave';
        for (let w = 0; w < 14; w++) {
          const bar = document.createElement('span');
          bar.style.height = (24 + ((w * 29 + card.glyph.charCodeAt(0)) % 72)) + '%';
          bar.style.animationDelay = (-w * 0.12) + 's';
          bar.style.animationDuration = (1.4 + (w % 4) * 0.22) + 's';
          wave.appendChild(bar);
        }

        const footer = document.createElement('div');
        footer.className = 'card-footer';
        const level = document.createElement('div');
        level.className = 'card-level';
        const label = document.createElement('span');
        label.textContent = current > 0 ? `LV.${current} → ${current + 1}` : `NEW · LV.1`;
        level.appendChild(label);
        if (card.max <= 5) {
          for (let i = 0; i < card.max; i++) {
            const pip = document.createElement('span');
            pip.className = 'level-pip' + (i < current ? ' on' : '');
            level.appendChild(pip);
          }
        }
        const music = document.createElement('span');
        music.className = 'card-music';
        music.textContent = `♪ ${PR.CAT_TRACK[card.cat]}`;
        footer.append(level, music);

        btn.append(top, glyph, titleEn, titleCn, desc, wave, footer);
        btn.addEventListener('click', () => this.selectCard(index));
        wrap.appendChild(btn);
      });
    }

    selectCard(index) {
      if (this.cardLock) return;
      const card = this.el.cards.querySelector(`[data-index="${index}"]`);
      if (!card) return;
      this.cardLock = true;
      card.classList.add('picked');
      this.el.cards.querySelectorAll('.upgrade-card').forEach((c) => { c.disabled = true; });
      setTimeout(() => {
        this.game.chooseUpgrade(index);
        this.cardLock = false;
      }, 240);
    }

    hideUpgrade() {
      this.el.upgrade.classList.add('hidden');
      this.cardLock = false;
    }

    setReroll(n) {
      this.el.rerollCount.textContent = n;
      this.el.reroll.disabled = n <= 0;
    }

    // ── pause / results ──────────────────────────────────────
    showPause() {
      this.el.pause.classList.remove('hidden');
      this.setPlaying(false);
    }

    hidePause() {
      this.el.pause.classList.add('hidden');
      this.setPlaying(true);
    }

    showGameOver(data) {
      this.hideAllScreens();
      this.el.gameover.classList.remove('hidden');
      this.setPlaying(false);
      this.el.goWave.textContent = data.wave;
      this.el.goScore.textContent = U.formatScore(data.score);
      this.el.goRecord.classList.toggle('hidden', !data.isRecord);
      this.el.goEndless.textContent = data.endless ? ' · 无尽回廊深处' : '';
      this.setGrade(this.el.goGrade, data.grade);
      this.renderStats(this.el.goStats, data.stats);
      requestAnimationFrame(() => this.el.gameover.classList.remove('hidden'));
    }

    showVictory(data) {
      this.hideAllScreens();
      this.el.victory.classList.remove('hidden');
      this.setPlaying(false);
      this.el.winScore.textContent = U.formatScore(data.score);
      this.el.winRecord.classList.toggle('hidden', !data.isRecord);
      this.setGrade(this.el.winGrade, data.grade);
      this.el.winGrade.classList.add('small');
      this.renderStats(this.el.winStats, data.stats);
    }

    setGrade(el, grade) {
      const colors = { S: '#ffd166', A: '#37f5ff', B: '#5dffa8', C: '#9db5c4', D: '#ff4e64' };
      const color = colors[grade] || colors.C;
      el.textContent = grade;
      el.style.color = color;
      el.style.borderColor = U.withAlpha(color, 0.5);
      el.style.background = `radial-gradient(circle at 50% 35%, ${U.withAlpha(color, 0.17)}, transparent 70%)`;
      el.style.boxShadow = `0 0 46px ${U.withAlpha(color, 0.12)}`;
    }

    renderStats(container, stats) {
      container.innerHTML = '';
      stats.forEach(([label, value]) => {
        const cell = document.createElement('div');
        cell.className = 'stat-cell';
        const l = document.createElement('span');
        l.textContent = label;
        const v = document.createElement('b');
        v.textContent = value;
        cell.append(l, v);
        container.appendChild(cell);
      });
    }

    // ── modals ───────────────────────────────────────────────
    openModal(name) {
      this.closeModal(false);
      const modal = name === 'help' ? this.el.help : this.el.settings;
      this.currentModal = name;
      this.el.modalBackdrop.classList.remove('hidden');
      modal.classList.remove('hidden');
      if (name === 'settings') this.syncSettingsUI();
      const close = modal.querySelector('.modal-close');
      if (close) close.focus({ preventScroll: true });
    }

    closeModal(force = true) {
      if (!this.currentModal) {
        this.el.modalBackdrop.classList.add('hidden');
        this.el.help.classList.add('hidden');
        this.el.settings.classList.add('hidden');
        return;
      }
      this.el.modalBackdrop.classList.add('hidden');
      this.el.help.classList.add('hidden');
      this.el.settings.classList.add('hidden');
      this.currentModal = null;
      if (force) {
        const btn = document.getElementById(this.game.state === 'paused' ? 'btnPauseSettings' : 'btnSettings');
        if (btn) btn.focus({ preventScroll: true });
      }
    }

    handleKey(e) {
      if (this.currentModal) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          if (e.key === 'Escape') this.closeModal();
          return true;
        }
        return true;
      }
      if (!this.el.upgrade.classList.contains('hidden')) {
        if (e.key === '1' || e.key === '2' || e.key === '3') {
          this.selectCard(Number(e.key) - 1);
          return true;
        }
        if (e.key.toLowerCase() === 'r') {
          this.game.rerollUpgrades();
          return true;
        }
      }
      return false;
    }

    // ── toast ────────────────────────────────────────────────
    toast(text, duration = 4200) {
      const el = this.el.toast;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      if (this.toastHideTimer) clearTimeout(this.toastHideTimer);
      el.classList.remove('hidden', 'leaving');
      this.el.toastText.textContent = text;
      // force animation restart
      void el.offsetWidth;
      this.toastTimer = setTimeout(() => {
        el.classList.add('leaving');
        this.toastHideTimer = setTimeout(() => el.classList.add('hidden'), 320);
      }, duration);
    }

    hideToast() {
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.el.toast.classList.add('hidden');
    }
  }

  PR.UI = UI;
})(window.PR = window.PR || {});
