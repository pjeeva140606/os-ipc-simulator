/* ============================================
   messagePassing.js — Module 1: Message Passing
   Demonstrates send/receive primitives with:
   - Blocking vs Non-Blocking modes
   - Direct vs Indirect (mailbox) communication
   - ACK / timeout / retransmit protocol
   - Animated message packets
   ============================================ */

'use strict';

class MessagePassingModule {
  constructor(eventLog) {
    this.eventLog = eventLog;
    this.controller = new SimController();

    // Three simulated processes, each with its own mailbox (queue)
    this.processes = {
      P1: { id: 'P1', proc: new Process('MP-P1', 'P1'), mailbox: [] },
      P2: { id: 'P2', proc: new Process('MP-P2', 'P2'), mailbox: [] },
      P3: { id: 'P3', proc: new Process('MP-P3', 'P3'), mailbox: [] },
    };

    // Shared mailbox for indirect communication
    this.sharedMailbox = [];

    // Protocol state
    this.seqNum = 0;
    this.isBlocking = true;
    this.isDirect = true;
    this.ackEnabled = true;
    this.autoDemo = false;
    this._autoRunning = false;

    // DOM references
    this.container = document.getElementById('mp-process-container');
    this.sharedMailboxEl = document.getElementById('mp-shared-mailbox');
    this.sharedMailboxQueue = document.getElementById('mp-shared-mailbox-queue');

    this._init();
  }

  _init() {
    // Wire toggle switches
    wireToggle('mp-blocking-on', 'mp-blocking-off', val => {
      this.isBlocking = (val === 'blocking');
      this.eventLog.log(`Mode → ${this.isBlocking ? 'Blocking' : 'Non-Blocking'}`, 'system');
    });

    wireToggle('mp-direct-on', 'mp-direct-off', val => {
      this.isDirect = (val === 'direct');
      this.sharedMailboxEl.classList.toggle('hidden', this.isDirect);
      this.eventLog.log(`Channel → ${this.isDirect ? 'Direct' : 'Indirect (Mailbox)'}`, 'system');
    });

    wireToggle('mp-ack-on', 'mp-ack-off', val => {
      this.ackEnabled = (val === 'on');
      this.eventLog.log(`ACK → ${this.ackEnabled ? 'Enabled' : 'Disabled'}`, 'system');
    });

    wireToggle('mp-auto-on', 'mp-auto-off', val => {
      this.autoDemo = (val === 'on');
      if (this.autoDemo && !this._autoRunning) {
        this._startAutoDemo();
      }
    });

    // Send button
    document.getElementById('mp-send-btn').addEventListener('click', () => {
      this._handleSend();
    });

    // Bind process state changes to UI
    Object.values(this.processes).forEach(p => {
      p.proc.onStateChange((newState) => {
        updateStateDot(document.getElementById(`mp-state-${p.id}`), newState);
        updateProcessChip(p.proc);
      });
      // Initialize state dots and chips
      updateStateDot(document.getElementById(`mp-state-${p.id}`), 'ready');
      updateProcessChip(p.proc);
    });
  }

  /* ──────────────────────────────────────────
     SEND / RECEIVE PRIMITIVES
     ────────────────────────────────────────── */

