---
title: "fix: Establish verified local firmware-to-app integration"
type: fix
status: active
date: 2026-10-13
---

# Local firmware-to-app integration

## Summary

Deliver real thermal and microphone measurements to the existing Expo app using the canonical Pi → PocketBase → laptop path, with honest freshness and failure states. User selected **local-first**. This is a planning artifact, not authorization or evidence of completed deployment.

**Target repository:** pig-health-monitor. All code paths below are repository-relative. This plan lives under the active v3 documentation tree because CANON freezes root `docs/` as historical reference.

---

## Authority and evidence discipline

- `CANON.md` governs repository paths, topology and deployment. Its dated operational statements require fresh corroboration; mutually contradictory passages cannot all describe the current system.
- Current source establishes implemented behavior, not what binary or SD card is deployed.
- Hardware claims require direct readouts. External documentation establishes protocol behavior, never device state.
- Evidence below was gathered earlier in this conversation on the session date, 2026-10-13. Exact laptop acquisition times were not retained. Pi timestamps are suspect. Reacquire a timestamped baseline before execution; do not relabel this snapshot as current indefinitely.
- Research used direct source inspection and official external references. The knowledge graph has no index for this repository. Delegation failed to create sessions; no independent agent research or review is claimed.
- Working tree already contains numerous modified and untracked files. Preserve and attribute that work before implementation; no branch reset, blanket staging or wholesale replacement.

## Observed baseline

### Live readouts from this conversation

- Pi `/health`: valid thermal frame, frame age 0.6 s, measured 1.88 FPS, I²C address 0x33 on bus 1. MQTT reported connected.
- Independent read-only broker subscription received two changing `pig/pi-thermal-01/telemetry` messages. They reported `pigId=unassigned`, `OUT_OF_BAND`, and temperatures near 29–31 °C. This proves acquisition/publication, not clinical validity or pig identification.
- Pi `/esp/status`: disconnected/stale, socket flag true, approximately 39 minutes since last bytes. A socket flag and historical nonzero percentage are not liveness.
- Broker retained `pig/s3-mic-01/audio/fmt` identifies `pigpulse-mic-pcm16-20261013`; retained telemetry says `mic=false`. Retained metadata is not current firmware attestation.
- Pi PocketBase: 4,924 telemetry rows, latest created September 28 05:30 UTC, unchanged on repeat; zero telemetry rows for `pi-thermal-01`.
- Laptop PocketBase: 45 telemetry rows, latest created September 27, old pre-flight record; zero thermal-node telemetry rows.
- Public telemetry endpoint returned the same latest record ID as laptop PocketBase. Public read transport works for old records.
- Laptop cloud-sync unit is installed, disabled and inactive; expected sync environment file absent.
- Laptop has both a Pi AP route and a separate upstream route. This supports the canon's laptop-pull topology without redesigning the AP.
- Pi HTTP Date and fresh MQTT timestamps indicated September 28, inconsistent with session date. Establish correct UTC before applying age-based policy.
- Noninteractive Pi SSH was denied. Bridge service state, deployed hashes, exact booted card and credentials remain unknown. No attached ADB device was listed.

### Historical measured evidence

`v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/docs/MIC_FIX_20261013.md` records corrected PCM conversion, successful flash, real WAV and browser-output measurements, and user-confirmed recognizable audio with residual static. Underruns and reconnect soak testing remain open. This supersedes old USB-wedged claims, not the current stale-stream readout.

### Important source findings

- `backend/bridge/local_bridge.py` under v3 requires credentials and drains a bounded queue; failed writes are not durably retried. A green service alone does not prove persistence.
- `backend/workers/cloud_sync.py` marks over-age records synced **without upload**. Its age calculation assumes epoch milliseconds. Its early source/destination failures can return statistics with zero failures, so process success is not sufficient verification.
- Sync copies telemetry, alerts and audio_events, not devices or pigs. Device liveness and roster attribution therefore need explicit treatment.
- App `src/utils/setupStore.ts` stores `pbUrl`, but source search found no consumer loading it into the data clients. Scan candidates omit the canonical Pi address.
- `src/utils/pocketbase.ts` filters an empty same-origin web base out with `filter(Boolean)`, leaving an undefined primary URL. Auth and non-dashboard data paths use this client.
- `src/hooks/usePocketbaseRealtime.ts` independently chooses its endpoint; receives newest-first records but applies each in order, permitting older rows to overwrite newer rows. Receipt of old data sets connected; cached data and transport reachability are not sensor freshness.
- `src/utils/pocketbase-data.ts` maps every device to thermal. The dashboard uses temperature rather than distinguishing acoustic values or surface/body semantics.
- `src/app/thermal.tsx` supplies no frame to `ThermalLiveView`; the component synthesizes frames when input is absent. Pi `/data` serves actual pixels, while thermal MQTT sends summary fields only.
- Public proxy allowlist drops firmware `mic/rms/peak/sr` and thermal `verdict/center/hotspot/...`; it exposes no audio_events collection. Firmware RMS is diagnostic amplitude, not cough detection.

