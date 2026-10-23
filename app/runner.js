import { CYCLES_PER_FRAME, CYCLES_PER_SCANLINE } from './machine.js';

const FRAME_MS = 1000 / 59.7275;
// Don't let a long hiccup (tab switch, slow frame) turn into a burst of
// catch-up frames
const MAX_BACKLOG_MS = 100;
// Leave the main thread some room each display frame
const BUDGET_MS = 14;

// Drives one or more machines. Linked machines are stepped a scanline at a
// time, alternating between them, so their clocks never drift more than a
// scanline apart and link transfers arrive when the games expect them.
export class Runner {
  constructor(machines, { onError, beforeFrame } = {}) {
    this.machines = machines;
    this.onError = onError;
    this.beforeFrame = beforeFrame;
    this.speed = 1;
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.backlog = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.backlog = 0;
    for (const m of this.machines) m.setAudioRunning(true);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const m of this.machines) m.setAudioRunning(false);
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    this.backlog = Math.min(this.backlog + (now - this.last) * this.speed, MAX_BACKLOG_MS * this.speed);
    this.last = now;
    const started = performance.now();
    try {
      while (this.running && this.backlog >= FRAME_MS) {
        this.runFrame();
        this.backlog -= FRAME_MS;
        if (performance.now() - started > BUDGET_MS) {
          this.backlog = Math.min(this.backlog, FRAME_MS);
          break;
        }
      }
    } catch (e) {
      this.stop();
      this.onError?.(e);
    }
  }

  runFrame() {
    this.beforeFrame?.();
    const machines = this.machines;
    if (machines.length === 1) {
      machines[0].runSlice(CYCLES_PER_FRAME);
    } else {
      for (let line = 0; line < CYCLES_PER_FRAME; line += CYCLES_PER_SCANLINE) {
        for (let i = 0; i < machines.length; ++i) {
          machines[i].runSlice(CYCLES_PER_SCANLINE);
        }
      }
    }
    for (const m of machines) m.endFrame();
  }
}
