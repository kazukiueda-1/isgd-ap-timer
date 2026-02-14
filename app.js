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

// === Timer Class ===
class Timer {
  /**
   * @param {HTMLElement} card
   * @param {number} index
   * @param {boolean} allowCountUp - true: カウントアップ/ダウン切替あり
   */
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
    this._bindEvents();
    this._updateDisplay();
  }

  _bindElements() {
    this.display = this.card.querySelector('.time-display');
    this.startBtn = this.card.querySelector('.start-btn');
    this.stopBtn = this.card.querySelector('.stop-btn');
    this.resetBtn = this.card.querySelector('.reset-btn');
    this.toggleBtns = this.card.querySelectorAll('.toggle-btn');
    this.pickerArrows = this.card.querySelectorAll('.picker-arrow');
  }

  _bindEvents() {
    // Mode toggle (三段タイマー用)
    this.toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.running) return;
        this.mode = btn.dataset.mode;
        this.toggleBtns.forEach(b => b.classList.toggle('active', b === btn));
        this._updatePickerVisibility();
        this.reset();
      });
    });

    // Picker arrows
    this.pickerArrows.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.running) return;
        const unit = btn.dataset.unit;
        const dir = btn.dataset.dir === 'up' ? 1 : -1;
        this._adjustPicker(unit, dir);
      });
    });

    // Controls
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

  _updatePickerVisibility() {
    // カウントアップ時は矢印を非表示
    const hidden = this.mode === 'up';
    this.pickerArrows.forEach(btn => {
      btn.classList.toggle('hidden', hidden);
    });
  }

  _adjustPicker(unit, dir) {
    const max = unit === 'h' ? 23 : 59;
    const key = unit === 'h' ? 'setH' : unit === 'm' ? 'setM' : 'setS';
    this[key] = (this[key] + dir + max + 1) % (max + 1);
    this.targetSeconds = this.setH * 3600 + this.setM * 60 + this.setS;
    this.totalSeconds = this.targetSeconds;
    this._updateDisplay();
  }

  start() {
    alarm.init();
    if (this.running) return;

    // カウントダウンで0の場合はスタートしない
    if (this.mode === 'down' && this.totalSeconds <= 0) return;

    this.running = true;
    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;

    // 動作中は矢印を非表示
    this.pickerArrows.forEach(btn => btn.classList.add('hidden'));

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

    // 停止したら矢印を戻す（カウントアップ中でなければ）
    this._updatePickerVisibility();
  }

  reset() {
    this.stopAlarm();
    this.stop();
    if (this.mode === 'down') {
      this.totalSeconds = this.targetSeconds;
    } else {
      this.totalSeconds = 0;
    }
    this._updatePickerVisibility();
    this._updateDisplay();
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

  // 録画ボタン表示/非表示
  recArea.classList.toggle('hidden', !cfg.showRec);
  // リセット
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

    // 三段タイマーのみラベル付き
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

// Event listeners
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showTimerScreen(btn.dataset.mode);
  });
});

backBtn.addEventListener('click', showModeSelect);

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