All abbreviated `backend/...` paths above are under `v3-mqtt-pocketbase/`; app paths are under `v3-mqtt-pocketbase/frontend/mobile_app/`.

---

## Requirements

- R1. Preserve canonical source/deploy paths and existing thermal operation.
- R2. A real identified node reading must persist with preserved values and valid provenance/time, then appear in the actual app.
- R3. Stale, disconnected, invalid-clock, unassigned and unavailable data must be explicit. Simulations cannot masquerade as live data.
- R4. Local live thermal/audio access must have a real supported transport. Summary telemetry is not a pixel stream, RMS is not cough classification, and sync is not media transport.
- R5. Historical data must not be silently retired due to clock/unit errors. Verification must include failed persistence and reconnect behavior.
- R6. Completion requires a real phone/app trace and evidence of recovery, not only mocks, HTTP 200s, or active services.

## Scope and technical decisions

1. **Retain the canon topology:** ESP → Pi ingest/MQTT → Pi bridge/PB → laptop sync/PB → app. Native configured endpoints may directly target Pi PB for diagnostic isolation; do not replace the canonical acceptance chain silently.
2. **Prove native Expo telemetry locally first.** Use a configured reachable endpoint; ADB reverse is a development aid, not a farmer deployment. Verify the installed EAS build and supported cleartext policy on the actual phone.
3. **Reuse the Pi HTTPS dashboard for first local media access**, explicitly labelled as a separate local view launched from the app. Do not claim embedded Expo media parity. Embedded pixel/audio rendering is a later milestone unless separately requested. Self-signed trust must be tested on the phone without disabling certificate verification in production code.
4. **Keep public web on same-origin proxy.** An HTTPS Vercel page cannot simply fetch HTTP Pi APIs; CSP, mixed content, certificate trust and local-network policy are separate constraints. Do not loosen the public deployment globally to obtain a local demo.
5. **Polling is the first supported update mechanism.** Consolidate endpoint/data handling; retain SSE only when its actual PB_CONNECT/client ID/subscription protocol is implemented and tested against the deployed version.
6. **Characterize before changing fragile persistence.** Prefer minimal fixes and explicit delivery guarantees over a new broker, database or streaming platform.

### Deferred

Off-site media relay, new WAN hardware, CCTV integration, embedded Expo live media, model training/cough classifier claims, automated animal identification and clinical calibration. Existing CCTV routes must not regress. No Firebase/D0WD revival or new project checkout.

---

## Orchestration and dependency gates

One coordinator owns deployment decisions, evidence and CANON reconciliation. During implementation, edge, data and app specialists may research in parallel; only one owner changes the live Pi at a time. Reviewers receive immutable diffs/evidence, not permission to restart services.

Directional dependency sketch:

```text
U1 baseline/access/time/version
 ├─ U2 edge continuity + persistence ─ U3 safe sync ─┐
 └─ U4 app contracts + freshness ──────────────────┼─ U6 end-to-end acceptance
     U5 local media handoff (after U1/U2) ─────────┘
```

U4 test/source work can proceed while device access is blocked. U2 deployment, U3 activation and U6 cannot. All proposed test files below are new unless marked existing; paths are planning targets, not claims of present coverage.

### U1. Establish a trustworthy execution baseline

**Requirements:** R1, R5, R6. **Dependencies:** none.

**Files:** `CANON.md`; existing `v3-mqtt-pocketbase/backend/scripts/pi_diag.py`; new `v3-mqtt-pocketbase/docs/verification/local-integration-baseline.md`.

**Approach:** obtain working authorized Pi access and phone availability. Identify booted card, deployed firmware/backend hashes, PB binary/version/build, service paths, effective endpoint configuration and current UTC on each system. Capture health, passive MQTT and read-only PB observations with acquisition timestamps. Never connect a diagnostic to single-client TCP 9090. Never read secrets into evidence.

