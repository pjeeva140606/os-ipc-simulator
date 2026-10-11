/* ============================================
   semaphores.js — Module 2: Semaphores
   Classic Producer–Consumer with bounded buffer.
   Demonstrates:
   - Counting semaphores (empty, full)
   - Binary semaphore / mutex
   - wait() and signal() operations
   - Buffer slot visualization
   - Blocked process queue
   ============================================ */

'use strict';

/* ──────────────────────────────────────────────
   SEMAPHORE
   Core synchronization primitive.

   value > 0 : resource is available
   value = 0 : resource exhausted (next wait blocks)
   value < 0 : |value| processes are blocked in queue

   wait()   → decrement; if < 0, block the caller
   signal() → increment; if ≤ 0, unblock one waiter
   ────────────────────────────────────────────── */
class Semaphore {
  /**
   * @param {string}  name          - Display name for logging
   * @param {number}  initialValue  - Starting value
   * @param {boolean} isBinary      - If true, value is clamped to 0/1
   */
  constructor(name, initialValue, isBinary = false) {
    this.name = name;
    this.value = initialValue;
    this.isBinary = isBinary;
    /** @type {Array<{process: Process, resolve: Function}>} */
    this.waitQueue = [];
  }

  /**
   * wait() / P() / down() — the classic semaphore wait.
   *
   * Atomically decrements the semaphore value. If the value
   * becomes negative, the calling process is BLOCKED and
   * placed in the semaphore's wait queue until another
   * process calls signal().
   *
   * @param {Process}  process  - The calling process
   * @param {EventLog} log      - Event log instance
   */
  async wait(process, log) {
    this.value--;
    log.log(
      `${process.name} calls <strong>wait(${this.name})</strong> → value = ${this.value}`,
      this.value < 0 ? 'warning' : 'info'
    );

    if (this.value < 0) {
      // Process must block — it goes into the wait queue
      process.setState('blocked');
      log.log(`${process.name} BLOCKED on ${this.name}`, 'warning');

      // Return a promise that only resolves when signal() unblocks us
      return new Promise(resolve => {
        this.waitQueue.push({ process, resolve });
      });
    }
  }

  /**
   * signal() / V() / up() — the classic semaphore signal.
   *
   * Atomically increments the semaphore value. If there are
   * processes blocked in the wait queue, the first one is
   * unblocked and moved to the ready state.
   *
   * @param {Process}  process  - The calling process
   * @param {EventLog} log      - Event log instance
   */
  signal(process, log) {
    if (this.isBinary) {
      this.value = Math.min(this.value + 1, 1);
    } else {
      this.value++;
    }

    log.log(
      `${process.name} calls <strong>signal(${this.name})</strong> → value = ${this.value}`,
      'info'
    );

    // If processes are waiting, wake up the first one (FIFO)
    if (this.waitQueue.length > 0) {
      const { process: waitingProc, resolve } = this.waitQueue.shift();
      waitingProc.setState('ready');
      log.log(`${waitingProc.name} UNBLOCKED from ${this.name}`, 'success');
      resolve();
    }
  }

  /** Reset semaphore to initial state */
  reset(initialValue) {
    this.value = initialValue;
    // Resolve all waiting processes to prevent dangling promises
    this.waitQueue.forEach(({ process, resolve }) => {
      process.setState('terminated');
      resolve();
    });
    this.waitQueue = [];
  }
}

/* ──────────────────────────────────────────────
   PRODUCER–CONSUMER MODULE
   ────────────────────────────────────────────── */
class SemaphoreModule {
  constructor(eventLog) {
    this.eventLog = eventLog;
    this.controller = new SimController();

    // Configuration (from sliders)
    this.numProducers = 2;
    this.numConsumers = 2;
    this.bufferSize = 6;
    this.speed = 5;

    // State
    this.buffer = [];
    this.inIdx = 0;     // next index to produce into
    this.outIdx = 0;    // next index to consume from
    this.itemCounter = 0;
    this.producedCount = 0;
    this.consumedCount = 0;
    this.running = false;

    /** @type {Semaphore} empty — counts free buffer slots */
    this.empty = null;
    /** @type {Semaphore} full — counts filled buffer slots */
    this.full = null;
    /** @type {Semaphore} mutex — mutual exclusion for buffer access */
    this.mutex = null;

    /** @type {Process[]} */
    this.producers = [];
    /** @type {Process[]} */
    this.consumers = [];

    this._init();
  }

