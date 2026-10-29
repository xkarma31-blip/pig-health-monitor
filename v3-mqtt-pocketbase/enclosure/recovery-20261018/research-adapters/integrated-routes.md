# Integrated route research evidence

Physical underside fit: **UNSUPPORTED**.
Input and P geometry unchanged. Failed reservations are retained.

- thermal_initial_depth_mismatch: FAIL / uncertain grazing; obstacles: thermal_face, thermal_angled_hood, thermal_raised_cradle, pcb25_4square, PCB envelope
- thermal_initial_cradle_approach: FAIL / uncertain grazing; obstacles: pcb25_4square
- thermal_repaired_existing_lower_bore: CLEAR (digital scenario only); obstacles: 
- mic_left: CLEAR (digital scenario only); obstacles: 
- mic_right: CLEAR (digital scenario only); obstacles: 
- sht_initial_through_sidewall: FAIL / uncertain grazing; obstacles: main_tub, sht_adjustable_carrier
- sht_repaired_upper_exit_external: CLEAR (digital scenario only); obstacles: 
- microphone_strap_carrier lane -5.25 hypothetical_narrow_NOT_generic_tie: CLEAR (hypothetical only)
- microphone_strap_carrier lane -5.25 conventional_example_NOT_product_spec: FAIL / conservative envelope
- microphone_strap_carrier lane 5.25 hypothetical_narrow_NOT_generic_tie: CLEAR (hypothetical only)
- microphone_strap_carrier lane 5.25 conventional_example_NOT_product_spec: FAIL / conservative envelope
- microphone_strap_carrier.001 lane -5.25 hypothetical_narrow_NOT_generic_tie: CLEAR (hypothetical only)
- microphone_strap_carrier.001 lane -5.25 conventional_example_NOT_product_spec: FAIL / conservative envelope
- microphone_strap_carrier.001 lane 5.25 hypothetical_narrow_NOT_generic_tie: CLEAR (hypothetical only)
- microphone_strap_carrier.001 lane 5.25 conventional_example_NOT_product_spec: FAIL / conservative envelope

## Limits
- No input geometry changes; failures retained, no P repairs.
- 2mm bundle + 0.25mm radial reservation is an assumed scenario, not measured wiring.
- Polyline capsule union reserves space, not minimum bend radius or threading feasibility.
- Tie strip uses oriented rectangular cross-section tiles with covering spheres and 0.025mm allowance; joint sections overlap, bend mechanics unvalidated.
- Narrow tie and head dimensions hypothetical; no assertion generic or purchased ties fit.
- Nominal PCB contact, underside-safe tie lanes, acoustic response, assembly sequence unsupported.
- Routes tested independently; shared wire trunks are ONE common 2mm bundle assumption, not multiple independent bundles.
- No connector insertion envelopes, strain relief, fatigue, waterproofing or physical approval.

Coordinates, transforms, first collision witnesses and clearance bounds: `integrated-routes.json`.
