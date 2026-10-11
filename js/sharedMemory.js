/* ============================================
   sharedMemory.js — Module 3: Shared Memory
   Demonstrates:
   - Shared memory segment (visible counter)
   - Race condition with lost updates
   - Read-Modify-Write interleaving visualization
   - Mutex protection toggle (Sync ON/OFF)
   - Expected vs Actual comparison
   ============================================ */

'use strict';

class SharedMemoryModule {
  constructor(eventLog) {
    this.eventLog = eventLog;
    this.controller = new SimController();

    // Shared memory state
    this.sharedCounter = 0;
    this.syncEnabled = false;
    this.iterations = 20;
    this.running = false;

    /** Mutex semaphore for critical section protection */
    this.mutex = null;

    // Process models
    this.p1 = new Process('SM-P1', 'P1');
    this.p2 = new Process('SM-P2', 'P2');

    // Interleaving log for timeline visualization
    this.interleavingLog = [];

    this._init();
  }

  _init() {
    // Sync toggle
    wireToggle('sm-sync-off', 'sm-sync-on', val => {
      this.syncEnabled = (val === 'on');
      const mutexBox = document.getElementById('sm-mutex-box');
      if (this.syncEnabled) {
        mutexBox.classList.remove('hidden-box');
        this.eventLog.log('Synchronization ENABLED — mutex protects critical section', 'system');
      } else {
        mutexBox.classList.add('hidden-box');
        this.eventLog.log('Synchronization DISABLED — race conditions possible!', 'warning');
      }
    });

    // Hide mutex indicator initially
    document.getElementById('sm-mutex-box').classList.add('hidden-box');

    // Iterations input
    document.getElementById('sm-iterations').addEventListener('change', (e) => {
      this.iterations = parseInt(e.target.value) || 20;
    });

    // Run button
    document.getElementById('sm-run-btn').addEventListener('click', () => {
      this._runDemo();
    });

    // Process state listeners
    [this.p1, this.p2].forEach(p => {
      p.onStateChange((state) => {
        const dotId = p === this.p1 ? 'sm-state-P1' : 'sm-state-P2';
        updateStateDot(document.getElementById(dotId), state);
        updateProcessChip(p);

        // Highlight active panel
        const panelId = p === this.p1 ? 'sm-panel-P1' : 'sm-panel-P2';
        const panel = document.getElementById(panelId);
        panel.classList.toggle('active-proc', state === 'running');
      });
      updateProcessChip(p);
    });
  }

  /* ──────────────────────────────────────────
     RACE CONDITION DEMO
     ────────────────────────────────────────── */

  async _runDemo() {
    if (this.running) return;
    this.running = true;
    this.controller.start();
    this.controller.speed = parseInt(document.getElementById('speed-slider').value);

    // Reset state
    this.sharedCounter = 0;
    this.interleavingLog = [];
    this.mutex = new Semaphore('mutex', 1, true);

    const N = this.iterations;
    const expectedValue = N * 2; // Two processes, each increments N times

    // Reset UI
    this._updateCounterDisplay(0);
    this._clearInterleaving();
    document.getElementById('sm-expected').textContent = expectedValue;
    document.getElementById('sm-actual').textContent = '…';
    document.getElementById('sm-lost').textContent = '…';
    document.getElementById('sm-verdict').textContent = '';
    document.getElementById('sm-verdict').className = 'sm-verdict';
    document.getElementById('sm-run-btn').disabled = true;
    this._resetProcessPanels();

    this.p1.setState('ready');
    this.p2.setState('ready');
    updateProcessChip(this.p1);
    updateProcessChip(this.p2);

    this.eventLog.log(
      `Race condition demo started: 2 processes × ${N} iterations = ${expectedValue} expected`,
      'system'
    );
    this.eventLog.log(
      `Synchronization: ${this.syncEnabled ? 'ON (mutex)' : 'OFF (unsafe!)'}`,
      this.syncEnabled ? 'success' : 'warning'
    );

    try {
      // Run both processes concurrently — this is where the race happens!
      await Promise.all([
        this._processLoop(this.p1, N, 'P1'),
        this._processLoop(this.p2, N, 'P2'),
      ]);
    } catch (e) {
      if (!(e instanceof CancelledError)) console.error(e);
    }

    // ─── Show Results ───
    const actual = this.sharedCounter;
    const lost = expectedValue - actual;

    document.getElementById('sm-actual').textContent = actual;
    document.getElementById('sm-lost').textContent = lost;

    const verdict = document.getElementById('sm-verdict');
    if (lost === 0) {
      verdict.textContent = '✅ CORRECT — No race condition detected';
      verdict.className = 'sm-verdict correct';
      this.eventLog.log(`Result: ${actual}/${expectedValue} — CORRECT`, 'success');
    } else {
      verdict.textContent = `⚠️ RACE CONDITION — ${lost} lost update${lost > 1 ? 's' : ''}!`;
      verdict.className = 'sm-verdict race';
      this.eventLog.log(`Result: ${actual}/${expectedValue} — ${lost} LOST UPDATES`, 'error');
    }

    this.p1.setState('terminated');
    this.p2.setState('terminated');
    this.running = false;
    document.getElementById('sm-run-btn').disabled = false;
  }