**Verification:** reproducible evidence separates host time, device time and elapsed freshness. Missing access is an explicit blocker, not a guessed root cause. Preserve backups and existing edits before any subsequent mutation.

**Test expectation:** no new unit tests for collecting evidence. Validate diagnostic safety by inspecting its probes before use.

### U2. Restore continuous edge acquisition and persistence

**Requirements:** R1, R2, R3. **Dependencies:** U1.

**Files:** canonical firmware `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/src/esp32s3_telemetry.ino`; existing adjacent `test_pcm_conversion.cjs`; `v3-mqtt-pocketbase/backend/bridge/local_bridge.py`; existing `backend/bridge/tests/test_bridge_status.py`; proposed `v3-mqtt-pocketbase/backend/bridge/tests/test_bridge_persistence.py`; `v3-mqtt-pocketbase/backend/systemd/pigpulse-bridge.service`; existing `v3-mqtt-pocketbase/backend/thermal-pi/scripts/test_pcm_worklet.cjs`.

**Approach:** diagnose mic interruption from serial/ingest/broker/AP evidence before modifying known repaired conversion. Diagnose bridge subscription, PB URL, auth and schema in that order. Restore only the proven failing seam. Add proper status/heartbeat semantics for the mic if needed; its present LWT is on telemetry, not status. Decide/document bounded persistence retry behavior and visible loss accounting rather than claiming durability the queue lacks.

**Scenarios:** known PCM samples retain sign/amplitude; MQTT reconnect reannounces format; stale audio never inherits historical signal=true as live; valid thermal/mic messages round-trip declared fields; auth rejection and PB timeout are observable; retry policy is bounded and does not block MQTT; invalid topic/payload is rejected; duplicate status updates do not create duplicate devices.

**Verification:** two newly acquired messages per node match stored rows and keep advancing. Disconnect/reconnect recovery is measured while thermal continues. No schema alteration without verifying the actual binary and backing up the correct database.

### U3. Make sync safe before activation

**Requirements:** R2, R5. **Dependencies:** U1, U2 for live validation.

**Files:** `v3-mqtt-pocketbase/backend/workers/cloud_sync.py`; proposed `v3-mqtt-pocketbase/backend/workers/tests/test_cloud_sync.py`; `v3-mqtt-pocketbase/backend/systemd/pigpulse-cloud-sync.service` (verify installed-unit parity); v3 verification evidence.

**Approach:** characterize source filtering, clocks, ordering and acknowledgement first. Invalid/future/unit-mismatched timestamps must not trigger success marking or silent retirement. Preserve over-age backlog for explicit review; do not rewrite historical timestamps as new readings. Make failure outcomes observable, including unreachable endpoints and failed acknowledgements. Keep at-least-once semantics explicit; source identity/duplicate handling must be documented. Provision credentials privately only after version-correct auth succeeds, then dry-run before activation.

**Scenarios:** source/destination unavailable; 401 recovery; milliseconds versus seconds; invalid/future time; seven-day boundary; old row remains pending unless explicitly approved policy applies; insert succeeds but source acknowledgement fails; crash/retry duplicates; dry-run makes no record/ack changes; source fields match destination. Verify devices/pigs are not presumed replicated.

**Verification:** a new real row reaches laptop with original source timestamp/values, and only successful delivery is acknowledged. Measured backlog and latency are recorded. Do not enable unchanged age-drop behavior against the observed clock state.

### U4. Connect app contracts and honest freshness

**Requirements:** R2, R3, R6. **Dependencies:** U1 contract baseline; source/test work parallel to U2/U3.

**Files:** app `src/utils/{setupStore,pocketbase,pocketbase-auth,pocketbase-data}.ts`; `src/hooks/usePocketbaseRealtime.ts`; `src/app/tabs/{index,settings,events}.tsx`; `v3-mqtt-pocketbase/backend/workers/readonly_pb_proxy.py`; proposed app `src/utils/__tests__/telemetry-contract.test.ts`, `src/hooks/__tests__/usePocketbaseRealtime.test.ts`, `src/utils/__tests__/connection-config.test.ts`; proposed `v3-mqtt-pocketbase/backend/workers/tests/test_readonly_pb_proxy.py`.

