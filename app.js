'use strict';

// === Alarm Sound ===
class AlarmSound {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.oscillators = [];
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play() {
    this.init();
    if (this.playing) return;
    this.playing = true;
    this._beepLoop();
  }

  _beepLoop() {
    if (!this.playing) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
    this.oscillators.push(osc);
    osc.onended = () => {
      this.oscillators = this.oscillators.filter(o => o !== osc);
      if (this.playing) {
        setTimeout(() => this._beepLoop(), 200);
      }
    };
  }

  stop() {
    this.playing = false;
    this.oscillators.forEach(o => {
      try { o.stop(); } catch (_) {}
    });
    this.oscillators = [];
  }
}

const alarm = new AlarmSound();

// === Drum Picker (ドラムロール式スクロールピッカー) ===
class DrumPicker {
  constructor(container, max, onChange) {
    this.container = container;
    this.max = max; // 23 or 59
    this.onChange = onChange;
    this.value = 0;
    this.itemH = 40; // --item-h

    this.viewport = container.querySelector('.drum-viewport');
    this.track = container.querySelector('.drum-track');

    this._buildItems();
    this._bindTouch();
    this.scrollToValue(0, false);
  }

  _buildItems() {
    this.track.innerHTML = '';
    for (let i = 0; i <= this.max; i++) {
      const el = document.createElement('div');
      el.className = 'drum-item';
      el.textContent = String(i).padStart(2, '0');
      el.dataset.val = i;
      this.track.appendChild(el);
    }
    this.items = this.track.querySelectorAll('.drum-item');
  }

  // ビューポートの表示行数を取得
  get visibleCount() {
    const vpH = this.viewport.offsetHeight;
    return Math.round(vpH / this.itemH);
  }

  // 中央にスナップするためのオフセット
  get centerOffset() {
    return Math.floor(this.visibleCount / 2) * this.itemH;
  }

  scrollToValue(val, animate) {
    this.value = val;
    const y = -(val * this.itemH) + this.centerOffset;

    this.track.classList.remove('dragging', 'snapping');
    if (animate) {
      this.track.classList.add('snapping');
    }
    this.track.style.transform = `translateY(${y}px)`;
    this._updateSelected();
    this.onChange(this.value);
  }

  _updateSelected() {
    this.items.forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.val) === this.value);
    });
  }

  _bindTouch() {
    let startY = 0;
    let startTranslate = 0;
    let isDragging = false;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    const getTranslateY = () => {
      const m = this.track.style.transform.match(/translateY\((.+?)px\)/);
      return m ? parseFloat(m[1]) : 0;
    };

    const clamp = (y) => {
      const minY = -(this.max * this.itemH) + this.centerOffset;
      const maxY = this.centerOffset;
      return Math.max(minY, Math.min(maxY, y));
    };

    const snapToNearest = (y) => {
      const raw = -(y - this.centerOffset) / this.itemH;
      const snapped = Math.round(Math.max(0, Math.min(this.max, raw)));
      this.scrollToValue(snapped, true);
    };

    // Touch events
    this.viewport.addEventListener('touchstart', (e) => {
      isDragging = true;
      startY = e.touches[0].clientY;
      startTranslate = getTranslateY();
      lastY = startY;
      lastTime = Date.now();
      velocity = 0;
      this.track.classList.remove('snapping');
      this.track.classList.add('dragging');
      e.preventDefault();
    }, { passive: false });

    this.viewport.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const curY = e.touches[0].clientY;
      const delta = curY - startY;
      const now = Date.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocity = (curY - lastY) / dt;
      }
      lastY = curY;
      lastTime = now;
      const newY = clamp(startTranslate + delta);
      this.track.style.transform = `translateY(${newY}px)`;
      e.preventDefault();
    }, { passive: false });

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      this.track.classList.remove('dragging');

      // 慣性スクロール
      let currentY = getTranslateY();
      const momentum = velocity * 120; // 慣性距離
      const targetY = clamp(currentY + momentum);
      snapToNearest(targetY);
    };

    this.viewport.addEventListener('touchend', onEnd);
    this.viewport.addEventListener('touchcancel', onEnd);

    // Mouse events (PC対応)
    this.viewport.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startTranslate = getTranslateY();
      lastY = startY;
      lastTime = Date.now();
      velocity = 0;
      this.track.classList.remove('snapping');
      this.track.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const curY = e.clientY;
      const delta = curY - startY;
      const now = Date.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocity = (curY - lastY) / dt;
      }
      lastY = curY;
      lastTime = now;
      const newY = clamp(startTranslate + delta);
      this.track.style.transform = `translateY(${newY}px)`;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) onEnd();
    });
  }
}

