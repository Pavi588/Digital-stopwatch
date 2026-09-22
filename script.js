/* ============================================================
   Digital Stopwatch — Synchronous Sequential Circuits
   Architecture:
     Clock          -> generates rising-edge events
     StateMachine    -> pure next-state logic (IDLE/RUNNING/STOPPED)
     Counter         -> MOD-60 seconds/minutes counter
     Stopwatch       -> wires Clock + StateMachine + Counter together,
                        samples button inputs only on the clock edge
     TestRunner      -> runs the 15 test cases against the SAME
                        pure logic used by Stopwatch (stepEdge)
   No part of the counter changes outside a clock edge.
   ============================================================ */

const pad = n => String(n).padStart(2, '0');

/* ---------------- CLOCK ---------------- */
class Clock extends EventTarget {
  constructor(freqHz = 1) {
    super();
    this.freq = freqHz;
    this.state = 'LOW';
    this.pulseCount = 0;
    this._timer = null;
    this._start();
  }
  _start() {
    if (this._timer) clearInterval(this._timer);
    const halfPeriodMs = 1000 / this.freq / 2;
    this._timer = setInterval(() => this._halfTick(), halfPeriodMs);
  }
  setFrequency(hz) {
    this.freq = hz;
    this._start();
  }
  _halfTick() {
    this.state = this.state === 'LOW' ? 'HIGH' : 'LOW';
    if (this.state === 'HIGH') {
      this.pulseCount++;
      this.dispatchEvent(new CustomEvent('risingedge', { detail: { count: this.pulseCount } }));
    }
    this.dispatchEvent(new CustomEvent('tick', { detail: { state: this.state } }));
  }
}

/* ---------------- STATE MACHINE (pure next-state logic) ---------------- */
class StateMachine {
  static nextState(state, inputs) {
    const { start = false, stop = false, reset = false } = inputs;
    if (reset) return 'IDLE';
    if (state === 'IDLE' && start) return 'RUNNING';
    if (state === 'RUNNING' && stop) return 'STOPPED';
    if (state === 'STOPPED' && start) return 'RUNNING';
    return state; // no valid transition -> hold
  }
  static encode(state) {
    return { IDLE: '00', RUNNING: '01', STOPPED: '10' }[state];
  }
}

/* ---------------- COUNTER (MOD-60) ---------------- */
class Counter {
  constructor() { this.seconds = 0; this.minutes = 0; }
  tick() {
    let overflow = false;
    this.seconds++;
    if (this.seconds >= 60) {
      this.seconds = 0;
      this.minutes = (this.minutes + 1) % 60;
      overflow = true;
    }
    return { seconds: this.seconds, minutes: this.minutes, overflow };
  }
  reset() { this.seconds = 0; this.minutes = 0; }
  display() { return `${pad(this.minutes)} : ${pad(this.seconds)}`; }
}

/* ---------------- PURE EDGE STEP (shared by Stopwatch + TestRunner) ----------------
   Reset has priority and takes effect immediately at the edge (synchronous clear).
   Counter enable = (state BEFORE this edge === RUNNING) — combinational logic that
   was already valid before the edge arrived; this is why the very first edge after
   START does not itself increment the counter. */
function stepEdge(state, counterState, inputs) {
  if (inputs.reset) {
    return { state: 'IDLE', seconds: 0, minutes: 0, overflow: false, enabled: false };
  }
  const enabled = state === 'RUNNING';
  let seconds = counterState.seconds, minutes = counterState.minutes, overflow = false;
  if (enabled) {
    seconds++;
    if (seconds >= 60) { seconds = 0; minutes = (minutes + 1) % 60; overflow = true; }
  }
  const nextState = StateMachine.nextState(state, inputs);
  return { state: nextState, seconds, minutes, overflow, enabled };
}

/* ================================================================
   STOPWATCH — live instance driven by the real Clock
   ================================================================ */
