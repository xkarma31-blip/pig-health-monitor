# Track T2 — Backend & Cloud Sync

**Track note file** (worker-owned; T0 folds it into `CANON.md`).
**Scope:** `v3-mqtt-pocketbase/backend/{bridge,workers,scripts,systemd}/**`.
**Never touched:** firmware, mobile app, landing page, `CANON.md` (§12 lists the
deltas for T0 to fold in).

---

## Track note 2026-11-03 — Pi→cloud sync live; laptop-anchored timeline; thermal guard at both writers

### 1. What changed

| File | Change |
|---|---|
| `backend/bridge/time_anchor.py` | **New.** Laptop-anchored timeline: NTP laptop is the truth host (HTTP `Date` header), monotonic clock carries it forward, persisted anchor JSON (0600), backwards refreshes clamped, reboot invalidates the anchor instead of extrapolating from a dead monotonic clock. Per-device last-seen ledger for gap logging. Stdlib only. |
| `backend/bridge/thermal_guard.py` | **New.** Shared semantic-field guard + thermal-alert classifier. One module, two consumers (see §6). |
| `backend/bridge/local_bridge.py` | Wires the guard and the anchored timeline in: stamps every row's `timestamp` from the anchor (unconditionally overwriting arriving stamps), applies the guard at ingest. **Deployed to the Pi; live.** |
| `backend/bridge/tests/test_time_anchor.py` | **New** — 18 bridge tests across this and the guard file, all green. |
| `backend/bridge/tests/test_thermal_guard.py` | **New** (see above). |
| `backend/workers/cloud_sync.py` | Era-offset correction at the single shared sync point (every collection with a `timestamp`), destination stamps normalized to integer seconds, guard reused on telemetry payloads, historical thermal alerts suppressed (marked handled). Source rows stay pristine. |
| `backend/workers/tests/test_cloud_sync.py` | Expanded to 18 tests, all green. |
| `backend/scripts/health_check.py` | Rig-aware topology: bridge checks now **Pi-only**; laptop checks the **cloud-sync** unit (user journal, `pass:` marker); MQTT→PB round-trip gated to the Pi (the laptop has no bridge to consume a probe); gateway proxy check gated on `PB_EMAIL`/`PB_PASSWORD` instead of KeyError-ing on empty creds. Validated live: `npm run health:local` **exit 0**, all checks ok/skip. |
| `backend/systemd/pigpulse-cloud-sync.service` | **New.** Laptop **user** unit (60 s interval). No `User=` — see §9. Deployed to `~/.config/systemd/user/`, enabled, `Linger=yes`, **active**. |
| `backend/bridge/mqtt_bridge.py` | **Retired on the laptop** — `systemctl stop` + `disable` (2026-11-03). Stays in the repo as dev/reference. See §7. |

Validation: `npm run ci:backend` = **backend OK**; bridge suite 18/18; workers
suite 18/18 (all run 2026-11-03 after the final edits).

### 2. The clock problem, and the approved design

The Pi has no RTC and its wall clock has stepped by *days* (the 2026-11-02
`systemd-timesyncd` first sync moved it +32.8 d). A stamp read from the Pi
clock is not a fact about when a sample was produced. Design (approved
2026-11-02):

- the **truth host** — the NTP-synced laptop — sets the anchor via its HTTP
  `Date` header;
- the **monotonic clock** carries the timeline forward from the anchor;
- a wall-clock step on the Pi changes nothing;
- a refresh that would move stamps **backwards is clamped** (timeline stays
  continuous);
- a **reboot invalidates the anchor** instead of silently extrapolating from a
  dead monotonic clock — stamps then fall back to wall time: honestly wrong,
  not subtly wrong;
- state persists as JSON (mode 0600), so a bridge restart keeps the timeline.

### 3. Era map (measured offsets, locked 2026-11-03)

Applied at one shared point in `sync_once` (`ERA_OFFSETS_MS`, ms → ms), then
normalized to integer seconds for the destination. Source rows are never
modified.