// === Timer Class ===
class Timer {
  constructor(card, index, allowCountUp) {
    this.card = card;
    this.index = index;
    this.allowCountUp = allowCountUp;
    this.mode = 'down';
    this.running = false;
    this.intervalId = null;
    this.totalSeconds = 0;
    this.targetSeconds = 0;

    this.setH = 0;
    this.setM = 0;
    this.setS = 0;

    this._bindElements();
    this._initPickers();
    this._bindEvents();
  }

  _bindElements() {
    this.display = this.card.querySelector('.time-display');
    this.pickerArea = this.card.querySelector('.picker-area');
    this.startBtn = this.card.querySelector('.start-btn');
    this.stopBtn = this.card.querySelector('.stop-btn');
    this.resetBtn = this.card.querySelector('.reset-btn');
    this.toggleBtns = this.card.querySelectorAll('.toggle-btn');
  }

  _initPickers() {
    const hContainer = this.card.querySelector('.drum-picker[data-unit="h"]');
    const mContainer = this.card.querySelector('.drum-picker[data-unit="m"]');
    const sContainer = this.card.querySelector('.drum-picker[data-unit="s"]');

    this.pickerH = new DrumPicker(hContainer, 23, (v) => {
      this.setH = v;
      this._syncFromPicker();
    });
    this.pickerM = new DrumPicker(mContainer, 59, (v) => {
      this.setM = v;
      this._syncFromPicker();
    });
    this.pickerS = new DrumPicker(sContainer, 59, (v) => {
      this.setS = v;
      this._syncFromPicker();
    });
  }

  _syncFromPicker() {
    this.targetSeconds = this.setH * 3600 + this.setM * 60 + this.setS;
    this.totalSeconds = this.targetSeconds;
  }

  _bindEvents() {
    // Mode toggle (三段タイマー用)
    this.toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.running) return;
        this.mode = btn.dataset.mode;
        this.toggleBtns.forEach(b => b.classList.toggle('active', b === btn));
        this.reset();
      });
    });

    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
    this.resetBtn.addEventListener('click', () => this.reset());

    // Tap card to stop alarm
    this.card.addEventListener('click', (e) => {
      if (this.card.classList.contains('alarming') && !e.target.closest('.ctrl-btn')) {
        this.stopAlarm();
      }
    });
  }

  _showPicker() {
    this.pickerArea.classList.remove('hidden');
    this.display.classList.add('hidden');
    // ピッカーの値を復元
    this.pickerH.scrollToValue(this.setH, false);
    this.pickerM.scrollToValue(this.setM, false);
    this.pickerS.scrollToValue(this.setS, false);
  }

  _showDisplay() {
    this.pickerArea.classList.add('hidden');
    this.display.classList.remove('hidden');
  }

  start() {
    alarm.init();
    if (this.running) return;
    if (this.mode === 'down' && this.totalSeconds <= 0) return;

    this.running = true;
    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this._showDisplay();
    this._updateDisplay();

    const startTime = Date.now();
    const startSeconds = this.totalSeconds;

    this.intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      if (this.mode === 'up') {
        this.totalSeconds = startSeconds + elapsed;
      } else {
        this.totalSeconds = Math.max(0, startSeconds - elapsed);
        if (this.totalSeconds <= 0) {
          this._triggerAlarm();
          return;
        }
      }
      this._updateDisplay();
    }, 250);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
  }

  reset() {
    this.stopAlarm();
    this.stop();
    if (this.mode === 'down') {
      this.totalSeconds = this.targetSeconds;
      this._showPicker();
    } else {
      this.totalSeconds = 0;
      // カウントアップ: ピッカー非表示、表示を00:00:00
      this.pickerArea.classList.add('hidden');
      this.display.classList.remove('hidden');
      this._updateDisplay();
    }
  }

  _triggerAlarm() {
    this.stop();
    this.totalSeconds = 0;
    this._updateDisplay();
    this.card.classList.add('alarming');
    alarm.play();
  }

  stopAlarm() {
    this.card.classList.remove('alarming');
    alarm.stop();
  }

  _updateDisplay() {
    const t = this.totalSeconds;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    this.display.textContent =
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0');
  }

  destroy() {
    this.stopAlarm();
    this.stop();
  }
}

