/* ============================================
   utils.js — Shared Utilities for IPC Simulator
   Provides: EventLog, Process model, SimController,
   animation helpers, and common DOM utilities.
   ============================================ */

'use strict';

/* ──────────────────────────────────────────────
   EVENT LOG
   Timestamped, color-coded log entries that
   auto-scroll to the latest event.
   ────────────────────────────────────────────── */
class EventLog {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.entries = [];
    this.startTime = Date.now();
  }

  /**
   * Append a timestamped entry to the event log.
   * @param {string} message - The log message
   * @param {'info'|'success'|'warning'|'error'|'system'} type - Visual style
   */
  log(message, type = 'info') {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${elapsed}s]</span> ${message}`;
    this.container.appendChild(entry);
    this.entries.push({ time: elapsed, message, type });

    // Auto-scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  /** Clear all log entries and reset the clock. */
  clear() {
    this.container.innerHTML = '';
    this.entries = [];
    this.startTime = Date.now();
  }
}

/* ──────────────────────────────────────────────
   PROCESS MODEL
   Represents a simulated OS process with state
   tracking and UI bindings.
   ────────────────────────────────────────────── */
class Process {
  /**
   * @param {string} id    - Unique ID like "P1", "Prod-1"
   * @param {string} name  - Display name
   * @param {'producer'|'consumer'|'generic'} role
   */
  constructor(id, name, role = 'generic') {
    this.id = id;
    this.name = name;
    this.role = role;
    this.state = 'ready'; // ready | running | waiting | blocked | terminated
    this._stateListeners = [];
  }

  /** Register a callback that fires on state change: fn(newState, oldState) */
  onStateChange(fn) {
    this._stateListeners.push(fn);
  }

  /** Update process state and notify all listeners. */
  setState(newState) {
    const old = this.state;
    if (old === newState) return;
    this.state = newState;
    this._stateListeners.forEach(fn => fn(newState, old));
  }
}

/* ──────────────────────────────────────────────
   SIMULATION CONTROLLER
   Manages pause/resume, step-mode, speed, and
   cooperative cancellation for all modules.
   ────────────────────────────────────────────── */
class SimController {
  constructor() {
    this.running = false;
    this.paused = false;
    this.stepping = false;     // true = advance one op then pause
    this._stepResolve = null;
    this._speed = 5;           // 1 (slow) … 10 (fast)
    this._cancelled = false;   // cooperative cancellation flag
    this._pausePromise = null;
    this._pauseResolve = null;
  }

  /** Speed multiplier: converts slider value 1-10 to a delay factor. */
  get speedFactor() {
    // speed 1 → factor 2.0 (slow), speed 10 → factor 0.1 (fast)
    return 2.0 / this._speed;
  }

  set speed(val) {
    this._speed = Math.max(1, Math.min(10, val));
  }
  get speed() { return this._speed; }

  /**
   * Delay that respects speed, pause, step-mode, and cancellation.
   * This is the CORE timing primitive — every simulated operation
   * calls this to yield control and simulate execution time.
   * @param {number} baseMs - Base delay in milliseconds before speed scaling
   */
  async delay(baseMs = 500) {
    if (this._cancelled) throw new CancelledError();

    const actualMs = Math.max(30, baseMs * this.speedFactor);

    // If paused, wait until resumed
    while (this.paused && !this._cancelled) {
      await this._waitForResume();
    }
    if (this._cancelled) throw new CancelledError();

    await sleep(actualMs);

    // In step mode, pause after each operation
    if (this.stepping && !this._cancelled) {
      this.paused = true;
      await this._waitForResume();
    }
    if (this._cancelled) throw new CancelledError();
  }

  /** Start the simulation */
  start() {
    this._cancelled = false;
    this.running = true;
    this.paused = false;
    this.stepping = false;
  }

  /** Pause (the delay() calls will block until resumed) */
  pause() {
    this.paused = true;
  }

  /** Resume from pause */
  resume() {
    this.paused = false;
    if (this._pauseResolve) {
      this._pauseResolve();
      this._pauseResolve = null;
      this._pausePromise = null;
    }
  }

  /** Single-step mode: resume one operation then pause again */
  step() {
    this.stepping = true;
    this.resume(); // unblock the current wait
  }

  /** Signal all running loops to stop */
  cancel() {
    this._cancelled = true;
    this.running = false;
    this.paused = false;
    this.stepping = false;
    // Unblock anything waiting
    if (this._pauseResolve) {
      this._pauseResolve();
      this._pauseResolve = null;
    }
  }

  get cancelled() { return this._cancelled; }

  /** Internal: returns a promise that resolves when resumed */
  _waitForResume() {
    if (!this._pausePromise) {
      this._pausePromise = new Promise(resolve => {
        this._pauseResolve = resolve;
      });
    }
    return this._pausePromise;
  }
}

/** Sentinel error for cooperative cancellation. */
class CancelledError extends Error {
  constructor() { super('Cancelled'); this.name = 'CancelledError'; }
}

/* ──────────────────────────────────────────────
   UTILITY FUNCTIONS
   ────────────────────────────────────────────── */

/** Simple async sleep */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Random integer in [min, max] (inclusive) */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random delay in ms for simulated scheduling jitter */
function randomDelay(minMs = 200, maxMs = 800) {
  return randInt(minMs, maxMs);
}

/**
 * Update a state-dot element with the correct CSS class.
 * @param {HTMLElement} dotEl - The .state-dot element
 * @param {string} state - Process state name
 */
function updateStateDot(dotEl, state) {
  if (!dotEl) return;
  dotEl.className = 'state-dot ' + state;
}

/**
 * Create or update a process-state chip in the footer bar.
 * @param {Process} proc
 */
function updateProcessChip(proc) {
  const container = document.getElementById('process-states');
  let chip = document.getElementById('chip-' + proc.id);
  if (!chip) {
    chip = document.createElement('span');
    chip.id = 'chip-' + proc.id;
    chip.className = 'proc-state-chip';
    chip.innerHTML = `<span class="chip-dot"></span><span class="chip-id">${proc.name}</span>`;
    container.appendChild(chip);
  }
  const dot = chip.querySelector('.chip-dot');
  dot.style.background = `var(--state-${proc.state})`;
  chip.title = `${proc.name}: ${proc.state}`;
}

/** Remove a process chip from the footer bar */
function removeProcessChip(procId) {
  const chip = document.getElementById('chip-' + procId);
  if (chip) chip.remove();
}

/** Clear all process chips */
function clearProcessChips() {
  document.getElementById('process-states').innerHTML = '';
}

/**
 * Animate a "packet" div from one element to another.
 * Returns a promise that resolves when the animation completes.
 * @param {HTMLElement} container - Position-relative container
 * @param {HTMLElement} fromEl   - Source element
 * @param {HTMLElement} toEl     - Destination element
 * @param {string} label         - Text on the packet
 * @param {string} cssClass      - Extra CSS class (data-packet, ack-packet, etc.)
 * @param {number} durationMs    - Animation duration
 */
function animatePacket(container, fromEl, toEl, label, cssClass = 'data-packet', durationMs = 800) {
  return new Promise(resolve => {
    const containerRect = container.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const packet = document.createElement('div');
    packet.className = `msg-packet ${cssClass}`;
    packet.textContent = label;
    container.appendChild(packet);

    // Start position (center of fromEl relative to container)
    const startX = fromRect.left + fromRect.width / 2 - containerRect.left;
    const startY = fromRect.top + fromRect.height / 2 - containerRect.top;
    packet.style.left = startX + 'px';
    packet.style.top = startY + 'px';
    packet.style.transform = 'translate(-50%, -50%) scale(0.5)';
    packet.style.opacity = '0';

    // Trigger reflow then animate
    requestAnimationFrame(() => {
      packet.style.opacity = '1';
      packet.style.transform = 'translate(-50%, -50%) scale(1)';

      requestAnimationFrame(() => {
        const endX = toRect.left + toRect.width / 2 - containerRect.left;
        const endY = toRect.top + toRect.height / 2 - containerRect.top;
        packet.style.transition = `all ${durationMs}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        packet.style.left = endX + 'px';
        packet.style.top = endY + 'px';
      });
    });

    setTimeout(() => {
      packet.style.opacity = '0';
      packet.style.transform = 'translate(-50%, -50%) scale(0.5)';
      setTimeout(() => {
        packet.remove();
        resolve();
      }, 200);
    }, durationMs);
  });
}

/**
 * Toggle-switch helper: wire up a pair of buttons so clicking one
 * activates it and deactivates the other.
 * @param {string} onId  - ID of the "on" button
 * @param {string} offId - ID of the "off" button
 * @param {Function} onChange - Callback(value: string)
 */
function wireToggle(onId, offId, onChange) {
  const onBtn = document.getElementById(onId);
  const offBtn = document.getElementById(offId);
  [onBtn, offBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      onBtn.classList.toggle('active', btn === onBtn);
      offBtn.classList.toggle('active', btn === offBtn);
      onChange(btn.dataset.val);
    });
  });
}

/** Escape HTML entities */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
