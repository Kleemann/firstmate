# Emitted supervision protocol (live run of bin/fm-supervision-instructions.sh)

## $ bin/fm-supervision-instructions.sh --harness claude
```
================================================================================
SUPERVISION OPERATING INSTRUCTIONS - primary harness: claude
================================================================================
Current state:
- Lock: held by this session; this session owns normal supervision unless away mode says otherwise.
- Away/quiet mode: inactive.
- X mode: inactive; use the default watcher cadence.
- Ordinary wake: the Stop-owned auto-arm (bin/fm-claude-stop-autoarm.sh) already owns watcher continuity; drain and handle the wake, and do not arm another cycle yourself.

Mode: Claude Stop-hook-owned supervision.

When this session owns supervision and away mode is not active:
1. Drain first with `bin/fm-wake-drain.sh`.
   After handling all emitted wakes and reconciling open decisions and unread status lines, run the exact `--ack-through` command printed as `WAKE_ACK_REQUIRED`; until then the work remains durable for idempotent re-handling after interruption.
2. Routine watcher arm and re-arm are owned by the Stop `asyncRewake` hook (`bin/fm-claude-stop-autoarm.sh`), never by you.
   Every turn end while supervision is needed launches or attaches one home-scoped watcher cycle with no model command and no model tokens.
   An actionable close wakes you through the hook's exit-2 rewake, delivered as a `Stop hook feedback` message.
3. On a `Stop hook feedback` wake (`signal:`, `stale:`, `check:`, or `heartbeat`), run `bin/fm-wake-drain.sh` first and handle the wake.
   Do not run `bin/fm-watch-arm.sh` after an ordinary wake; the next turn end re-arms automatically when supervision is still needed.
   Do not invent a wake from an attach-status line alone; drain and act only on real wake records, the drain's `OPEN DECISIONS` and `UNREAD STATUS` entries, or a real watcher reason line.
4. On the one `Stop hook feedback` automatic-mechanism failure notice (`firstmate watcher auto-arm FAILED ...`), drain, inspect the automatic mechanism failure, and do not turn the notice into a repeating manual-arm loop.
5. If the Stop hook does not claim the home or reports an exhausted failure, inspect its registration and watcher startup path before ending blind.
   Keep the Stop-owned automatic mechanism as the only Claude arm owner.
6. Treat `watcher: started ...` and `watcher: attached ...` inside automatic arm output as proof that one live cycle exists.
   On attach, the arm follows verified identity-matched successors instead of exiting when the first cycle ends.
7. The durable wake queue preserves actionable events between a rewake and the next Stop-launched arm, while the bounded turn-end guard prevents a blind Stop when recovery did not start.
   No PreToolUse hook denies fleet commands based on watcher status.
   [`watcher-continuity.md`](../watcher-continuity.md) owns the exact session-lock recovery boundary.
8. The turn-end guard (`bin/fm-turnend-guard.sh --claude`) remains the final backstop.
   It requires the PID-strict live-watcher and fresh-beacon predicate at the Stop boundary, except for the Claude-specific foreign-live-owner safe exit owned by [`turnend-guard.md`](../turnend-guard.md#guard-predicates); that document also owns the distinct model-aware mid-turn pull-guard rules.
   Otherwise, it allows the stop when a watcher is healthy or an open auto-arm generation claim owns recovery, while fresh failure epochs advance the bounded one-time attended fail-open progression described there.
9. Waiting on the hook-owned cycle is silent: do not send idle progress while the watcher is parked.

The watcher itself remains `bin/fm-watch.sh`, and `bin/fm-watch-arm.sh` remains the verified arm wrapper that the Stop hook foregrounds.
Re-arm attaches to an existing healthy cycle when one is already present and follows its verified successor chain.
See [`watcher-continuity.md`](../watcher-continuity.md) for the arm-layer successor and clean-close failure contract and the Claude ownership model.

```

## $ bin/fm-supervision-instructions.sh --harness unknown
```
================================================================================
SUPERVISION OPERATING INSTRUCTIONS - primary harness: unknown
================================================================================
Current state:
- Lock: held by this session; this session owns normal supervision unless away mode says otherwise.
- Away/quiet mode: inactive.
- X mode: inactive; use the default watcher cadence.
- Ordinary wake: follow the continuation in the harness protocol below; do not use shell &.

Mode: Unknown harness fallback.

This primary harness does not have a verified watcher wake adapter.
Follow the generic supervision contract in `AGENTS.md`.
First cycle: drain queued wakes, then choose a supervision wait that the harness can actually wake from.
Ordinary wake: drain, handle all emitted wakes, reconcile open decisions and unread status lines, and run the exact `--ack-through` command printed as `WAKE_ACK_REQUIRED`, then repeat that verified wait while supervision is still required.
Before that acknowledgement, interruption leaves the work durable for idempotent re-handling.
Use `bin/fm-watch-arm.sh` only when the harness has a tracked background mechanism that survives the tool call and notifies the model on process exit.
Use a bounded foreground wait over `bin/fm-watch.sh` when that wake mechanism is not verified.
Never use shell `&` for watcher supervision.
Failure or missing cycle only: inspect the failure and restore the same verified wait shape.

Record new verification evidence before promoting an unknown harness to a named snippet.

```

## $ bin/fm-supervision-instructions.sh --harness codex
```
================================================================================
SUPERVISION OPERATING INSTRUCTIONS - primary harness: codex
================================================================================
Current state:
- Lock: held by this session; this session owns normal supervision unless away mode says otherwise.
- Away/quiet mode: inactive.
- X mode: inactive; use the default watcher cadence.
- Ordinary wake: take the next foreground bin/fm-watch-checkpoint.sh checkpoint as directed below.

Mode: Codex foreground checkpoint.

When this session owns supervision and away mode is not active:
1. Drain first with `bin/fm-wake-drain.sh`.
   After handling all emitted wakes and reconciling open decisions and unread status lines, run the exact `--ack-through` command printed as `WAKE_ACK_REQUIRED`; until then the work remains durable for idempotent re-handling after interruption.
2. Source `/Users/makle/.no-mistakes/worktrees/a8c341f6ff4a/01M343F7J7NWAPTKDN5R96EVX4/config/x-mode.env` first when Relay is active.
3. First cycle: run one foreground watcher checkpoint with `bin/fm-watch-checkpoint.sh --seconds "${FM_CODEX_WATCH_CHECKPOINT:-180}"`.
4. Ordinary wake: if the command prints `signal:`, `stale:`, `check:`, or `heartbeat`, drain queued wakes, handle that wake, then start the next checkpoint.
5. If the command prints `checkpoint:` or exits 124 with no wake, drain queued wakes anyway, process any queued user message now visible to Codex, then start the next checkpoint.
6. Never use shell `&` or Codex background tasks for firstmate watcher supervision.
7. Do not run `bin/fm-watch-arm.sh` as Codex's normal supervision command.
   If it is ever shelled anyway, a backgrounded, piped, or bundled anti-pattern is denied automatically by the PreToolUse seatbelt (`bin/fm-arm-pretool-check.sh`) registered in `.codex/hooks.json`.
8. Failure or missing cycle only: drain queued wakes, inspect the failure, then start a fresh foreground checkpoint.

Codex cannot reason while a foreground tool call is running.
The bounded checkpoint returns control regularly so user messages and queued wakes can be handled without relying on background-task wake semantics.

```