**Approach:** use one effective connection configuration for setup/auth/lists/updates; changing servers must not reuse another server's auth/cache. Preserve intentional same-origin empty base. Normalize timestamp units at the boundary with provenance, reject implausible values, choose newest per node, and separate API reachability from sensor freshness. Interpret thermal/acoustic nodes differently; preserve OUT_OF_BAND/unassigned rather than infer healthy pigs. Define allowed diagnostic fields through both public proxies after inspecting their policies. Scope native polling to current snapshots where needed so updates/deletions are not missed by created-only cursors. Explicitly label demo mode and never substitute it on live errors.

**Scenarios:** persisted setup address survives restart and drives all clients; same-origin URL is valid; server change isolates credentials/cache; newer then older records keep newer; repeated HTTP success with unchanged data becomes stale; offline cached values show age; empty collection is not streaming; invalid date is not healthy; mic RMS is not temperature/cough count; user auth rejection is surfaced; public allowlist passes required fields and excludes secrets; no simulated thermal fallback on live screens.

**Verification:** real rows from U3 appear with matching IDs/value/time in actual Expo screens. Proposed initial freshness thresholds: direct thermal stale after 30 s, laptop-synced thermal after 90 s (10 s publish + 60 s sync + margin). These are acceptance targets, not measured guarantees; tune only from recorded cadence. Mic freshness must follow actual telemetry/status cadence, not thermal defaults.

### U5. Expose an honest local media handoff

**Requirements:** R3, R4. **Dependencies:** U1, U2.

**Files:** app `src/app/thermal.tsx`, `src/components/ThermalLiveView.tsx`, `src/utils/setupStore.ts`; proposed app `src/utils/__tests__/local-media.test.ts`; existing Pi `v3-mqtt-pocketbase/backend/thermal-pi/web_server.py` and static dashboard as reference/reuse targets.

**Approach:** open the existing configured Pi HTTPS view from the app with clear local-network and separate-view wording. Treat browser certificate acceptance as device setup, not proof native clients trust it. A missing connection must show unavailable; simulation belongs only to explicit demo mode. Avoid building another PCM renderer during this milestone.

**Scenarios:** correct configured URL; unavailable Pi; wrong network; rejected certificate; stale mic while thermal continues; user returns to app without losing its state; no record download or second 9090 client as an accidental playback mechanism.

**Verification:** actual phone opens changing thermal frames and recognizable mic audio through the Pi view. Record residual static/underruns honestly. This gate proves a local media handoff, not in-app decoding or remote access.

### U6. End-to-end acceptance, recovery and canon reconciliation

**Requirements:** all. **Dependencies:** U2–U5.

**Files:** new `v3-mqtt-pocketbase/docs/verification/local-integration-uat.md`; `CANON.md`; relevant canonical deployment/readme documents.

**Approach:** coordinator assembles source→MQTT→Pi row→laptop row→phone UI evidence. Record deployed hashes, UTC, source identity, values and observed delay. Reconcile contradictory canon passages with dated evidence while retaining historical provenance. Do not overwrite unrelated documentation work.

**Scenarios:** proposed 30-minute initial soak with advancing values; controlled mic reconnect while thermal survives; PB interruption surfaces persistence failures; sync interruption leaves pending records; app restart/network loss shows stale state and recovers; no-ADB native network path; no-WAN Pi with laptop bridge; local media opening and return. Schedule disruptive checks with the user rather than restarting AP casually.

**Verification:** all gates have actual evidence or explicit failures. A 30-minute pass does not prove long-term reliability. Tests/typecheck/lint and targeted real-device UAT must pass for changed surfaces; run required project code review before landing. No production deploy or commit is implied by this plan.

---

## Version-sensitive research and canon discrepancies

- **PocketBase migration claim requires correction:** CANON §2.6 broadly says 0.22.20 cannot run JS migrations. Official tagged v0.22.20 `examples/base/main.go` explicitly registers JSVM and JS migration templates. Preserve the recorded local failure as evidence, but investigate deployed build, migration API compatibility, working directory and ledger before attributing it to the version or performing raw SQL changes. No upgrade is justified solely by that statement.
- Official realtime docs specify PB_CONNECT, returned client ID and collection wildcard subscriptions. Current hand-written SSE paths do not establish that handshake. Prefer verified polling for this milestone.
- CANON's original diagram, later gap-closed section and open-item list disagree. Reconciliation must distinguish **implemented** sync from **enabled and demonstrated** sync.
- CANON includes broad radio claims not measured here. Do not base network redesign or purchases on them; this plan preserves the existing AP and laptop route.