  /**
   * send(sender, receiver, payload) — the core send primitive.
   *
   * 1. Build a message with protocol fields (sender, receiver, type, payload, seqNum).
   * 2. In DIRECT mode, deliver straight to the receiver's mailbox.
   *    In INDIRECT mode, deposit into the shared mailbox.
   * 3. If BLOCKING, the sender waits for an ACK before continuing.
   * 4. If ACK is enabled, the receiver sends an ACK back.
   *    On timeout, the sender retransmits the message.
   */
  async _send(senderId, receiverId, payload) {
    const sender = this.processes[senderId];
    const receiver = this.processes[receiverId];
    if (!sender || !receiver) return;

    // Build message with protocol header
    const msg = {
      sender: senderId,
      receiver: receiverId,
      type: 'DATA',
      payload: payload,
      seqNum: this.seqNum++,
    };

    this.eventLog.log(
      `<strong>${senderId}</strong> → send(${receiverId}, "${escapeHtml(payload)}", seq=${msg.seqNum})`,
      'info'
    );

    // Update message format display
    this._updateMessageFormat(msg);

    // Sender enters Running state
    sender.proc.setState('running');

    // ─── Animate the data packet ───
    const fromNode = document.getElementById(`mp-node-${senderId}`);
    let toNode;

    if (this.isDirect) {
      toNode = document.getElementById(`mp-node-${receiverId}`);
    } else {
      toNode = this.sharedMailboxEl;
    }

    await animatePacket(
      this.container, fromNode, toNode,
      `📦 seq=${msg.seqNum}`, 'data-packet',
      600 / (this.controller.speedFactor || 1)
    );

    // ─── Deliver the message ───
    if (this.isDirect) {
      // Direct delivery to receiver's mailbox
      receiver.mailbox.push(msg);
      this._renderMailbox(receiverId);
      this.eventLog.log(`${receiverId} mailbox ← DATA seq=${msg.seqNum}`, 'success');
    } else {
      // Indirect: deposit into shared mailbox
      this.sharedMailbox.push(msg);
      this._renderSharedMailbox();
      this.eventLog.log(`Shared mailbox ← DATA seq=${msg.seqNum}`, 'success');

      // Simulate receiver picking up from shared mailbox
      await sleep(300 / (this.controller.speedFactor || 1));
      const idx = this.sharedMailbox.findIndex(m => m.seqNum === msg.seqNum);
      if (idx !== -1) {
        this.sharedMailbox.splice(idx, 1);
        receiver.mailbox.push(msg);
        this._renderSharedMailbox();
        this._renderMailbox(receiverId);

        // Animate from shared mailbox to receiver
        await animatePacket(
          this.container, this.sharedMailboxEl,
          document.getElementById(`mp-node-${receiverId}`),
          `📦 seq=${msg.seqNum}`, 'data-packet',
          400 / (this.controller.speedFactor || 1)
        );
        this.eventLog.log(`${receiverId} ← picked up DATA seq=${msg.seqNum} from shared mailbox`, 'info');
      }
    }

    // ─── Receiver processes the message ───
    receiver.proc.setState('running');
    await sleep(200);
    receiver.proc.setState('ready');

    // ─── ACK / Timeout / Retransmit ───
    if (this.ackEnabled) {
      // Simulate possible timeout (10% chance for demo purposes)
      const willTimeout = Math.random() < 0.1;

      if (this.isBlocking) {
        sender.proc.setState('waiting');
        this.eventLog.log(`${senderId} BLOCKED — waiting for ACK…`, 'warning');
      }

      if (willTimeout) {
        // Timeout scenario
        this.eventLog.log(`⏱ ACK timeout for seq=${msg.seqNum}!`, 'error');
        await sleep(600 / (this.controller.speedFactor || 1));

        // Animate timeout indicator
        await animatePacket(
          this.container,
          document.getElementById(`mp-node-${receiverId}`),
          fromNode,
          `⏱ TIMEOUT`, 'timeout-packet',
          500 / (this.controller.speedFactor || 1)
        );

        // Retransmit
        this.eventLog.log(`${senderId} retransmitting seq=${msg.seqNum}…`, 'warning');
        await animatePacket(
          this.container, fromNode,
          document.getElementById(`mp-node-${receiverId}`),
          `🔄 seq=${msg.seqNum}`, 'data-packet',
          500 / (this.controller.speedFactor || 1)
        );
        this.eventLog.log(`Retransmission of seq=${msg.seqNum} delivered`, 'success');
      }

      // Send ACK back
      const ack = {
        sender: receiverId,
        receiver: senderId,
        type: 'ACK',
        payload: `ACK for seq=${msg.seqNum}`,
        seqNum: msg.seqNum,
      };

      await animatePacket(
        this.container,
        document.getElementById(`mp-node-${receiverId}`),
        fromNode,
        `✓ ACK #${msg.seqNum}`, 'ack-packet',
        500 / (this.controller.speedFactor || 1)
      );

      this._updateMessageFormat(ack);
      this.eventLog.log(
        `${receiverId} → ACK seq=${msg.seqNum} → ${senderId}`,
        'success'
      );

      if (this.isBlocking) {
        sender.proc.setState('ready');
        this.eventLog.log(`${senderId} UNBLOCKED — ACK received`, 'success');
      }
    } else {
      // No ACK
      if (!this.isBlocking) {
        this.eventLog.log(`${senderId} send returned immediately (non-blocking, no ACK)`, 'info');
      }
      sender.proc.setState('ready');
    }

    // Consume message from receiver's mailbox (receive primitive)
    this._receive(receiverId);
  }

