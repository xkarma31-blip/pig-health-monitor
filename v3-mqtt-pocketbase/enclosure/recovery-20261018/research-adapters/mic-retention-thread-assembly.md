# Microphone lacing-cord research option

**Not cable ties. Not measured hardware. Not release/fit approval.**
Chosen purchasing-family assumption: round polyester lacing cord, nominal 0.5 mm
diameter. No web research, vendor, stock, insulation rating or tensile claim is
made. Measure the actual cord including coating/fuzz before use. Reject anything
that binds in the existing 0.9 x 1.4 mm tunnels; never enlarge accepted support.

## Assembly (power disconnected; ESD-safe handling)
1. Inspect and deburr printed tunnels without changing their geometry. Prethread
   two independent loops per board, one on each X side, before seating the PCB.
2. Each loop enters a tunnel from local X=+/-9.2 toward +/-5.1 at Y=-5.25,
   Z=9.5. Turn around the nearby outer Y edge at Y=-6.65, rise behind the
   board to Z=13, then run along the top edge lane X=+/-6.65 to Y=+6.65.
   Descend outside that board edge, return through the Y=+5.25 tunnel and
   close the loop along the outboard X=+/-9.2 return. Coordinates are mm in
   support-local axes, not enclosure-world axes. See JSON for every waypoint.
3. Seat the nominal 14 x 12 x 1.6 mm PCB on the unchanged four corner pads.
   Snug by hand only. The model leaves a nominal 0.15 mm gap above the PCB;
   it is a routing envelope, NOT a tension/contact or preload simulation.
4. Tie and trim on the outboard return, inside the reserved 1.8 mm diameter
   knot/tail sphere at X=+/-9.2,Y=0,Z=9.5. If the real knot/tails do not fit,
   reject this option; do not move them over the acoustic bore or PCB.
5. Inspect under magnification before power-up; verify board cannot slip,
   cord cannot migrate inward, fasteners remain accessible and closure clears.

## Electrical and component safety gates
The nominal PCB is a solid rectangular proxy, not a component map. Both edge
lanes and corner bearing patches MUST be inspected on the actual PCB: no cord
over microphone package/port, connectors, pads, exposed copper, solder joints,
sharp leads or fragile components. Polyester is not a certified insulation
barrier: confirm material/coating, temperature, moisture and contamination
compatibility; avoid metallic/conductive thread. Do not use heat or adhesive
near the mic. Do not bend the PCB or load the acoustic package. Reject if safe
edge lanes do not exist. Bench-test pull/slip, knot security, abrasion, vibration,
humidity/creep and acoustic response before deployment. Not a cable strain relief.

The checker uses actual finite swept cord solids and a conservative external
knot envelope against all combined-scene mesh objects, the nominal PCB and sound
keepout. It does not certify threadability, knot topology or real assembly.
