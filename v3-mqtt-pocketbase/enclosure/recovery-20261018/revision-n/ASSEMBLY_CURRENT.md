# Current N assembly ledger — supersedes older length suggestions

No physical hardware dimensions or fit were measured. `fastener-ledger.json` is
reproducible nominal CAD arithmetic, not a released purchase BOM. Older F advice
M3x12 for8mm grip, M3x20 for16mm grip and M3x16 for12mm grip is too short under
the explicit allowance used here: two0.5mm washers,2.4mm nut,1mm exposed thread.
Required lengths are12.4,20.4,16.4mm respectively. The arithmetic caught this
documentation defect; it does not certify real hardware engagement.

Use the JSON joint list for provisional counts, grips and length choices. Some
lengths may require different stock or trimming; never blindly choose longer
bolts where ends could hit boards. Upper thermal M3x40 margin is only0.381mm
under ideal assumptions: particularly sensitive to tolerances/actual hardware.
All selections require actual fit/engagement inspection. Head/washer envelope
at cradle remains6mm diameter×2.4mm; do not add washers beyond that height.

Exported-surface cross-check: `grip-surface-checks.json` records11 downward rays
on real exported STL annuli: four hood seats,four cradle seats,two SHT standoff
tops and one spacer top. All agree with ledger source dimensions within0.025mm.
This verifies selected CAD surfaces, not assembled nut seating or real bolt fit.
Run `blender -b --python-exit-code 1 --python check_grip_surfaces.py` from parent.

## Assembly sequence

1. Inspect/deburr prints; establish actual hole clearance and dimensions.
2. Fit SHT arm and tubs to rear spine before electronics obstruct nut access.
   SHT arm/spine forward hardware must stay within the tested7mm diameter×3mm
   forward projection envelope. Thermal edge notches have nominal3.8mm radius
   and6mm forward depth; tested radial clearance is only0.3mm before print
   tolerance. Check actual nut/head/washer and socket separately. Notches are
   open,not sealed; length ledger does not establish hardware/access compatibility.
3. Install main tray on four6mm spacers, insulating boards and bolt ends.
4. Strap actual microphone breakout(s) to carriers, port over aperture. Do not
   infer dual-channel microphone hardware from two drawn ports. Fasten carriers
   before closing acoustic face. Optional mint trims require compatible adhesive.
   Strap retention alone is NOT an acoustically controlled coupling. Identify
   actual PCB bottom port and measure board-to-face gap. Provide a short,
   unobstructed,locally sealed path using a breakout-specific gasket/interface;
   avoid a broad cavity behind a small vent. No fitted gasket is supplied or
   validated. Do not glue over port or apply solvent/air pressure into it.
   Compare recordings before/after housing and mesh; see manufacturer research.
5. Fit actual thermal board to raised cradle without blocking lens or straps.
   Bolt cradle to separator with hood OFF using unequal grip lengths in ledger.
   Check real nut/driver access before assembly. Then fit separator/hood to tub.
   Locate actual optical pupil and identify lens variant. Nominal FOV is a
   sensitivity specification,not a hard optical boundary. Centered16mm ray
   clearance is NOT an approved placement: sampled pointing/offset cases clip.
  9.5/12mm exploratory results do not certify those placements either. Verify
   enclosure-on/off thermal response and edge clipping with actual hardware.
6. Install external SHT carrier, sensor opening exposed and ties off sensor.
7. Route insulated cables through real exits with separate strain relief. Keep
   MLX path to Pi per canon; no routing/firmware changes implied.
8. Fit covers; inspect wire pinch, screw engagement and electrical clearance.
   Apply original artwork label. Do not cover thermal aperture with ordinary glass.

No installed sensor, electrical/optical/acoustic/airflow,load,ingress or animal-use
validation performed. Open case is not IP-rated. Do not deploy in washdown or on
animals based on these digital checks. Actual boards may require redesign.