  /**
   * receive(processId) — the receive primitive.
   * Dequeues and processes the next message from the process's mailbox.
   */
  _receive(processId) {
    const proc = this.processes[processId];
    if (!proc) return null;

    if (proc.mailbox.length > 0) {
      const msg = proc.mailbox.shift();
      this._renderMailbox(processId);
      this.eventLog.log(
        `${processId} receive() → DATA from ${msg.sender}, payload="${escapeHtml(msg.payload)}"`,
        'info'
      );
      return msg;
    } else {
      if (this.isBlocking) {
        this.eventLog.log(`${processId} receive() — mailbox empty, would BLOCK`, 'warning');
      } else {
        this.eventLog.log(`${processId} receive() — mailbox empty, returns NULL (non-blocking)`, 'info');
      }
      return null;
    }
  }

  /* ──────────────────────────────────────────
     UI HANDLERS
     ────────────────────────────────────────── */

  async _handleSend() {
    const senderId = document.getElementById('mp-sender').value;
    const receiverId = document.getElementById('mp-receiver').value;
    const payload = document.getElementById('mp-payload').value || 'Hello!';

    if (senderId === receiverId) {
      this.eventLog.log('Sender and receiver must be different!', 'error');
      return;
    }

    document.getElementById('mp-send-btn').disabled = true;
    try {
      await this._send(senderId, receiverId, payload);
    } catch (e) {
      if (!(e instanceof CancelledError)) console.error(e);
    }
    document.getElementById('mp-send-btn').disabled = false;
  }

  async _startAutoDemo() {
    this._autoRunning = true;
    const pairs = [
      ['P1', 'P2'], ['P2', 'P3'], ['P3', 'P1'],
      ['P2', 'P1'], ['P1', 'P3'], ['P3', 'P2'],
    ];
    const payloads = ['Hello!', 'Data packet', 'Request', 'Response', 'Ping', 'Update'];
    let idx = 0;

    while (this.autoDemo) {
      const [from, to] = pairs[idx % pairs.length];
      const payload = payloads[idx % payloads.length];
      try {
        await this._send(from, to, payload);
        await sleep(randomDelay(400, 1200));
      } catch (e) {
        break;
      }
      idx++;
    }
    this._autoRunning = false;
  }

  _updateMessageFormat(msg) {
    document.getElementById('mp-fmt-sender').textContent = msg.sender;
    document.getElementById('mp-fmt-receiver').textContent = msg.receiver;
    document.getElementById('mp-fmt-type').textContent = msg.type;
    document.getElementById('mp-fmt-payload').textContent = msg.payload;
    document.getElementById('mp-fmt-seq').textContent = msg.seqNum;
  }

  _renderMailbox(processId) {
    const queue = this.processes[processId].mailbox;
    const el = document.getElementById(`mp-mailbox-${processId}`);
    el.innerHTML = queue.length === 0
      ? '<span style="color:var(--text-muted);font-size:0.65rem">empty</span>'
      : queue.map(m =>
          `<div class="mailbox-msg" title="From: ${m.sender}, Payload: ${escapeHtml(m.payload)}">` +
          `seq=${m.seqNum} from ${m.sender}</div>`
        ).join('');
  }

  _renderSharedMailbox() {
    const el = this.sharedMailboxQueue;
    el.innerHTML = this.sharedMailbox.length === 0
      ? '<span style="color:var(--text-muted);font-size:0.65rem">empty</span>'
      : this.sharedMailbox.map(m =>
          `<div class="mailbox-msg">seq=${m.seqNum} ${m.sender}→${m.receiver}</div>`
        ).join('');
  }

  /** Reset all state for this module */
  reset() {
    this.autoDemo = false;
    this._autoRunning = false;
    this.seqNum = 0;
    this.sharedMailbox = [];

    Object.values(this.processes).forEach(p => {
      p.mailbox = [];
      p.proc.setState('ready');
      this._renderMailbox(p.id);
    });

    this._renderSharedMailbox();
    this._updateMessageFormat({ sender: '—', receiver: '—', type: '—', payload: '—', seqNum: '—' });

    // Reset toggles visually
    document.getElementById('mp-auto-on').classList.remove('active');
    document.getElementById('mp-auto-off').classList.add('active');
  }
}