class Stopwatch {
  constructor(clock) {
    this.clock = clock;
    this.state = 'IDLE';
    this.counter = new Counter();
    this.pending = { start: false, stop: false, reset: false };
    this.laps = [];
    this.log = [];
    this.history = []; // last N edges: {pulse, start, stop, reset, enabled}
    this.listeners = [];
    clock.addEventListener('risingedge', () => this._onEdge());
  }
  on(fn) { this.listeners.push(fn); }
  _emit() { this.listeners.forEach(fn => fn(this)); }
  _logMsg(msg) {
    const t = new Date();
    const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    this.log.push({ ts, msg });
    if (this.log.length > 200) this.log.shift();
  }
  requestStart() { if (!this.pending.start) this._logMsg('START pressed'); this.pending.start = true; }
  requestStop()  { if (!this.pending.stop) this._logMsg('STOP pressed');  this.pending.stop = true; }
  requestReset() { if (!this.pending.reset) this._logMsg('RESET pressed'); this.pending.reset = true; }
  requestLap() {
    if (this.state !== 'RUNNING') { this._logMsg('LAP ignored (not running)'); this._emit(); return; }
    this.laps.push(this.counter.display());
    this._logMsg(`LAP recorded: ${this.counter.display()}`);
    this._emit();
  }
  _onEdge() {
    const prevState = this.state;
    const result = stepEdge(this.state, this.counter, this.pending);
    this.counter.seconds = result.seconds;
    this.counter.minutes = result.minutes;
    this.state = result.state;

    if (prevState !== this.state) {
      this._logMsg(`State: ${prevState} → ${this.state}`);
    }
    if (result.enabled) {
      const before = pad(result.overflow ? (result.minutes === 0 ? 59 : result.minutes - 1) : result.minutes);
      this._logMsg('Rising edge detected');
      this._logMsg(`Second counter: ${pad(result.overflow ? 59 : result.seconds - 1)} → ${pad(result.seconds)}`);
      if (result.overflow) this._logMsg(`Minute counter: ${before} → ${pad(result.minutes)} (overflow)`);
    }
    if (this.pending.reset) this._logMsg('Counters cleared, state → IDLE');

    this.history.push({
      pulse: this.clock.pulseCount,
      start: this.pending.start, stop: this.pending.stop, reset: this.pending.reset,
      enabled: result.enabled
    });
    if (this.history.length > 16) this.history.shift();

    this.pending = { start: false, stop: false, reset: false };
    this._emit();
  }
}

/* ================================================================
   TEST RUNNER — 15 deterministic tests against the pure stepEdge logic
   ================================================================ */
