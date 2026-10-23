import { BUTTON } from './machine.js';

// On-screen controls. Each finger is tracked separately and re-hit-tested
// as it moves, so you can roll a thumb across the D-pad or from B to A.
export class TouchPad {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.pointers = new Map();
    this.mask = 0;
    this.pressedEls = new Set();

    const update = (e) => {
      if (!this.pointers.has(e.pointerId)) {
        // Only fingers that land on a control cluster are tracked, so taps
        // on the screens and toolbar keep working normally
        if (e.type !== 'pointerdown' || !e.target.closest('.cluster')) return;
      }
      e.preventDefault();
      this.pointers.set(e.pointerId, this.hitTest(e.clientX, e.clientY));
      this.refresh();
    };
    const release = (e) => {
      if (this.pointers.delete(e.pointerId)) this.refresh();
    };
    root.addEventListener('pointerdown', update);
    root.addEventListener('pointermove', update);
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('lostpointercapture', release);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  hitTest(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !this.root.contains(el)) return { mask: 0, els: [] };
    const dpad = el.closest('[data-dpad]');
    if (dpad) return { mask: dpadMask(dpad, x, y), els: [dpad] };
    const btn = el.closest('[data-btn]');
    if (btn) {
      const mask = btn.dataset.btn.split('+').reduce((m, name) => m | BUTTON[name], 0);
      return { mask, els: [btn] };
    }
    return { mask: 0, els: [] };
  }

  refresh() {
    let mask = 0;
    const els = new Set();
    for (const hit of this.pointers.values()) {
      mask |= hit.mask;
      hit.els.forEach((el) => els.add(el));
    }
    for (const el of this.pressedEls) if (!els.has(el)) el.classList.remove('pressed');
    for (const el of els) el.classList.add('pressed');
    this.pressedEls = els;
    const dpad = this.root.querySelector('[data-dpad]');
    if (dpad) {
      dpad.dataset.dir = [
        mask & BUTTON.UP ? 'up' : '', mask & BUTTON.DOWN ? 'down' : '',
        mask & BUTTON.LEFT ? 'left' : '', mask & BUTTON.RIGHT ? 'right' : '',
      ].join(' ').trim();
    }
    if (mask !== this.mask) {
      this.mask = mask;
      this.onChange();
    }
  }

  reset() {
    this.pointers.clear();
    this.refresh();
  }
}

// 8-way D-pad: split the pad into 45° sectors around its centre
function dpadMask(el, x, y) {
  const r = el.getBoundingClientRect();
  const dx = x - (r.left + r.width / 2);
  const dy = y - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.12) return 0;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const sector = Math.round(((angle + 360) % 360) / 45) % 8;
  return [
    BUTTON.RIGHT, BUTTON.RIGHT | BUTTON.DOWN, BUTTON.DOWN, BUTTON.DOWN | BUTTON.LEFT,
    BUTTON.LEFT, BUTTON.LEFT | BUTTON.UP, BUTTON.UP, BUTTON.UP | BUTTON.RIGHT,
  ][sector];
}

const KEYS = {
  ArrowUp: BUTTON.UP, ArrowDown: BUTTON.DOWN, ArrowLeft: BUTTON.LEFT, ArrowRight: BUTTON.RIGHT,
  KeyX: BUTTON.A, KeyZ: BUTTON.B, KeyA: BUTTON.L, KeyS: BUTTON.R,
  Enter: BUTTON.START, Backspace: BUTTON.SELECT, ShiftRight: BUTTON.SELECT,
};

export class Keyboard {
  constructor(onChange) {
    this.mask = 0;
    this.enabled = false;
    const handler = (e) => {
      if (!this.enabled) return;
      const bit = KEYS[e.code];
      if (!bit) return;
      e.preventDefault();
      const mask = e.type === 'keydown' ? this.mask | bit : this.mask & ~bit;
      if (mask !== this.mask) {
        this.mask = mask;
        onChange();
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', handler);
    window.addEventListener('blur', () => { this.mask = 0; onChange(); });
  }
}

// Standard-mapping gamepads (MFi, Xbox, DualSense on iOS). Face buttons are
// positional: the right button is A, the bottom one is B, like on a GBA.
const PAD = [
  [1, BUTTON.A], [0, BUTTON.B], [3, BUTTON.A], [2, BUTTON.B],
  [4, BUTTON.L], [6, BUTTON.L], [5, BUTTON.R], [7, BUTTON.R],
  [8, BUTTON.SELECT], [9, BUTTON.START],
  [12, BUTTON.UP], [13, BUTTON.DOWN], [14, BUTTON.LEFT], [15, BUTTON.RIGHT],
];

export function pollGamepads() {
  if (!navigator.getGamepads) return 0;
  let mask = 0;
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue;
    for (const [index, bit] of PAD) {
      if (pad.buttons[index]?.pressed) mask |= bit;
    }
    const [x = 0, y = 0] = pad.axes;
    if (x < -0.5) mask |= BUTTON.LEFT;
    if (x > 0.5) mask |= BUTTON.RIGHT;
    if (y < -0.5) mask |= BUTTON.UP;
    if (y > 0.5) mask |= BUTTON.DOWN;
  }
  return mask;
}
