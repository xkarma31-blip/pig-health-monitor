# Simulation Proof — Environment, Visible AI, Pipeline Trace

> Phase 2 of the sandbox: make the simulation *prove the approach*, not just the plumbing.
> Parent plan: `2026-09-08-simulation-web-ui-sandbox.md` (Tasks 1–10 DONE + Task 11 c2).
> Branch: `feat/v3-mqtt-pocketbase`. Dir: `tools/simulator-web/`.

## Gap (user-verified concern 2026-09-08)

- No environment: 1 pig, no herd, no disease trajectory.
- No visible AI: the CNN-LSTM is a static "22 ms" bar — scores/features invisible.
- No causation: sensor→DSP→ML→decision→MQTT→bridge→DB chain is not observable.
- No outcome validation: nothing answers "does the approach work?" with evidence.

## What a sim CAN prove (honest scope)

Pipeline mechanics, decision logic, latency budget, UX — and now: **a real DSP feature
pipeline whose scores visibly respond to environment cough events** (causal loop).
It CANNOT prove ML accuracy on real pigs (needs real audio + trained model).

## Stages

1. **Environment model** (`src/engines/environment.ts`) — herd of pigs, each with
   health state (HEALTHY/INFECTED/CRITICAL) driving fever trajectory + cough-event
   rate + movement; deterministic (seeded RNG); `setHealth` for scenarios.
2. **Visible AI layer** (`src/engines/dsp.ts`, `src/engines/inferenceChain.ts`) —
   REAL STFT (radix-2 FFT) → REAL Mel filterbank (40 bands) → log-mel features →
   fixed-weight 3-class readout (stand-in for the TFLite CNN-LSTM, documented).
   Scores/trend/confidence rendered live; scores drive node `healthTrend` so the
   causal loop closes: sick pig → coughs → score climbs → CLUSTER → alert.
   Node gains additive runtime overrides: `node.setEnvironment({bodyTemp, coughRate,
   trend, position})` — backward compatible, existing 95 tests untouched.
3. **Pipeline trace + scenario runner** (`src/engines/pipelineTrace.ts`,
   `src/engines/scenarios.ts`) — timestamped stage log (SENSOR→DSP→ML→DECISION→MQTT→
   BRIDGE→DB) + scripted scenarios ("Healthy baseline", "Influenza outbreak") with
   expected outcomes → live PASS/FAIL verdicts. Same engine drives the vitest suite.

## Verification

- `tsc --noEmit` clean; vitest grows (env, dsp, inference, scenarios, node overrides);
  `npm run build`; cockpit shows ClassifierPanel + PipelineTrace + scenario panel.
- Honest limitations documented: linear readout ≠ trained CNN; audio is synthetic.

## Commits (all done ✅)

- `417e918` `feat(sim): environment herd model - fever/cough dynamics per pig health state, deterministic, scenario-scriptable (TDD GREEN)`
- `15433ef` `feat(sim): visible AI layer - real STFT/Mel DSP + fixed-weight classifier readout, environment->node runtime overrides (TDD GREEN)`
- `c68a4a9` `feat(sim): pipeline trace + scenario runner - causal loop proven offline (sick pig -> fever -> CLUSTER -> CRITICAL); cough-count-led classifier (TDD GREEN)`
- `6dff8f0` `feat(sim): cockpit AI panels - barn cattle + classifier readout + pipeline trace + scenario runner wired to live env->node loop (TDD GREEN)`

## Result

tsc clean · vitest **126/126 (19 files)** · `npm run build` OK · dev server 200 on `/` and all transformed modules. Cockpit now shows: Barn Environment (4 pigs, script-infection), AI Classifier (live Mel heatmap + score bars + trend), Pipeline Trace (SENSOR→DSP→ML→DECISION→MQTT→BRIDGE→DB journal), Scenario Runner (same engine as vitest → on-screen PASS/FAIL).