// === Mode Config ===
const MODES = {
  isgd:   { title: 'IS・GDタイマー', count: 1, template: 'countdown', showRec: true },
  ap:     { title: 'APタイマー',     count: 2, template: 'countdown', showRec: true },
  triple: { title: '三段タイマー',    count: 3, template: 'triple',    showRec: false },
};

// === App Controller ===
const modeSelect = document.getElementById('mode-select');
const timerScreen = document.getElementById('timer-screen');
const timersContainer = document.getElementById('timers-container');
const modeTitle = document.getElementById('mode-title');
const backBtn = document.getElementById('back-btn');
const recArea = document.getElementById('rec-area');
const recBtn = document.getElementById('rec-btn');
const recText = document.querySelector('#rec-btn .rec-text');

let timers = [];
let recording = false;

// 録画ボタン
recBtn.addEventListener('click', () => {
  recording = !recording;
  if (recording) {
    recBtn.classList.remove('rec-stopped');
    recBtn.classList.add('rec-recording');
    recText.textContent = '録画開始済み';
  } else {
    recBtn.classList.remove('rec-recording');
    recBtn.classList.add('rec-stopped');
    recText.textContent = '録画停止済み';
  }
});

function showTimerScreen(modeKey) {
  const cfg = MODES[modeKey];
  if (!cfg) return;

  timers.forEach(t => t.destroy());
  timers = [];
  timersContainer.innerHTML = '';
  timersContainer.dataset.count = cfg.count;
  modeTitle.textContent = cfg.title;

  // 録画ボタン
  recArea.classList.toggle('hidden', !cfg.showRec);
  recording = false;
  recBtn.classList.remove('rec-recording');
  recBtn.classList.add('rec-stopped');
  recText.textContent = '録画停止済み';

  const templateId = cfg.template === 'triple' ? 'timer-triple-template' : 'timer-countdown-template';
  const template = document.getElementById(templateId);
  const tripleLabels = ['タイマー 1', 'タイマー 2', 'タイマー 3'];

  for (let i = 0; i < cfg.count; i++) {
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.timer-card');

    if (cfg.template === 'triple') {
      card.querySelector('.timer-label').textContent = tripleLabels[i];
    }

    timersContainer.appendChild(clone);
    const insertedCard = timersContainer.lastElementChild;
    const allowCountUp = cfg.template === 'triple';
    timers.push(new Timer(insertedCard, i, allowCountUp));
  }

  modeSelect.classList.remove('active');
  timerScreen.classList.add('active');
}

function showModeSelect() {
  timers.forEach(t => t.destroy());
  timers = [];
  timersContainer.innerHTML = '';
  timerScreen.classList.remove('active');
  modeSelect.classList.add('active');
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showTimerScreen(btn.dataset.mode);
  });
});

backBtn.addEventListener('click', showModeSelect);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
