# IPC Simulator — Inter-Process Communication

An interactive, browser-based simulator demonstrating core IPC mechanisms for an Operating Systems course. No backend, no build step.

🌐 **Live Demo:** [https://pjeeva140606.github.io/os-ipc-simulator/](https://pjeeva140606.github.io/os-ipc-simulator/)  
📁 **Repository:** [https://github.com/pjeeva140606/os-ipc-simulator](https://github.com/pjeeva140606/os-ipc-simulator)

## How to Run


1. Open `index.html` in any modern browser (Chrome, Firefox, Edge).
2. Use the tabs to switch between modules.
3. Use the global controls (Start, Pause, Step, Reset, Speed) and per-module controls.

## Features

### Module 1: Message Passing
- Three processes (P1, P2, P3) with individual mailboxes
- **Send / Receive** primitives with protocol message format (sender, receiver, type, payload, sequence number)
- **Blocking vs Non-Blocking** mode toggle
- **Direct vs Indirect** (shared mailbox) communication
- **ACK / Timeout / Retransmit** protocol with animated indicators
- Animated message packets flying between process nodes
- Auto-demo mode for hands-free demonstration

### Module 2: Semaphores (Producer-Consumer)
- **Counting semaphores** (`empty`, `full`) and **binary semaphore** (`mutex`)
- Full `wait()` / `signal()` implementation with blocked process queues
- Classic **Producer-Consumer** with a bounded buffer
- Adjustable sliders: number of producers, consumers, buffer size, speed
- Live buffer slot visualization with IN/OUT pointers
- Semaphore value badges with real-time updates
- Blocked process queue display

### Module 3: Shared Memory & Race Conditions
- Shared memory counter visible in real time
- **Synchronization ON/OFF** toggle
  - **OFF**: demonstrates race conditions with lost updates
  - **ON**: mutex-protected critical section ensures correctness
- Read → Modify → Write step visualization per process
- **Interleaving timeline** showing the exact execution order
- **Expected vs Actual** value comparison with lost update count
- Progress bars for each process

### Shared UI
- Process state indicators (Ready, Running, Waiting, Blocked, Terminated) with color coding
- Timestamped event log with color-coded entries
- Global controls: Start, Pause, Step, Reset, Speed slider
- "Concept" panel in each tab explaining the theory
- Dark-themed, projector-friendly dashboard

## Suggested 3-Minute Demo Script

### Minute 1 — Message Passing (0:00–1:00)
1. Open the simulator and start on the **Message Passing** tab.
2. Send a message from P1 → P2 with default settings (Blocking + Direct + ACK ON). Point out the message packet animation, the mailbox queue, and the message format display.
3. Toggle to **Non-Blocking** and send another message. Note the sender doesn't wait.
4. Toggle to **Indirect** mode — show messages routing through the shared mailbox.
5. Mention the ACK/timeout/retransmit mechanism (happens ~10% of the time; enable Auto-demo to catch one).

### Minute 2 — Semaphores (1:00–2:00)
1. Switch to the **Semaphores** tab. Set 2 producers, 2 consumers, buffer size 6.
2. Press **Start**. Watch the buffer fill and empty, semaphore values change, and processes cycle through states.
3. Point out the `empty`, `full`, and `mutex` semaphore values.
4. Pause. Show the blocked queue when a consumer blocks on `full` (empty buffer).
5. Use the **Step** button to advance one operation at a time, explaining `wait()` and `signal()`.

### Minute 3 — Shared Memory (2:00–3:00)
1. Switch to the **Shared Memory** tab. Keep Sync **OFF**, set iterations to 20.
2. Click **Run Race Condition Demo**. Watch the interleaving timeline—highlight a WRITE that overwrites another process's value (shown in red).
3. Show the result: Expected vs Actual, with lost updates.
4. **Reset**, toggle Sync **ON**, run again. Now the mutex locks/unlocks, and the result is always correct.
5. Conclude: "This is why we need synchronization in concurrent systems."

## File Structure

```
os-ipc-simulator/
├── index.html            # Main page (single-page app)
├── style.css             # Dark-theme dashboard styles
├── js/
│   ├── utils.js          # Shared: EventLog, Process, SimController
│   ├── messagePassing.js # Module 1: Message Passing
│   ├── semaphores.js     # Module 2: Semaphores
│   ├── sharedMemory.js   # Module 3: Shared Memory
│   └── app.js            # Tab navigation + global controls
└── README.md             # This file
```

## Browser Compatibility

Tested on Chrome 120+, Firefox 120+, Edge 120+. Requires ES2017+ (async/await).