  /**
   * Process loop — each process increments the shared counter N times.
   *
   * WITHOUT SYNC: The read-modify-write is non-atomic. A context switch
   * between the READ and WRITE steps causes a LOST UPDATE because both
   * processes read the same old value and write back the same new value.
   *
   * WITH SYNC: A mutex protects the entire critical section (read +
   * modify + write), ensuring mutual exclusion and correct results.
   *
   * @param {Process} process - The process to run
   * @param {number}  N       - Number of iterations
   * @param {string}  tag     - 'P1' or 'P2' for UI updates
   */
  async _processLoop(process, N, tag) {
    for (let i = 0; i < N; i++) {
      if (!this.running) break;

      try {
        // ─── Optional: Acquire mutex (only if sync is ON) ───
        if (this.syncEnabled) {
          process.setState('waiting');
          await this.mutex.wait(process, this.eventLog);
          this._updateMutexDisplay(true, tag);
        }

        process.setState('running');

        /* ╔══════════════════════════════════════╗
         * ║     CRITICAL SECTION                  ║
         * ║     read → modify → write             ║
         * ╚══════════════════════════════════════╝ */

        // STEP 1: READ — load shared counter into local variable
        const localCopy = this.sharedCounter;
        this._updateStepUI(tag, 'read', localCopy);
        this._addInterleaving(tag, 'READ', localCopy);

        // Random delay simulates a context switch point.
        // Without synchronization, the OTHER process can run here,
        // reading the SAME old value — causing a lost update.
        if (!this.syncEnabled) {
          await this.controller.delay(randomDelay(30, 120));
        } else {
          await this.controller.delay(40);
        }

        if (!this.running) break;

        // STEP 2: MODIFY — increment local copy
        const newValue = localCopy + 1;
        this._updateStepUI(tag, 'modify', newValue);
        this._addInterleaving(tag, 'MODIFY', `${localCopy} + 1 = ${newValue}`);

        if (!this.syncEnabled) {
          await this.controller.delay(randomDelay(20, 80));
        } else {
          await this.controller.delay(30);
        }

        if (!this.running) break;

        // STEP 3: WRITE — store new value back to shared memory
        // If another process wrote between our READ and WRITE,
        // that write is LOST (overwritten with our stale value).
        const oldShared = this.sharedCounter;
        this.sharedCounter = newValue;
        this._updateCounterDisplay(newValue);
        this._updateStepUI(tag, 'write', newValue);

        // Detect if this write caused a lost update
        if (!this.syncEnabled && oldShared !== localCopy) {
          this._addInterleaving(tag, 'WRITE', `${newValue} ⚠️ overwrote ${oldShared}!`, true);
          this.eventLog.log(
            `${tag} WRITE ${newValue} — LOST UPDATE! (overwrote ${oldShared})`,
            'error'
          );
        } else {
          this._addInterleaving(tag, 'WRITE', newValue);
        }

        // ─── Optional: Release mutex ───
        if (this.syncEnabled) {
          this.mutex.signal(process, this.eventLog);
          this._updateMutexDisplay(false, tag);
        }

        // Update progress
        this._updateProgress(tag, i + 1, N);

        process.setState('ready');

        // Small delay between iterations
        await this.controller.delay(randomDelay(20, 80));

      } catch (e) {
        if (e instanceof CancelledError) break;
        throw e;
      }
    }
  }

