# M5 · 60-minute reconnect/idle soak · Evidence

- Card: M5 (integration spec "initial performance thresholds": 60-minute reconnect/idle mixed loop, recording p95, heap and RSS curves, max queue, recovery count)
- Status: **60-minute formal run passed** (40 rounds, 960,000 frames, batch-age p95 25 ms, memory bounded)
- Recorded: 2026-11-04
- Data nature: **fixture · local main-process pipeline replay** (four channels, no window, no network, no mock server)

## Method

- 4 independent channels, each at 100 frames/s; frame text is a redacted token, merged through the real
  merger (`src/shared/stream-batch.ts`, 24 ms window).
- Each cycle (90 s): 30 s steady stream → 30 s idle (queue must drain) → reset the merger to simulate a
  disconnect → 30 s reconnect replay (a 25-frame burst from `session.events.since` + continued
  streaming) → drain.
- Each cycle verifies: text rolling hash and length complete (no loss/duplication), no unflushed
  batches, batch-age p95, queue peak; Node process RSS/heap sampled every 5 s.
- Assertions: cycle count, per-cycle text integrity, worst batch-age p95 ≤ 32 ms, queue ≤ 200, mean RSS
  of the last third ≤ max(first-third mean + 64 MB, 1.5×).

## Run

```bash
BENCH_SOAK_SECONDS=3600 pnpm bench:soak
# short verification
BENCH_SOAK_SECONDS=60 pnpm bench:soak
```

## Short-scenario verification (60 s / 2 cycles)

| Check                       | Result                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Nominal duration → measured | 60 s → 60.05 s (fixed a unit bug in the harness itself where 48 ms was treated as 48 s) |
| Cycles / reconnects         | 2 / 2                                                                                   |
| Per-cycle text integrity    | ✅                                                                                      |
| Worst batch-age p95         | 25 ms                                                                                   |
| Queue peak                  | 4                                                                                       |
| RSS / heap                  | 30.3 → 26.2 MB / peak 11.7 MB (no growth)                                               |

## 60-minute formal results

Command: `BENCH_SOAK_SECONDS=3600 pnpm bench:soak` (actual run 2026-11-04 13:34–14:34)

| Check                                                           | Threshold                 | Result                                                                                 |
| --------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| Duration                                                        | 3600 s                    | ✅ **3602.3 s**                                                                        |
| Cycles / reconnects                                             | 40 / 40                   | ✅ 40 / 40                                                                             |
| Frames / rate                                                   | 4 channels × 100 frames/s | ✅ **960,000 frames @ 400 frames/s**                                                   |
| Per-cycle text integrity (rolling hash + length + no unflushed) | all pass                  | ✅ 40/40                                                                               |
| Worst batch-age p95                                             | ≤ 32 ms                   | ✅ **25 ms**                                                                           |
| Queue peak                                                      | ≤ 200                     | ✅ **12**                                                                              |
| RSS curve                                                       | no sustained growth       | ✅ 30.6 → 44.4 MB (+13.8 MB); first/last third mean 34.0 → 43.6 MB (threshold ≤ 98 MB) |
| Heap peak                                                       | recorded                  | ✅ 17.4 MB                                                                             |
| Sample points                                                   | every 5 s                 | 720                                                                                    |

Note: two signed builds ran in parallel during the run and all assertions still passed, showing ample
timing and memory headroom.
Raw report: `docs/evidence/tmp/perf-soak-2026-11-04T06-34-53-491Z.json`.

## Not covered

- This is a synthetic load on the main-process merger pipeline; it does not include real WS network
  reads and JSON parsing (the JSON part is covered by `bench:pipeline`) or the renderer process;
  the renderer's 10-minute steady state is in `m5-performance.md`.
- Real service disconnections (network switching, service restart) and real approvals/notifications
  still need real integration runs, see `acceptance.md`.
