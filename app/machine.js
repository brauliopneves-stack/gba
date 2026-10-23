/* global GameBoyAdvance */

export const BUTTON = {
  A: 1 << 0, B: 1 << 1, SELECT: 1 << 2, START: 1 << 3,
  RIGHT: 1 << 4, LEFT: 1 << 5, UP: 1 << 6, DOWN: 1 << 7,
  R: 1 << 8, L: 1 << 9,
};

export const CYCLES_PER_SCANLINE = 1232;
export const SCANLINES_PER_FRAME = 228;
export const CYCLES_PER_FRAME = CYCLES_PER_SCANLINE * SCANLINES_PER_FRAME;

// One emulated Game Boy Advance drawing into one canvas
export class Machine {
  constructor({ canvas, bios, onSave, onError }) {
    const gba = new GameBoyAdvance();
    gba.logLevel = gba.LOG_ERROR;
    gba.setLogger((level, message) => {
      if (level === gba.LOG_ERROR) onError?.(String(message));
    });
    // Savedata lives in IndexedDB per library entry, not in localStorage per
    // cartridge code, so two copies of the same game don't share a save
    gba.storeSavedata = () => {};
    gba.retrieveSavedata = () => false;
    gba.setCanvasDirect(canvas);
    gba.setBios(bios);

    this.gba = gba;
    this.canvas = canvas;
    this.onSave = onSave;
    this.buttons = 0;
    this.target = 0;
    this.seenSave = false;
    this.muted = false;
  }

  load(rom, save) {
    if (!this.gba.setRom(rom)) {
      throw new Error('Este arquivo não parece ser uma ROM de GBA válida.');
    }
    if (save && save.byteLength) {
      this.gba.setSavedata(save.slice(0));
    }
    this.target = this.gba.cpu.cycles;
    return this.gba.mmu.cart;
  }

  setButtons(mask) {
    this.buttons = mask;
    this.gba.keypad.currentDown = ~mask & 0x3ff;
  }

  setMuted(muted) {
    this.muted = muted;
    this.gba.audio.masterEnable = !muted;
  }

  setAudioRunning(running) {
    this.gba.audio.pause(!running);
  }

  runSlice(cycles) {
    this.target += cycles;
    const cpu = this.gba.cpu;
    const target = this.target;
    while (cpu.cycles < target) {
      cpu.step();
    }
  }

  // Games write their save over several frames; persist once writes settle
  endFrame() {
    const mmu = this.gba.mmu;
    if (!mmu.save) return;
    if (this.seenSave) {
      if (!mmu.saveNeedsFlush()) {
        this.seenSave = false;
        this.persistSave();
      } else {
        mmu.flushSave();
      }
    } else if (mmu.saveNeedsFlush()) {
      this.seenSave = true;
      mmu.flushSave();
    }
  }

  persistSave() {
    const save = this.gba.mmu.save;
    if (save) this.onSave?.(save.buffer.slice(0));
  }

  saveData() {
    const save = this.gba.mmu.save;
    return save ? save.buffer.slice(0) : null;
  }
}