class TestRunner {
  static cases() {
    const run = (state, counter, inputSeq) => {
      let s = state, c = { ...counter };
      let overflowSeen = false;
      for (const inputs of inputSeq) {
        const r = stepEdge(s, c, inputs);
        s = r.state; c = { seconds: r.seconds, minutes: r.minutes };
        overflowSeen = overflowSeen || r.overflow;
      }
      return { state: s, seconds: c.seconds, minutes: c.minutes, overflow: overflowSeen };
    };
    const noInput = () => ({ start: false, stop: false, reset: false });
    const fmt = r => `${r.state}, ${pad(r.minutes)}:${pad(r.seconds)}`;

    const tests = [];

    tests.push({ id: 'TC01', desc: 'Reset stopwatch',
      input: 'RESET while RUNNING (01:25)',
      run: () => run('RUNNING', { seconds: 25, minutes: 1 }, [{ ...noInput(), reset: true }]),
      expected: 'IDLE, 00:00' });

    tests.push({ id: 'TC02', desc: 'Start from IDLE',
      input: 'START while IDLE',
      run: () => run('IDLE', { seconds: 0, minutes: 0 }, [{ ...noInput(), start: true }]),
      expected: 'RUNNING, 00:00' });

    tests.push({ id: 'TC03', desc: 'One clock pulse',
      input: '1 edge while RUNNING (sec=05)',
      run: () => run('RUNNING', { seconds: 5, minutes: 0 }, [noInput()]),
      expected: 'RUNNING, 00:06' });

    tests.push({ id: 'TC04', desc: 'Five clock pulses',
      input: '5 edges while RUNNING (sec=00)',
      run: () => run('RUNNING', { seconds: 0, minutes: 0 }, Array(5).fill(noInput())),
      expected: 'RUNNING, 00:05' });

    tests.push({ id: 'TC05', desc: 'Stop while running',
      input: 'STOP while RUNNING (sec=10)',
      run: () => run('RUNNING', { seconds: 10, minutes: 0 }, [{ ...noInput(), stop: true }]),
      expected: 'STOPPED, 00:11' });

    tests.push({ id: 'TC06', desc: 'Restart after stop',
      input: 'START while STOPPED (sec=15)',
      run: () => run('STOPPED', { seconds: 15, minutes: 0 }, [{ ...noInput(), start: true }]),
      expected: 'RUNNING, 00:15' });

    tests.push({ id: 'TC07', desc: 'Reset while running',
      input: 'RESET while RUNNING (sec=30)',
      run: () => run('RUNNING', { seconds: 30, minutes: 0 }, [{ ...noInput(), reset: true }]),
      expected: 'IDLE, 00:00' });

    tests.push({ id: 'TC08', desc: 'Reset while stopped',
      input: 'RESET while STOPPED (sec=20)',
      run: () => run('STOPPED', { seconds: 20, minutes: 0 }, [{ ...noInput(), reset: true }]),
      expected: 'IDLE, 00:00' });

    tests.push({ id: 'TC09', desc: 'Lap operation',
      input: 'LAP snapshot while RUNNING (01:02)',
      run: () => {
        const c = { seconds: 2, minutes: 1 };
        const lap = `${pad(c.minutes)} : ${pad(c.seconds)}`;
        c.seconds = 9; // counter keeps moving after the lap was taken
        return { state: 'RUNNING', seconds: c.seconds, minutes: c.minutes, lap };
      },
      customCheck: (actual) => actual.lap === '01 : 02' && actual.seconds === 9,
      expected: 'Lap = "01 : 02", counter unaffected',
      actualFmt: (r) => `Lap = "${r.lap}", ${fmt(r)}` });

    tests.push({ id: 'TC10', desc: '60-second overflow',
      input: '1 edge while RUNNING (sec=59)',
      run: () => run('RUNNING', { seconds: 59, minutes: 0 }, [noInput()]),
      expected: 'RUNNING, 01:00 (overflow)',
      actualFmt: (r) => `${fmt(r)}${r.overflow ? ' (overflow)' : ''}` });

    tests.push({ id: 'FC01', desc: 'STOP while IDLE',
      input: 'STOP while IDLE',
      run: () => run('IDLE', { seconds: 0, minutes: 0 }, [{ ...noInput(), stop: true }]),
      expected: 'IDLE, 00:00 (no transition)',
      actualFmt: (r) => `${fmt(r)}${r.state === 'IDLE' ? ' (no transition)' : ''}` });

    tests.push({ id: 'FC02', desc: 'START clicked repeatedly',
      input: 'START, then START again (2 edges)',
      run: () => run('IDLE', { seconds: 0, minutes: 0 }, [{ ...noInput(), start: true }, { ...noInput(), start: true }]),
      expected: 'RUNNING, 00:01 (single transition, no duplicate timer)',
      actualFmt: (r) => `${fmt(r)} (single transition, no duplicate timer)` });

    tests.push({ id: 'FC03', desc: 'RESET clicked repeatedly',
      input: 'RESET, then RESET again',
      run: () => run('IDLE', { seconds: 0, minutes: 0 }, [{ ...noInput(), reset: true }, { ...noInput(), reset: true }]),
      expected: 'IDLE, 00:00' });

    tests.push({ id: 'FC04', desc: 'LAP at 00:00',
      input: 'LAP snapshot at 00:00',
      run: () => ({ state: 'RUNNING', seconds: 0, minutes: 0, lap: '00 : 00' }),
      customCheck: (actual) => actual.lap === '00 : 00',
      expected: 'Lap = "00 : 00", no error',
      actualFmt: (r) => `Lap = "${r.lap}", no error` });

    tests.push({ id: 'FC05', desc: 'Counter overflow at 59:59',
      input: '1 edge while RUNNING (59:59)',
      run: () => run('RUNNING', { seconds: 59, minutes: 59 }, [noInput()]),
      expected: 'RUNNING, 00:00 (minute wraps too)',
      actualFmt: (r) => `${fmt(r)}${r.overflow ? ' (minute wraps too)' : ''}` });

    return tests;
  }

  static runAll() {
    const rows = this.cases().map(tc => {
      const actual = tc.run();
      const actualStr = tc.actualFmt ? tc.actualFmt(actual) :
        `${actual.state}, ${pad(actual.minutes)}:${pad(actual.seconds)}`;
      const pass = tc.customCheck ? tc.customCheck(actual) : actualStr === tc.expected;
      return { id: tc.id, desc: tc.desc, input: tc.input, expected: tc.expected, actual: actualStr, pass };
    });
    return rows;
  }
}

