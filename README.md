# Digital Stopwatch using Synchronous Sequential Circuits

**Course:** EC2201 — Digital Electronics
**Type:** Browser-based simulation (HTML5 + CSS3 + vanilla JavaScript, no backend, no frameworks)

---

## Problem Statement

Manual timing is not accurate for many applications. A digital stopwatch provides
accurate elapsed-time measurement using digital circuits instead of human reaction time.

## Objective

Design and simulate a stopwatch using **synchronous sequential logic**, where every
state change and every counter increment is synchronized to a common clock signal —
nothing changes except on an active clock edge.

## Digital Electronics Concepts Demonstrated

- **Sequential circuit** — a circuit whose output depends on both current inputs and
  the stored history of past inputs (the current state).
- **Synchronous circuit** — all stored elements (the state register, the counters)
  update together, gated by the same clock signal, rather than changing the instant
  an input changes.
- **Clock** — the `Clock` class generates a periodic square wave (`LOW ⇄ HIGH`) and
  fires a `risingedge` event on every `LOW → HIGH` transition. This is the only thing
  in the whole application that is time-driven; everything else reacts to it.
- **Flip-flop / state register** — represented by `Stopwatch.state`, which only ever
  changes inside the `risingedge` handler, i.e. only at a clock edge — conceptually
  the same behaviour as a D flip-flop bank storing the current FSM state.
- **Finite State Machine (FSM)** — `StateMachine.nextState(state, inputs)` is a pure
  combinational function implementing the next-state logic for the three states
  `IDLE`, `RUNNING`, `STOPPED`.
- **Counters** — `Counter` is a MOD-60 seconds counter cascaded into a MOD-60 minutes
  counter (seconds overflow ripples into minutes), matching a standard two-decade
  BCD/MOD-60 counter pair used in real stopwatch ICs.
- **MOD-60 counter** — seconds and minutes both wrap `59 → 00` and assert an
  overflow/carry signal into the next stage, visualised in the "Counter Module"
  section.
- **State transitions** — enumerated fully in the Truth Table and State Machine
  sections of the site (`IDLE+START→RUNNING`, `RUNNING+STOP→STOPPED`,
  `RUNNING+RESET→IDLE`, `STOPPED+START→RUNNING`, `STOPPED+RESET→IDLE`).

> This is a **software simulation** of the above digital-logic concepts running in a
> browser. It does not claim to contain physical flip-flop hardware.

## Architecture

```
Current State + Inputs
        │
        ▼
 Next-State Logic  (StateMachine.nextState — pure function)
        │
        ▼
 Clock Rising Edge (Clock — EventTarget firing 'risingedge')
        │
        ▼
 State Register    (Stopwatch.state — updated only inside the edge handler)
        │
        ▼
 Counter           (Counter — MOD-60 seconds/minutes, ticked only when enabled)
        │
        ▼
 Display           (DOM text content driven from Stopwatch state)
```

JavaScript is split into five cooperating units in `script.js`:

| Class          | Responsibility                                                        |
|----------------|------------------------------------------------------------------------|
| `Clock`        | Generates the periodic clock signal and `risingedge` / `tick` events.  |
| `StateMachine` | Pure next-state logic for IDLE / RUNNING / STOPPED.                    |
| `Counter`      | MOD-60 seconds counter cascaded into a MOD-60 minutes counter.         |
| `Stopwatch`    | Wires Clock + StateMachine + Counter together; samples START/STOP/RESET only on the clock edge; keeps the lap list and event log. |
| `TestRunner`   | Runs the 15 test cases directly against the same pure `stepEdge` logic used by `Stopwatch`, so results are deterministic and not timer-dependent. |

Button presses (`START`/`STOP`/`RESET`) only *latch* a request. The actual state
transition and counter update happen the next time `Clock` fires a `risingedge`
event — this is what makes the design synchronous rather than an ad-hoc
`setInterval(() => seconds++, 1000)` timer.

## Input Format

