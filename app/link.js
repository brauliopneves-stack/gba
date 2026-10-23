// In-process link cable. Every machine plugged into it runs in the same
// page, stepped in lockstep by the Runner, so a multi-player transfer can be
// delivered to all of them directly.
export class LinkCable {
  constructor(machines) {
    this.machines = machines;
    machines.forEach((m, i) => {
      m.gba.sio.linkLayer = this;
      m.gba.sio.linkId = i;
    });
  }

  // SD ("all units ready") is only high once every game has switched its
  // serial port to multi-player mode, e.g. both players are in the Cable Club
  isReady() {
    return this.machines.every((m) => m.gba.sio.mode === m.gba.sio.SIO_MULTI);
  }

  startTransfer(parent) {
    const states = [0xffff, 0xffff, 0xffff, 0xffff];
    this.machines.forEach((m, i) => { states[i] = m.gba.sio.sendValue(); });
    const delay = parent.transferCycles(this.machines.length);
    for (const m of this.machines) {
      m.gba.sio.scheduleCompletion(states.slice(), delay);
    }
  }

  unplug() {
    for (const m of this.machines) {
      m.gba.sio.linkLayer = null;
      m.gba.sio.linkId = 0;
    }
  }
}