| Era | Raw window (ms) | Offset (ms) | True meaning |
|---|---|---|---|
| 0 | < 1 790 819 471 315 | +246 036 936 | clock 2.85 d behind |
| 1 | < 1 793 658 731 063 | +2 836 325 167 | clock 32.83 d behind |
| 2 | < 1 793 689 301 461 | 0 | true time, through the 2026-11-03 reboot |
| 3 | ≤ 1 793 697 285 165 | +8 715 000 | clock 2 h 25 m 15 s behind — **fake-hwclock restored a stale snapshot at the Nov 3 boot** |
| 4 | ≥ 1 793 697 285 166 (anchored bridge) | 0 | true time |

Corrected-era-3 stamps interleave with era-4 rows **by true time**, which is
the point: a sample that truly happened at 10:00 lands at 10:00 even though
its raw stamp said 07:35.

### 4. Era-3 verification (all measured 2026-11-03)

| Check | Result |
|---|---|
| Pi census, era-3 raw window | **1 004 rows** |
| Dest corrected band `[1 793 698 016, 1 793 706 000]` s | **1 004 rows — one-to-one with the census** |
| Corrected band in true UTC | 09:26:56Z – 11:40:00Z, Nov 3 |
| Reboot seam (raw `1 793 689 236 030 … 1 793 689 291 164`, ~70 s) | **16 rows, unattributable** → treated as era-2 (documented slop: they may truly belong +2 h 25 m 15 s later) |
| "Wrongly-corrected" band `[1 793 689 302 … 1 793 698 015]` s | **0 rows** — nothing ever landed at raw-era-3 stamps |
| Guard violations across all synced rows (`bodyTemp≠0`, mic `temperature≠0`) | **0 and 0** |

### 5. Catch-up: two sequential `--once` runs, single writer

The insert path has no dedupe, so drain discipline was strict: one writer,
sequential passes, stop on a sub-batch pass.

| Run | Passes | Rows | failed / quarantined / suppressed |
|---|---|---|---|
| v1 (pre-era-3 discovery) | 45 | 9 000 | 0 / 0 / 1 |
| v2 (era-3 patched) | 65 | 12 688 | 0 / 0 / 3 |

- v1's 9 000 rows were all **pre-era-3** rows (sort is `+timestamp` ascending;
  the empty band in §4 proves it), so they are correct under the map that
  existed when v1 ran. No unwind was needed.
- v2 drained the rest, including the whole era-3 window, now corrected.
- 4 historical thermal alerts were **suppressed** (marked handled at source,
  never delivered) — the backlog-drain counterpart of the ingest guard.
- Dest bookkeeping: 22 134 total at 13:06:48Z (= 9 446 before v2 + 12 688
  v2); 22 276 total = 22 276 synced, **0 unsynced** at 13:28Z. The residual
  unsynced rows on the Pi are normal ≤60 s pipeline lag (4 rows, all aged
  <40 s at check).
- The service then took over: first continuous pass sent **42 rows clean**,
  with per-row guard-drop logging; it runs every 60 s as
  `pigpulse-cloud-sync.service` (user unit, solrahk, `Linger=yes`).

### 6. Guard contract (one module, two writers)

`backend/bridge/thermal_guard.py` is the single source of truth, reused by the
Pi bridge (at ingest) and `cloud_sync.py` (at sync) so the two PocketBases
converge on the same shape:

- **Dropped always:** `bodyTemp`, `verdict`, `alerts` — scene-camera claims
  the rig cannot make (T2 decision 2026-11-02; the MLX90640 keeps running, we
  just stop *claiming* a pig temperature).
- **`status`:** dropped unless it is device liveness (`online` / `offline`).
- **`temperature` on mic rows:** re-homed to `ambient` (it is the SHT45
  ambient reading, not a pig value); zeroed elsewhere.
- **Kept (raw):** `center`, `hotspot`, `max`, `min`, `ambient`.

### 7. Laptop bridge retired (not deleted)

`pigpulse-bridge.service` on the laptop was the pre-T2 bridge. Journal,
entire life: **4 messages** (1 telemetry, 3 status), **1 record created** —
and that one insert (`gej5njfpz2nx9qq`) carried unguarded fields
(`temperature=31.11` on a mic row, `ambient=0`), i.e. it violated the data
contract. Patched to contract: `ambient=31.11, temperature=0, synced=true`.

It also raced its dependencies at boot (connection-refused errors on Nov 1
×2 and the Nov 3 boot; 6 restart/error events), and its existence as a second
dest writer breaks the single-writer contract. `systemctl stop` + `disable`
2026-11-03; the unit file stays in the repo marked dev-only. Re-enabling it
on a live bench is deliberate future work and should include a guard port.

