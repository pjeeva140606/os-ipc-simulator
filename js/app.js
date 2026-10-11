/* ============================================
   app.js — Main Application Controller
   Wires together all modules, handles tab
   navigation, and manages global controls.
   ============================================ */

'use strict';

(function () {
  // ── Initialize shared event log ──
  const eventLog = new EventLog('event-log');
  eventLog.log('IPC Simulator initialized. Choose a module and press Start.', 'system');

  // ── Initialize modules ──
  const messagePassing = new MessagePassingModule(eventLog);
  const semaphoreModule = new SemaphoreModule(eventLog);
  const sharedMemory = new SharedMemoryModule(eventLog);

  // Track which module is currently active
  let activeTab = 'message-passing';

  /* ──────────────────────────────────────────
     TAB NAVIGATION
     ────────────────────────────────────────── */
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      activeTab = tabId;

      // Update button active states
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide tab content with animation
      tabContents.forEach(tc => {
        tc.classList.remove('active');
        if (tc.id === `tab-${tabId}`) {
          tc.classList.add('active');
        }
      });

      eventLog.log(`Switched to ${btn.textContent.trim()} tab`, 'system');
    });
  });

  /* ──────────────────────────────────────────
     GLOBAL CONTROLS
     Mapped to the currently active module.
     ────────────────────────────────────────── */

  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStep = document.getElementById('btn-step');
  const btnReset = document.getElementById('btn-reset');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');

  // Speed slider
  speedSlider.addEventListener('input', () => {
    const val = parseInt(speedSlider.value);
    speedValue.textContent = val + '×';
    // Update controllers
    semaphoreModule.controller.speed = val;
    sharedMemory.controller.speed = val;
  });

  // START
  btnStart.addEventListener('click', () => {
    btnStart.disabled = true;
    btnPause.disabled = false;

    if (activeTab === 'semaphores') {
      semaphoreModule.start();
    } else if (activeTab === 'message-passing') {
      // Message passing is event-driven (send button), but we can start auto-demo
      eventLog.log('Message Passing: use Send button or enable Auto-demo', 'system');
    } else if (activeTab === 'shared-memory') {
      // Shared memory has its own Run button
      eventLog.log('Shared Memory: use "Run Race Condition Demo" button', 'system');
    }
  });

  // PAUSE / RESUME
  btnPause.addEventListener('click', () => {
    if (activeTab === 'semaphores') {
      if (semaphoreModule.controller.paused) {
        semaphoreModule.resume();
        btnPause.innerHTML = '<span class="btn-icon">⏸</span> Pause';
        eventLog.log('Resumed', 'system');
      } else {
        semaphoreModule.pause();
        btnPause.innerHTML = '<span class="btn-icon">▶</span> Resume';
        eventLog.log('Paused', 'system');
      }
    }
  });

  // STEP
  btnStep.addEventListener('click', () => {
    if (activeTab === 'semaphores') {
      if (!semaphoreModule.running) {
        semaphoreModule.start();
        semaphoreModule.controller.stepping = true;
        semaphoreModule.controller.pause();
        btnStart.disabled = true;
        btnPause.disabled = false;
        eventLog.log('Step mode: press Step to advance one operation', 'system');
      }
      semaphoreModule.step();
    }
  });

  // RESET
  btnReset.addEventListener('click', () => {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPause.innerHTML = '<span class="btn-icon">⏸</span> Pause';

    if (activeTab === 'message-passing') {
      messagePassing.reset();
    } else if (activeTab === 'semaphores') {
      semaphoreModule.reset();
    } else if (activeTab === 'shared-memory') {
      sharedMemory.reset();
    }

    eventLog.log('Simulation reset', 'system');
  });

  // Clear log button
  document.getElementById('log-clear-btn').addEventListener('click', () => {
    eventLog.clear();
    eventLog.log('Log cleared', 'system');
  });

  /* ──────────────────────────────────────────
     INITIAL UI STATE
     ────────────────────────────────────────── */
  btnPause.disabled = true;

})();