| Input | Meaning |
|-------|---------|
| `START` | Begin/resume counting (`IDLE→RUNNING` or `STOPPED→RUNNING`) |
| `STOP`  | Pause counting (`RUNNING→STOPPED`) |
| `RESET` | Clear counters and return to `IDLE` from any state |
| `CLOCK` | The periodic signal (1/2/5 Hz, selectable) that drives every update |

## Output Format

- **`MM : SS`** elapsed-time display (7-segment-inspired digital readout)
- **Current State** — `IDLE` / `RUNNING` / `STOPPED`, also shown encoded (`00`/`01`/`10`)
- **Counter Values** — separate seconds and minutes counters (MOD-60 each)

## How to Run

1. Download/copy the `digital-stopwatch` folder (`index.html`, `style.css`, `script.js`, this `README.md`) so all four files sit in the same folder.
2. Double-click `index.html` (or open it from your browser: File → Open).
3. No server, build step, install, or internet connection is required.

## Test Cases

**10 normal cases (TC01–TC10):** reset, start from idle, one clock pulse, five clock
pulses, stop while running, restart after stop, reset while running, reset while
stopped, lap operation, 60-second overflow.

**5 edge/fault cases (FC01–FC05):** STOP while IDLE (no valid transition), repeated
START clicks (no duplicate timer), repeated RESET clicks (stable, no error), LAP at
00:00, counter overflow at 59:59 (minutes wraps too).

Each test reports **Test ID, Input, Expected Output, Actual Output, PASS/FAIL**, and
is computed by running the site's real `stepEdge` logic — nothing is hard-coded or
randomised. Click **RUN ALL TESTS** on the Test Cases section to execute them.

## Assumptions

1. The simulation uses a software-generated clock.
2. Default clock frequency is 1 Hz.
3. The stopwatch uses MM:SS display.
4. Seconds counter is MOD-60.
5. Minutes counter is MOD-60.
6. Counter changes only on the rising edge of the clock.
7. START enables counting.
8. STOP holds the current count.
9. RESET clears the counters and returns the system to IDLE.

## Expected Result

The simulation demonstrates that a stopwatch is fundamentally a **synchronous
sequential circuit**: a clock generator, a state register (FSM), and a cascaded
MOD-60 counter, all updating together on the same clock edge, driving a display.
Running **RUN ALL TESTS** should report **15/15 PASS**, confirming the next-state
logic and counter logic behave exactly as specified in the truth table.

---

## How to Demonstrate in a College Presentation

1. Open **Home** and describe the three building blocks (Clock, State Register, Counter).
2. Scroll to **Synchronous Sequential Logic Model** and explain the block diagram —
   click **START** in the simulator further down and point out the pulse animating
   through Clock → State Register → Counter → Display on every edge.
3. Show the **Clock Simulation** panel, switch between 1/2/5 Hz, and point at the
   waveform and pulse counter.
4. Demonstrate **START / STOP / RESET / LAP** in the **Stopwatch Simulator** while
   narrating the **State Machine** panel highlighting the active state.
5. Show the **Counters** section and let it run past `59 → 00` to demonstrate MOD-60
   overflow into the minutes counter.
6. Open the **Truth Table** and **Timing Diagram** and relate them to what just
   happened on screen.
7. Click **RUN ALL TESTS** in **Test Cases** live, in front of the examiner, to show
   15/15 PASS computed from real code, not hard-coded results.
8. Close with the **Results** section summarising the whole system.

## Code Map (which part implements what)

| Concept | Where in the code |
|---|---|
| Clock | `class Clock` in `script.js` — `_halfTick()` toggles LOW/HIGH and dispatches `risingedge` |
| State Register | `Stopwatch.state`, mutated only inside `Stopwatch._onEdge()` |
| FSM / next-state logic | `class StateMachine`, `StateMachine.nextState()` |
| Counter (MOD-60) | `class Counter`, `Counter.tick()` |
| Synchronous edge step (shared by live app and tests) | `function stepEdge()` |
| Display logic | `refreshUI()` in the DOMContentLoaded block, writing to `#mainDisplay`, `#secCounterVal`, `#minCounterVal` |
| Test harness | `class TestRunner`, `TestRunner.cases()` / `TestRunner.runAll()` |