  _init() {
    // Wire slider inputs
    const slidersConfig = [
      { id: 'sem-producers', valId: 'sem-prod-val', prop: 'numProducers' },
      { id: 'sem-consumers', valId: 'sem-cons-val', prop: 'numConsumers' },
      { id: 'sem-buffer-size', valId: 'sem-buf-val', prop: 'bufferSize' },
      { id: 'sem-speed', valId: 'sem-speed-val', prop: 'speed' },
    ];

    slidersConfig.forEach(({ id, valId, prop }) => {
      const slider = document.getElementById(id);
      const label = document.getElementById(valId);
      slider.addEventListener('input', () => {
        this[prop] = parseInt(slider.value);
        label.textContent = slider.value;
        if (prop !== 'speed') this._rebuildBufferUI();
      });
    });

    this._rebuildBufferUI();
  }

  /* ──────────────────────────────────────────
     SIMULATION LIFECYCLE
     ────────────────────────────────────────── */

  start() {
    if (this.running) return;
    this.running = true;
    this.controller.start();
    this.controller.speed = this.speed;

    // Initialize semaphores
    this.buffer = new Array(this.bufferSize).fill(null);
    this.inIdx = 0;
    this.outIdx = 0;
    this.itemCounter = 0;
    this.producedCount = 0;
    this.consumedCount = 0;

    /**
     * Three semaphores for Producer-Consumer:
     *   empty = bufferSize  (free slots available)
     *   full  = 0           (no items yet)
     *   mutex = 1           (binary, guards the buffer)
     */
    this.empty = new Semaphore('empty', this.bufferSize);
    this.full  = new Semaphore('full', 0);
    this.mutex = new Semaphore('mutex', 1, true);

    // Create producer processes
    this.producers = [];
    for (let i = 0; i < this.numProducers; i++) {
      const p = new Process(`Prod-${i + 1}`, `Prod-${i + 1}`, 'producer');
      p.onStateChange(() => {
        this._renderProcessLists();
        updateProcessChip(p);
      });
      this.producers.push(p);
      updateProcessChip(p);
    }

    // Create consumer processes
    this.consumers = [];
    for (let i = 0; i < this.numConsumers; i++) {
      const c = new Process(`Cons-${i + 1}`, `Cons-${i + 1}`, 'consumer');
      c.onStateChange(() => {
        this._renderProcessLists();
        updateProcessChip(c);
      });
      this.consumers.push(c);
      updateProcessChip(c);
    }

    this.eventLog.log('Producer-Consumer started', 'system');
    this._updateSemaphoreDisplay();
    this._renderProcessLists();
    this._renderBufferSlots();

    // Launch all producer and consumer loops concurrently
    const tasks = [
      ...this.producers.map(p => this._producerLoop(p)),
      ...this.consumers.map(c => this._consumerLoop(c)),
    ];

    Promise.allSettled(tasks).then(() => {
      this.eventLog.log('All producer/consumer tasks ended', 'system');
    });
  }

  pause() {
    this.controller.pause();
  }

  resume() {
    this.controller.resume();
  }

  step() {
    this.controller.step();
  }

  stop() {
    this.running = false;
    this.controller.cancel();
    if (this.empty) this.empty.reset(this.bufferSize);
    if (this.full) this.full.reset(0);
    if (this.mutex) this.mutex.reset(1);

    [...this.producers, ...this.consumers].forEach(p => {
      p.setState('terminated');
    });
  }

  reset() {
    this.stop();
    this.buffer = [];
    this.producedCount = 0;
    this.consumedCount = 0;
    this.producers = [];
    this.consumers = [];

    clearProcessChips();

    document.getElementById('sem-produced').textContent = '0';
    document.getElementById('sem-consumed').textContent = '0';
    this._rebuildBufferUI();
    this._renderProcessLists();
    this._renderBlockedQueue();
  }

  /* ──────────────────────────────────────────
     PRODUCER / CONSUMER LOOPS
     These are the classic Producer-Consumer
     algorithms using semaphores.
     ────────────────────────────────────────── */

