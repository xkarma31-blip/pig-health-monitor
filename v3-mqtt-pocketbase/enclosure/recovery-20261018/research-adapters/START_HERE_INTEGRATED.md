# Integrated research candidate — digital prototype

Canonical reviewed enclosure remains revision P, preserved unchanged. The newest
integration candidate is `combined-thermal-candidate.blend`: square thermal rear
insert, largest SHT carrier, two14×12mic supports, low tray and modified access
spine. This is not physical manufacturing approval. Both mic sides now use the
same approximate PCB-family scenario and have separate installed checks.

## Reproduce

External tools: Blender4.0 for legacy assembly/SHT scripts, Blender4.2.3 for
thermal scripts, Node.js, PrusaSlicer. Paths are configurable with `BLENDER`,
`BLENDER_THERMAL`, `SLICER`; the default slicer runtime is temporary and not
bundled. The ZIP now includes P scenes/STLs and original poster, not executables.

1. `bash verify_research_options.sh`
2. `bash verify_thermal_research.sh`
3. `PIGPULSE_THERMAL_VARIANT=pcb25_4square blender -b --python-exit-code 1 --python build_combined_research_scene.py`
4. Same environment/Blender command with `check_combined_research_scene.py`.
5. `bash slice_research_options.sh`

The complete current chain is `bash verify_integrated_candidate.sh`, including
the Blender4.2 manufacturing contract and negative controls. For a focused
contract run use Blender4.2 with `check_integrated_export_contract.py --
--reports research-adapters/export-contract-42 --self-test`.

Aggregate acceptance also binds current candidate/source/export hashes and a
run-input manifest. Do not rerun only the aggregate after editing files: stale
inputs must be rejected. Both microphone checks run against the final thermal
candidate after integration, not merely the earlier nonthermal scene.

Use current JSON results, not historical filenames containing “pass”. Thermal
acceptance requires `thermal-digital-acceptance.json` all gates true, including
current scene/checker hashes, nine STL/slicer checks and216 sampled optical
scenarios. Combined acceptance independently checks actual printed inventory,
253part pairs, component envelopes, tray hardware, mic contact/tunnels, and
spine export roundtrip. Full tie/cable routes remain unvalidated. Electronics,
nuts and package proxies are nonprintable.

## Evidence and limits

Original poster SHA256 remains
023d26a14c579d38401fee80d479b10d36004891dff9fdcba4fb7f281399102f.
Read SOURCE_LEDGER.md for published dimensions versus chosen allowances.
No actual board identity, underside-safe zones, pupil position, wire bends,
printed tie clearance, loads, vibration, acoustic/thermal response or IP rating
is established. Optical results are finite conditional ray samples, not a
measured FOV or continuous-frustum guarantee. Print/bench validation is required.

Preserved failed reports document blind mic tunnels, refilled SHT ventilation,
missing SHT material, tray-head/spine interference, thermal topology failures
and missing thermal load paths. Repairs have reproducible geometric checks;
none establishes physical performance.

## Wiring and microphone retention scenarios

`check_integrated_routes.py` reserves one shared2mm wire bundle with0.25mm
radial allowance through existing exits to thermal, both mics and external SHT.
It preserves failed approaches and tests finite swept envelopes. It does not
validate connector threading, real bend radius or strain relief.
Conventional2.5×1.1mm ties fail the mic tunnels. Do not purchase generic ties
assuming fit. `build_mic_retention_thread_option.py` instead tests a chosen
0.5mm round lacing-cord scenario with1.8mm external knot/tail reservations,
two closed loops per board. Read `mic-retention-thread-assembly.md`; real cord,
knot security, tension and underside-safe lanes require bench inspection.
