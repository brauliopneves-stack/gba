// Serial I/O. Multi-player mode is implemented against an in-process
// link cable (see app/link.js), which is how two games running in the same
// page can trade with each other.
function GameBoyAdvanceSIO() {
	this.SIO_NORMAL_8 = 0;
	this.SIO_NORMAL_32 = 1;
	this.SIO_MULTI = 2;
	this.SIO_UART = 3;
	this.SIO_GPIO = 8;
	this.SIO_JOYBUS = 12;

	this.BAUD = [ 9600, 38400, 57600, 115200 ];

	// Cycles one multi-player transfer takes, by baud rate and number of
	// connected units (same table mGBA uses)
	this.CYCLES_PER_TRANSFER = [
		[ 38326, 73003, 107680, 142356 ],
		[ 9582, 18251, 26920, 35589 ],
		[ 6388, 12167, 17946, 23726 ],
		[ 3194, 6075, 8973, 11863 ]
	];

	this.linkLayer = null;
	this.linkId = 0;
}

GameBoyAdvanceSIO.prototype.clear = function() {
	this.mode = this.SIO_GPIO;

	this.irq = false;
	this.multiplayer = {
		baud: 0,
		id: 0,
		error: 0,
		busy: 0,

		states: [ 0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF ]
	};

	this.nextEvent = 0;
	this.pendingStates = null;
};

GameBoyAdvanceSIO.prototype.isConnected = function() {
	return !!(this.linkLayer && this.linkLayer.isReady());
};

GameBoyAdvanceSIO.prototype.setMode = function(mode) {
	if (mode & 0x8) {
		mode &= 0xC;
	} else {
		mode &= 0x3;
	}
	this.mode = mode;
};

GameBoyAdvanceSIO.prototype.writeRCNT = function(value) {
	// General purpose mode is not used by the games we care about
};

GameBoyAdvanceSIO.prototype.writeSIOCNT = function(value) {
	switch (this.mode) {
	case this.SIO_NORMAL_8:
	case this.SIO_NORMAL_32:
		// Normal mode transfers with nothing on the other end complete
		// immediately and receive all ones
		this.irq = value & 0x4000;
		if (value & 0x0080) {
			this.core.io.registers[this.core.io.SIODATA8 >> 1] = 0xFFFF;
			if (this.irq) {
				this.core.irq.raiseIRQ(this.core.irq.IRQ_SIO);
			}
		}
		break;
	case this.SIO_MULTI:
		this.multiplayer.baud = value & 0x0003;
		this.irq = value & 0x4000;

		// Only the parent (id 0) may start a transfer, and a running transfer
		// can't be cancelled by rewriting SIOCNT
		if ((value & 0x0080) && !this.multiplayer.busy && this.linkId == 0 && this.isConnected()) {
			this.multiplayer.busy = 0x0080;
			this.linkLayer.startTransfer(this);
		}
		break;
	default:
		break;
	}
};

GameBoyAdvanceSIO.prototype.readSIOCNT = function() {
	var value = (this.mode << 12) & 0x3000;
	switch (this.mode) {
	case this.SIO_MULTI:
		var connected = this.isConnected();
		value |= this.multiplayer.baud;
		// SI is low only on the parent end of the cable
		value |= (connected && this.linkId == 0 ? 0 : 1) << 2;
		// SD: all units are ready
		value |= (connected ? 1 : 0) << 3;
		value |= this.multiplayer.id << 4;
		value |= this.multiplayer.error;
		value |= this.multiplayer.busy;
		value |= (!!this.irq) << 14;
		break;
	default:
		value |= this.core.io.registers[this.core.io.SIOCNT >> 1] & 0x4F83;
		break;
	}
	return value;
};

GameBoyAdvanceSIO.prototype.read = function(slot) {
	switch (this.mode) {
	case this.SIO_MULTI:
		return this.multiplayer.states[slot];
	case this.SIO_NORMAL_32:
		return slot ? 0xFFFF : this.core.io.registers[this.core.io.SIODATA8 >> 1];
	default:
		return this.core.io.registers[(this.core.io.SIOMULTI0 >> 1) + slot];
	}
};

GameBoyAdvanceSIO.prototype.sendValue = function() {
	return this.core.io.registers[this.core.io.SIOMLT_SEND >> 1];
};

GameBoyAdvanceSIO.prototype.transferCycles = function(units) {
	return this.CYCLES_PER_TRANSFER[this.multiplayer.baud][Math.max(units, 1) - 1];
};

// Called by the link layer: the transfer finishes `delay` cycles from this
// unit's present
GameBoyAdvanceSIO.prototype.scheduleCompletion = function(states, delay) {
	this.pendingStates = states;
	this.multiplayer.busy = 0x0080;
	this.nextEvent = this.core.cpu.cycles + delay;
	var irq = this.core.irq;
	// Only ever pull the next event earlier; 0 already means "due now"
	if (this.nextEvent < irq.nextEvent) {
		irq.nextEvent = this.nextEvent;
	}
};

GameBoyAdvanceSIO.prototype.updateTimers = function() {
	if (!this.nextEvent || this.core.cpu.cycles < this.nextEvent) {
		return;
	}
	this.nextEvent = 0;
	var states = this.pendingStates;
	this.pendingStates = null;
	this.multiplayer.states = states;
	this.multiplayer.busy = 0;
	this.multiplayer.id = this.linkId;
	var io = this.core.io;
	for (var i = 0; i < 4; ++i) {
		io.registers[(io.SIOMULTI0 >> 1) + i] = states[i];
	}
	if (this.irq) {
		this.core.irq.raiseIRQ(this.core.irq.IRQ_SIO);
	}
};

GameBoyAdvanceSIO.prototype.freeze = function() {
	return {
		'mode': this.mode,
		'irq': this.irq,
		'multiplayer': {
			baud: this.multiplayer.baud,
			id: this.multiplayer.id,
			error: this.multiplayer.error,
			busy: 0,
			states: this.multiplayer.states.slice(0)
		}
	};
};

GameBoyAdvanceSIO.prototype.defrost = function(frost) {
	this.mode = frost.mode;
	this.irq = frost.irq;
	this.multiplayer = frost.multiplayer;
	this.nextEvent = 0;
	this.pendingStates = null;
};