### 8. App impact (read-only facts for T5 — no app code touched)

- `LiveThermalPanel.tsx:371` and `app/tabs/index.tsx:152` fall back to
  `pb?.bodyTemp` → synced rows now carry `bodyTemp=0` (claim dropped; live
  frames still carry the raw `center`).
- `hooks/usePiThermal.ts:87` reads `rec.bodyTemp`; `hooks/useOfflineTelemetry.ts:107`
  writes `espData.bodyTemp` (offline path, out of T2 scope).
- `app/setup.tsx:59` reads `first.temperature` → mic rows re-home that value
  to `ambient`; synced mic rows carry `temperature=0`.

### 9. Deployment lessons (paid for in failures, kept here so nobody re-pays)

- **`216/GROUP`:** setting `User=` in a *user* unit fails — the user manager
  already runs as the owner and cannot resolve supplementary groups
  (`CAP_SETGID` absent). The unit has no `User=` and a comment explaining why.
- **Root-HOME trap:** session shells may run as root, where `~` is `/root` —
  operational scripts must use absolute `/home/solrahk/...` paths and
  `runuser -u solrahk` for user systemd.
- **User journals:** `journalctl -u <unit>` only reads the *system* journal;
  user-unit logs need `journalctl --user -u <unit>` (health_check now does).
- **`created` is not a bookkeeping axis:** `cloud_sync` preserves the source
  `created` on insert, so dest `created` reflects Pi-side times, not sync
  time. Count by `synced` / `timestamp`, not `created`.

### 10. Open items

| # | Item | State |
|---|---|---|
| T2-1 | **3.5.3 collection-rule lockdown** | Blocked on the app-auth question: the app polls PB unauthenticated (all base collections have `listRule=''`), so tightening rules first would break it. Awaiting Master's answer on which token path the app uses. |
| T2-2 | **3.5.1 PocketBase admin password rotation** | Approved (sync proved out); pending. Rotation invalidates stored admin tokens — schedule with the app-auth answer. |
| T2-3 | **3.5.4 Tapo credential rotation** | Approved; shared with T3's open item (rotate at camera, update both env files). |
| T2-4 | **Laptop internet down** | Restore: `nmcli con up uuid 716869f9-920f-42e7-a79a-7637c1176f68`. Cloud sync works over the AP (Pi→laptop), but the laptop currently has no WAN. |
| T2-5 | **Era-0 (Sep 28) truth** | Rests on Pi-internal journal/boot-log evidence only; no external corroboration. Documented as such. |
| T2-6 | **Laptop as MQTT bench** | Re-enabling the retired bridge + porting the guard to it — deferred until needed. |

### 11. Reproduce

```bash
cd /home/solrahk/pig-health-monitor
npm run ci:backend                                   # byte-compile + bash -n
cd v3-mqtt-pocketbase/backend/bridge && python3 -m unittest discover -s tests
cd ../workers && python3 -m unittest tests.test_cloud_sync
npm run health:local                                 # laptop rig, rig-aware
runuser -u solrahk -- journalctl --user -u pigpulse-cloud-sync -n 5   # pass: lines
```

Catch-up pattern (single writer, sequential, absolute paths):

```bash
set -a; source /home/solrahk/.config/pigpulse/sync.env; set +a
cd /home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/backend/workers
python3 cloud_sync.py --once    # repeat; stop when a pass sends 0
```

### 12. Canon deltas for T0

- §2.1 **"The Pi and the laptop have no replication path" is now stale** —
  `cloud_sync.py` is the Pi→cloud path, and the `synced` flag is now read by
  it (`filter=(synced=false)`), not write-only.
- **Single-writer contract:** Pi bridge → Pi PocketBase; `pigpulse-cloud-sync`
  → laptop/dest PocketBase. No other dest writer exists (laptop bridge
  retired).
- **Dest timestamp contract:** integer seconds, era-corrected at the single
  sync point, globally monotonic in true time.
- **Dest telemetry contract:** semantic claim fields dropped by the shared
  guard; raw thermal fields retained; mic ambient re-homed.
- **New systemd unit:** `pigpulse-cloud-sync.service` (laptop user unit,
  60 s, `EnvironmentFile=` from `~/.config/pigpulse/sync.env`, 0600, never
  committed).