/* ================================================================
   UI WIRING
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* -------- launch simulator button -------- */
  document.getElementById('launchSimBtn').addEventListener('click', () => {
    document.getElementById('simulator').scrollIntoView({ behavior: 'smooth' });
  });

  /* -------- clock + stopwatch instances -------- */
  const clock = new Clock(1);
  const sw = new Stopwatch(clock);

  /* -------- clock simulation panel -------- */
  const clockFreqDisplay = document.getElementById('clockFreqDisplay');
  const clockStateDisplay = document.getElementById('clockStateDisplay');
  const clockPulseDisplay = document.getElementById('clockPulseDisplay');
  const edgeFlag = document.getElementById('edgeFlag');
  const waveTrack = document.getElementById('waveTrack');

  document.querySelectorAll('.freq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const hz = Number(btn.dataset.freq);
      clock.setFrequency(hz);
      clockFreqDisplay.textContent = `${hz} Hz`;
    });
  });

  let waveBars = [];
  function pushWaveBar(high) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    bar.style.left = `${waveBars.length * 14}px`;
    bar.style.height = high ? '55px' : '4px';
    waveTrack.appendChild(bar);
    waveBars.push(bar);
    if (waveBars.length > 55) { waveTrack.removeChild(waveBars.shift()); waveBars.forEach((b, i) => b.style.left = `${i * 14}px`); }
  }

  clock.addEventListener('tick', (e) => {
    clockStateDisplay.textContent = e.detail.state;
    pushWaveBar(e.detail.state === 'HIGH');
  });
  clock.addEventListener('risingedge', (e) => {
    clockPulseDisplay.textContent = String(e.detail.count).padStart(4, '0');
    edgeFlag.classList.add('show');
    setTimeout(() => edgeFlag.classList.remove('show'), 220);
    flashBlockDiagram();
  });

  /* -------- block diagram pulse animation -------- */
  const clockPulseDot = document.getElementById('clockPulseDot');
  const arrows = [document.getElementById('arrow1'), document.getElementById('arrow2'), document.getElementById('arrow3')];
  const blocks = [document.getElementById('blk-clock'), document.getElementById('blk-register'), document.getElementById('blk-counter'), document.getElementById('blk-display')];
  function flashBlockDiagram() {
    clockPulseDot.classList.add('on');
    blocks[0].classList.add('active');
    setTimeout(() => { clockPulseDot.classList.remove('on'); blocks[0].classList.remove('active'); }, 200);
    arrows.forEach((arrow, i) => {
      setTimeout(() => {
        arrow.classList.remove('flowing'); void arrow.offsetWidth; arrow.classList.add('flowing');
        blocks[i + 1].classList.add('active');
        setTimeout(() => blocks[i + 1].classList.remove('active'), 250);
      }, i * 160);
    });
  }

  /* -------- FSM + register -------- */
  const nodeIdle = document.getElementById('node-idle');
  const nodeRunning = document.getElementById('node-running');
  const nodeStopped = document.getElementById('node-stopped');
  const stateEncoded = document.getElementById('stateEncoded');
  const stateDecoded = document.getElementById('stateDecoded');
  const statePill = document.getElementById('statePill');

  function renderFSM(state) {
    [nodeIdle, nodeRunning, nodeStopped].forEach(n => n.classList.remove('active'));
    ({ IDLE: nodeIdle, RUNNING: nodeRunning, STOPPED: nodeStopped }[state]).classList.add('active');
    stateEncoded.textContent = StateMachine.encode(state);
    stateDecoded.textContent = state;
    statePill.textContent = state;
  }

  /* -------- counters -------- */
  const secCounterVal = document.getElementById('secCounterVal');
  const minCounterVal = document.getElementById('minCounterVal');
  const overflowArrow = document.getElementById('overflowArrow');
  const mainDisplay = document.getElementById('mainDisplay');

  /* -------- laps -------- */
  const lapTableBody = document.querySelector('#lapTable tbody');
  const lapEmpty = document.getElementById('lapEmpty');

  /* -------- event log -------- */
  const eventLog = document.getElementById('eventLog');
  function renderLog() {
    eventLog.innerHTML = sw.log.slice(-60).map(l => `<div><span class="ts">[${l.ts}]</span> ${l.msg}</div>`).join('');
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  /* -------- timing diagram -------- */
  const timingCanvas = document.getElementById('timingCanvas');
  const tctx = timingCanvas.getContext('2d');
  function drawTiming() {
    const rows = ['CLOCK', 'START', 'STOP', 'RESET', 'ENABLE'];
    const w = timingCanvas.width, h = timingCanvas.height;
    tctx.clearRect(0, 0, w, h);
    tctx.fillStyle = '#0A0E14'; tctx.fillRect(0, 0, w, h);
    const hist = sw.history.length ? sw.history : [{ pulse: 0, start: false, stop: false, reset: false, enabled: false }];
    const n = Math.max(hist.length, 8);
    const stepW = (w - 110) / n;
    const rowH = h / rows.length;
    tctx.font = '12px JetBrains Mono, monospace';
    rows.forEach((label, ri) => {
      const y0 = ri * rowH + rowH * 0.25;
      const y1 = ri * rowH + rowH * 0.75;
      tctx.strokeStyle = '#232C40'; tctx.fillStyle = '#8892A6';
      tctx.fillText(label, 4, (y0 + y1) / 2 + 4);
      tctx.beginPath();
      let x = 105;
      hist.forEach((edge, i) => {
        let high;
        if (label === 'CLOCK') high = true; // a pulse occurred at every recorded edge
        else if (label === 'START') high = edge.start;
        else if (label === 'STOP') high = edge.stop;
        else if (label === 'RESET') high = edge.reset;
        else high = edge.enabled;
        const y = high ? y0 : y1;
        if (i === 0) tctx.moveTo(x, y); else tctx.lineTo(x, y);
        tctx.lineTo(x + stepW, y);
        x += stepW;
      });
      tctx.strokeStyle = label === 'CLOCK' ? '#5CE1E6' : (label === 'ENABLE' ? '#6BCB77' : '#FFB454');
      tctx.lineWidth = 2;
      tctx.stroke();
    });
  }

  /* -------- results section -------- */
  const resFinalState = document.getElementById('resFinalState');
  const resFinalTime = document.getElementById('resFinalTime');
  const resPulses = document.getElementById('resPulses');

  /* -------- full UI refresh, called on every stopwatch update -------- */
  function refreshUI() {
    mainDisplay.textContent = sw.counter.display();
    secCounterVal.textContent = pad(sw.counter.seconds);
    minCounterVal.textContent = pad(sw.counter.minutes);
    renderFSM(sw.state);
    renderLog();
    drawTiming();

    lapTableBody.innerHTML = sw.laps.map((t, i) => `<tr><td>${i + 1}</td><td>${t}</td></tr>`).join('');
    lapEmpty.style.display = sw.laps.length ? 'none' : 'block';

    startBtn.disabled = sw.state === 'RUNNING';
    stopBtn.disabled = sw.state !== 'RUNNING';

    resFinalState.textContent = sw.state;
    resFinalTime.textContent = sw.counter.display().replace(' ', '');
    resPulses.textContent = clock.pulseCount;
  }
  sw.on(refreshUI);

  /* -------- buttons -------- */
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const lapBtn = document.getElementById('lapBtn');
  startBtn.addEventListener('click', () => sw.requestStart());
  stopBtn.addEventListener('click', () => sw.requestStop());
  resetBtn.addEventListener('click', () => sw.requestReset());
  lapBtn.addEventListener('click', () => sw.requestLap());

  sw._logMsg('System initialized');
  refreshUI();
  setInterval(drawTiming, 1000); // keep the diagram fresh even without new edges

  /* ================================================================
     TEST CASES UI
     ================================================================ */
  const testTableBody = document.querySelector('#testTable tbody');
  const totalTestsEl = document.getElementById('totalTests');
  const passedTestsEl = document.getElementById('passedTests');
  const failedTestsEl = document.getElementById('failedTests');
  const testCaseStatus = document.getElementById('testCaseStatus');
  const resTotalTests = document.getElementById('resTotalTests');
  const resPassed = document.getElementById('resPassed');
  const resFailed = document.getElementById('resFailed');

  let lastTestRows = [];

  function renderTests(rows) {
    testTableBody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.input}</td>
        <td>${r.expected}</td>
        <td>${r.actual}</td>
        <td class="${r.pass ? 'result-pass' : 'result-fail'}">${r.pass ? 'PASS' : 'FAIL'}</td>
      </tr>`).join('');
    const passed = rows.filter(r => r.pass).length;
    const failed = rows.length - passed;
    totalTestsEl.textContent = rows.length;
    passedTestsEl.textContent = passed;
    failedTestsEl.textContent = failed;
    testCaseStatus.innerHTML = failed === 0
      ? `<span class="ok">All ${rows.length} tests passed</span>`
      : `<span style="color:var(--red)">${failed} test(s) failed</span>`;
    resTotalTests.textContent = rows.length;
    resPassed.textContent = passed;
    resFailed.textContent = failed;
    renderDataset(rows);
  }

  document.getElementById('runTestsBtn').addEventListener('click', () => {
    lastTestRows = TestRunner.runAll();
    renderTests(lastTestRows);
  });
  document.getElementById('resetTestsBtn').addEventListener('click', () => {
    lastTestRows = [];
    testTableBody.innerHTML = '';
    passedTestsEl.textContent = '—';
    failedTestsEl.textContent = '—';
    testCaseStatus.textContent = 'Not run yet';
    resPassed.textContent = '—';
    resFailed.textContent = '—';
    const dctx = datasetChart.getContext('2d');
    dctx.clearRect(0, 0, datasetChart.width, datasetChart.height);
    document.querySelector('#datasetTable tbody').innerHTML = '';
  });

  /* ================================================================
     SYNTHETIC DATASET + CHART (section 19)
     ================================================================ */
  const datasetChart = document.getElementById('datasetChart');

  function renderDataset(testRows) {
    // Build a reproducible synthetic dataset from the test cases themselves
    const cases = TestRunner.cases();
    const tbody = document.querySelector('#datasetTable tbody');
    tbody.innerHTML = testRows.map((r, i) => {
      const tc = cases[i];
      const before = tc.input;
      return `<tr>
        <td>${r.id}</td><td>${i + 1}</td>
        <td>${before.includes('IDLE') ? 'IDLE' : before.includes('STOPPED') ? 'STOPPED' : 'RUNNING'}</td>
        <td>${before.includes('START') ? 1 : 0}</td>
        <td>${before.includes('STOP') && !before.includes('STOPPED') ? 1 : 0}</td>
        <td>${before.includes('RESET') ? 1 : 0}</td>
        <td>${(r.actual.match(/(\d{2}):(\d{2})/) || [,'00','00'])[2]}</td>
        <td>${(r.actual.match(/(\d{2}):(\d{2})/) || [,'00','00'])[1]}</td>
        <td>${r.actual.split(',')[0]}</td>
        <td>${r.expected}</td>
        <td>${r.actual}</td>
        <td class="${r.pass ? 'result-pass' : 'result-fail'}">${r.pass ? 'PASS' : 'FAIL'}</td>
      </tr>`;
    }).join('');

    // Chart: clock pulses vs counter value, using a clean 20-pulse RUNNING sequence
    let state = 'RUNNING', counter = { seconds: 0, minutes: 0 };
    const series = [0];
    for (let p = 1; p <= 20; p++) {
      const r = stepEdge(state, counter, { start: false, stop: false, reset: false });
      state = r.state; counter = { seconds: r.seconds, minutes: r.minutes };
      series.push(counter.seconds);
    }
    const ctx = datasetChart.getContext('2d');
    const w = datasetChart.width, h = datasetChart.height, pad_ = 40;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0A0E14'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#232C40'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad_, 10); ctx.lineTo(pad_, h - pad_); ctx.lineTo(w - 10, h - pad_); ctx.stroke();
    ctx.fillStyle = '#8892A6'; ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText('Counter (s)', 4, 14);
    ctx.fillText('Clock Pulses →', w - 110, h - 10);
    const maxY = 21, stepX = (w - pad_ - 20) / (series.length - 1);
    ctx.beginPath();
    series.forEach((v, i) => {
      const x = pad_ + i * stepX;
      const y = (h - pad_) - (v / maxY) * (h - pad_ - 20);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#FFB454'; ctx.lineWidth = 2; ctx.stroke();
    series.forEach((v, i) => {
      const x = pad_ + i * stepX;
      const y = (h - pad_) - (v / maxY) * (h - pad_ - 20);
      ctx.fillStyle = '#5CE1E6';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  drawTiming();
});