  /* ──────────────────────────────────────────
     UI UPDATES
     ────────────────────────────────────────── */

  _updateCounterDisplay(value) {
    const el = document.getElementById('sm-counter-display');
    el.textContent = value;
    el.classList.add('updating');
    setTimeout(() => el.classList.remove('updating'), 300);
  }

  _updateMutexDisplay(locked, holder) {
    const box = document.getElementById('sm-mutex-box');
    const state = document.getElementById('sm-mutex-state');
    if (locked) {
      box.classList.add('locked');
      box.classList.remove('unlocked');
      state.textContent = `LOCKED (${holder})`;
    } else {
      box.classList.remove('locked');
      box.classList.add('unlocked');
      state.textContent = 'UNLOCKED';
    }
  }

  _updateStepUI(tag, step, value) {
    const prefix = tag === 'P1' ? 'sm-p1' : 'sm-p2';
    const el = document.getElementById(`${prefix}-${step}`);
    if (el) el.textContent = value;

    // Highlight the active step
    const panel = document.getElementById(`sm-panel-${tag}`);
    panel.querySelectorAll('.step-item').forEach(item => item.classList.remove('active-step'));
    const stepMap = { read: 0, modify: 1, write: 2 };
    const items = panel.querySelectorAll('.step-item');
    if (items[stepMap[step]]) {
      items[stepMap[step]].classList.add('active-step');
    }
  }

  _updateProgress(tag, current, total) {
    const prefix = tag === 'P1' ? 'sm-p1' : 'sm-p2';
    const fill = document.getElementById(`${prefix}-progress`);
    const label = document.getElementById(`${prefix}-count`);
    const pct = (current / total * 100).toFixed(0);
    fill.style.width = pct + '%';
    label.textContent = `${current} / ${total}`;
  }

  _addInterleaving(tag, action, value, isConflict = false) {
    const container = document.getElementById('sm-interleaving');
    const step = document.createElement('div');
    const cssClass = isConflict ? 'conflict' : (tag === 'P1' ? 'p1-step' : 'p2-step');
    step.className = `interleave-step ${cssClass}`;
    step.innerHTML =
      `<span class="step-proc">${tag}</span>` +
      `<span class="step-action">${action}</span>` +
      `<span class="step-value">${value}</span>`;
    container.appendChild(step);
    container.scrollTop = container.scrollHeight;
  }

  _clearInterleaving() {
    document.getElementById('sm-interleaving').innerHTML = '';
  }

  _resetProcessPanels() {
    ['P1', 'P2'].forEach(tag => {
      const prefix = tag === 'P1' ? 'sm-p1' : 'sm-p2';
      document.getElementById(`${prefix}-read`).textContent = '—';
      document.getElementById(`${prefix}-modify`).textContent = '—';
      document.getElementById(`${prefix}-write`).textContent = '—';
      document.getElementById(`${prefix}-progress`).style.width = '0%';
      document.getElementById(`${prefix}-count`).textContent = '0 / 0';
      document.getElementById(`sm-panel-${tag}`).classList.remove('active-proc');
      document.getElementById(`sm-panel-${tag}`).querySelectorAll('.step-item').forEach(i => i.classList.remove('active-step'));
    });

    const mutexBox = document.getElementById('sm-mutex-box');
    mutexBox.classList.remove('locked');
    mutexBox.classList.add('unlocked');
    document.getElementById('sm-mutex-state').textContent = 'UNLOCKED';
  }

  reset() {
    this.running = false;
    this.controller.cancel();
    if (this.mutex) this.mutex.reset(1);
    this.sharedCounter = 0;

    this._updateCounterDisplay(0);
    this._clearInterleaving();
    this._resetProcessPanels();

    document.getElementById('sm-expected').textContent = '—';
    document.getElementById('sm-actual').textContent = '—';
    document.getElementById('sm-lost').textContent = '—';
    document.getElementById('sm-verdict').textContent = '';
    document.getElementById('sm-verdict').className = 'sm-verdict';
    document.getElementById('sm-run-btn').disabled = false;

    // Reset sync toggle
    document.getElementById('sm-sync-off').classList.add('active');
    document.getElementById('sm-sync-on').classList.remove('active');
    document.getElementById('sm-mutex-box').classList.add('hidden-box');
    this.syncEnabled = false;

    this.p1.setState('ready');
    this.p2.setState('ready');
  }
}