  /**
   * Producer loop — runs until simulation stops.
   *
   * Algorithm:
   *   1. Produce an item
   *   2. wait(empty)    — wait for a free slot
   *   3. wait(mutex)    — enter critical section
   *   4. buffer[in] = item; in = (in + 1) % N
   *   5. signal(mutex)  — exit critical section
   *   6. signal(full)   — one more item available
   */
  async _producerLoop(producer) {
    while (this.running) {
      try {
        producer.setState('running');

        // 1. "Produce" an item (with random delay to simulate work)
        this.itemCounter++;
        const item = `I${this.itemCounter}`;
        this.eventLog.log(`${producer.name} producing "${item}"…`, 'info');
        await this.controller.delay(randomDelay(300, 700));

        if (!this.running) break;

        // 2. wait(empty) — decrement free-slot count; block if buffer is full
        producer.setState('waiting');
        await this.empty.wait(producer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();

        if (!this.running) break;

        // 3. wait(mutex) — acquire exclusive access to the buffer
        await this.mutex.wait(producer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();
        producer.setState('running');

        if (!this.running) break;

        // 4. Critical section: insert item into buffer
        this.buffer[this.inIdx] = item;
        this._highlightSlot(this.inIdx, 'producing');
        this.inIdx = (this.inIdx + 1) % this.bufferSize;
        this.producedCount++;
        document.getElementById('sem-produced').textContent = this.producedCount;
        this._renderBufferSlots();

        this.eventLog.log(
          `${producer.name} placed "${item}" at slot ${(this.inIdx - 1 + this.bufferSize) % this.bufferSize}`,
          'success'
        );

        await this.controller.delay(150);

        // 5. signal(mutex) — release exclusive access
        this.mutex.signal(producer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();

        // 6. signal(full) — increment filled-slot count
        this.full.signal(producer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();

        producer.setState('ready');
        await this.controller.delay(randomDelay(200, 500));

      } catch (e) {
        if (e instanceof CancelledError) break;
        console.error(e);
        break;
      }
    }
    producer.setState('terminated');
  }

  /**
   * Consumer loop — runs until simulation stops.
   *
   * Algorithm:
   *   1. wait(full)     — wait for an available item
   *   2. wait(mutex)    — enter critical section
   *   3. item = buffer[out]; out = (out + 1) % N
   *   4. signal(mutex)  — exit critical section
   *   5. signal(empty)  — one more free slot
   *   6. Consume the item
   */
  async _consumerLoop(consumer) {
    while (this.running) {
      try {
        consumer.setState('ready');
        await this.controller.delay(randomDelay(200, 600));

        if (!this.running) break;

        // 1. wait(full) — block if buffer is empty
        consumer.setState('waiting');
        await this.full.wait(consumer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();

        if (!this.running) break;

        // 2. wait(mutex)
        await this.mutex.wait(consumer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();
        consumer.setState('running');

        if (!this.running) break;

        // 3. Critical section: remove item from buffer
        const item = this.buffer[this.outIdx];
        this._highlightSlot(this.outIdx, 'consuming');
        this.buffer[this.outIdx] = null;
        this.outIdx = (this.outIdx + 1) % this.bufferSize;
        this.consumedCount++;
        document.getElementById('sem-consumed').textContent = this.consumedCount;
        this._renderBufferSlots();

        this.eventLog.log(
          `${consumer.name} consumed "${item}" from slot ${(this.outIdx - 1 + this.bufferSize) % this.bufferSize}`,
          'success'
        );

        await this.controller.delay(150);

        // 4. signal(mutex)
        this.mutex.signal(consumer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();

        // 5. signal(empty)
        this.empty.signal(consumer, this.eventLog);
        this._updateSemaphoreDisplay();
        this._renderBlockedQueue();

        // 6. "Consume" the item (simulated delay)
        consumer.setState('running');
        this.eventLog.log(`${consumer.name} processing "${item}"…`, 'info');
        await this.controller.delay(randomDelay(300, 700));
        consumer.setState('ready');

      } catch (e) {
        if (e instanceof CancelledError) break;
        console.error(e);
        break;
      }
    }
    consumer.setState('terminated');
  }

  /* ──────────────────────────────────────────
     UI RENDERING
     ────────────────────────────────────────── */

  _rebuildBufferUI() {
    const container = document.getElementById('sem-buffer');
    container.innerHTML = '';
    for (let i = 0; i < this.bufferSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'buffer-slot';
      slot.id = `slot-${i}`;
      slot.dataset.index = i;
      container.appendChild(slot);
    }
    this._updateSemaphoreDisplay();
  }

  _renderBufferSlots() {
    for (let i = 0; i < this.bufferSize; i++) {
      const slot = document.getElementById(`slot-${i}`);
      if (!slot) continue;
      const item = this.buffer[i];
      if (item) {
        slot.classList.add('filled');
        slot.textContent = item;
      } else {
        slot.classList.remove('filled');
        slot.textContent = '';
      }
      // Remove highlight classes after a short delay
      slot.classList.remove('producing', 'consuming');
    }

    // Show in/out pointers
    for (let i = 0; i < this.bufferSize; i++) {
      const slot = document.getElementById(`slot-${i}`);
      if (!slot) continue;
      // Remove old pointers
      slot.querySelectorAll('.slot-pointer').forEach(el => el.remove());
      if (i === this.inIdx) {
        const ptr = document.createElement('span');
        ptr.className = 'slot-pointer in-pointer';
        ptr.textContent = '▼ IN';
        slot.appendChild(ptr);
      }
      if (i === this.outIdx) {
        const ptr = document.createElement('span');
        ptr.className = 'slot-pointer out-pointer';
        ptr.textContent = '▲ OUT';
        slot.appendChild(ptr);
      }
    }
  }

  _highlightSlot(index, type) {
    const slot = document.getElementById(`slot-${index}`);
    if (slot) {
      slot.classList.add(type);
    }
  }

  _updateSemaphoreDisplay() {
    document.getElementById('sem-empty-val').textContent = this.empty ? this.empty.value : this.bufferSize;
    document.getElementById('sem-full-val').textContent = this.full ? this.full.value : 0;
    document.getElementById('sem-mutex-val').textContent = this.mutex ? this.mutex.value : 1;

    // Highlight badges when value changes
    ['sem-empty', 'sem-full', 'sem-mutex'].forEach(cls => {
      const badge = document.querySelector(`.${cls}`);
      if (badge) {
        badge.classList.add('highlight');
        setTimeout(() => badge.classList.remove('highlight'), 300);
      }
    });
  }

  _renderProcessLists() {
    const prodList = document.getElementById('sem-producer-list');
    const consList = document.getElementById('sem-consumer-list');

    prodList.innerHTML = this.producers.map(p =>
      `<div class="proc-chip">` +
        `<span class="state-dot ${p.state}"></span>` +
        `<span class="chip-name">${p.name}</span>` +
        `<span class="chip-status">${p.state}</span>` +
      `</div>`
    ).join('') || '<span style="color:var(--text-muted);font-size:0.72rem">Not started</span>';

    consList.innerHTML = this.consumers.map(c =>
      `<div class="proc-chip">` +
        `<span class="state-dot ${c.state}"></span>` +
        `<span class="chip-name">${c.name}</span>` +
        `<span class="chip-status">${c.state}</span>` +
      `</div>`
    ).join('') || '<span style="color:var(--text-muted);font-size:0.72rem">Not started</span>';

    this._renderBlockedQueue();
  }

  _renderBlockedQueue() {
    const container = document.getElementById('sem-blocked-queue');

    // Collect all blocked processes from semaphore wait queues
    const blocked = [];
    if (this.empty) {
      this.empty.waitQueue.forEach(w => blocked.push({ name: w.process.name, sem: 'empty' }));
    }
    if (this.full) {
      this.full.waitQueue.forEach(w => blocked.push({ name: w.process.name, sem: 'full' }));
    }
    if (this.mutex) {
      this.mutex.waitQueue.forEach(w => blocked.push({ name: w.process.name, sem: 'mutex' }));
    }

    if (blocked.length === 0) {
      container.innerHTML = '<span class="empty-label">No blocked processes</span>';
    } else {
      container.innerHTML = blocked.map(b =>
        `<span class="blocked-chip">${b.name} on ${b.sem}</span>`
      ).join('');
    }
  }
}