External references retrieved during planning:

- https://raw.githubusercontent.com/pocketbase/pocketbase/v0.22.20/examples/base/main.go — version-pinned JS migration registration.
- https://pocketbase.io/docs/api-realtime/ — current protocol documentation; validate against deployed version before SSE work.
- https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content — HTTPS/HTTP browser restrictions; not a device compatibility measurement.

## Execution blockers and rollback boundaries

- Working Pi access and physical phone availability are required for device acceptance; neither was available through SSH/ADB during the snapshot.
- Exact bridge failure, microphone interruption cause and deployed-card identity remain unresolved. No specific fix is preapproved by inference.
- Before schema or acknowledgement changes: back up the correct database and validate recovery in an isolated copy. No broad deletes, migration-ledger rewriting or credential reset without explicit authorization.
- Roll back code/config separately from data. Restoring an older database can discard new observations and is not an automatic rollback step.
- Public deployment keeps its canonical combined landing/app process. Local testing must not replace the live landing or create a competing deploy.

## Planning review status

### Independent review assignments and merge criteria

The following are reviewer assignments, not completed reviews. Do not advance this document to independently reviewed until returned findings have been checked against source.

- **Edge/persistence reviewer:** challenge U1–U3 using the deployed/source distinction, acknowledgement semantics, queue loss, invalid clocks, backlog starvation and schema compatibility. Required output: severity, exact source reference, failure scenario, proposed amendment, and whether hardware evidence is required.
- **App/contract reviewer:** challenge U4–U5 across actual entry routes, setup consumption, authentication, public versus native endpoints, cache isolation, node classification and media handoff. Required output includes an actual-phone acceptance path that does not depend on ADB reverse.
- **Acceptance reviewer:** challenge every claim of completion against R1–R6, identify missing negative cases, and verify that evidence proves the claimed boundary rather than only its adjacent component.
- Coordinator resolves conflicting findings against CANON and source evidence. Unsupported recommendations remain hypotheses. Reviewers must not edit the plan concurrently or access live systems.

### Acceptance clarifications from the second planning pass

- **Freshness has two clocks:** record source acquisition time and host receipt time separately. A newly received retained message or replicated historical row must not reset sensor freshness. Without a credible source time or changing sequence, show freshness unknown rather than fresh.
- **Sync latency has a backlog condition:** the proposed 90-second target only applies after backlog has drained and measured cadence supports it. Acceptance must cover a queue exceeding one batch and demonstrate that new records are neither starved nor hidden behind invalid old records.
- **Distinct failure states:** test broker reachable/PB writes failing, PB reachable/sensor stale, destination reachable/sync stopped, and cached app data/server unreachable. Each must produce the correct state instead of a single misleading connected flag.
- **Reference-data gate:** because sync excludes devices and pigs, U4 must document whether each screen derives node state from telemetry or reads reference collections. Do not equate a replicated telemetry row with an updated devices row, roster membership or an identified pig.
- **Media acceptance is bounded:** the browser handoff is a proposed minimal delivery choice, not a user-approved substitute for embedded playback. Before U5 implementation, explicitly confirm that a separate Pi view satisfies the first local milestone; otherwise replan embedded transport and trust requirements.
- **Measured evidence record:** each U6 trace must include acquisition host UTC, reported device time, node ID, MQTT topic, source/destination record identifiers, displayed value/unit, displayed age/state, app build identifier and endpoint mode. Retained broker metadata must be labelled retained. Correlation must not depend only on equal rounded temperature values.
- **Stop conditions:** incorrect card identity, unexplained clock changes, dropped fields, unexpected acknowledgement of undelivered records, thermal regression or credential exposure stop deployment progression. Capture evidence and restore only the affected reversible code/config change; do not roll back a database automatically.

### Review limitation

The requested subagent review is still incomplete. Direct subagent calls were incorrectly supplied nonexistent session identifiers; those failures are orchestration errors, not model-quality evidence. The alternate delegation service also failed to create a session. No independent findings have been fabricated or incorporated as if returned by a reviewer.

Direct source/official-doc research completed; no implementation or tests executed. A manual consistency pass added the missing endpoint-consumption issue, same-origin bug, sync failure reporting, nonreplicated reference data, clock-sensitive retirement gate and migration-claim correction. Independent multi-agent review remains unavailable due to delegation failures. This plan is ready for review and bounded execution discovery, not a readiness certification.
