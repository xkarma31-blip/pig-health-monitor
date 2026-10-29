# Revision F — digital prototype assembly and evidence

## Identity and fidelity

Approved original is preserved one level up as original-poster.png. Source pixels,
including full tagline, are used for the front label. No replacement font or
invented logo symbol. Housing retains charcoal three-module stack, downward
angled top face and dual lower ports. External bolted spine deliberately replaces
fictional twist-lock connectors: real attachment is preferable to fake hardware.
SHT is offset externally for exposure to ambient air; it changes overall width.
This is NOT a dimensionally exact replica of the poster's 120×200×35 concept.

## Print quantities / placement

Print one of each STL except acoustic_trim ×2, microphone_strap_carrier ×2 and
tray_spacer_6mm ×4. optical_trim is optional cosmetic spare and is NOT installed
over the rectangular aperture (it would obstruct it). All supplied STLs are in
millimeters in bed orientation, lowest surface Z=0. Do not export the transformed
assembled scene as a printable whole. Thermal hood needs removable supports.

## Purchased hardware — provisional stack calculations, not a measured BOM

- Main and acoustic lid joints: 8 M3 bolts, nominal 33mm printed grip each;
  start with M3×40 plus washers and nuts. Four thermal stack joints have varying
  grip: 14mm tub + 3mm face + wedge 12.52mm at y=-13 or 19.48mm at y=+13.
  Start M3×35 lower pair, M3×45 upper pair; actual thread engagement and tool access
  must be checked after printing. No heat-set inserts modeled or required.
- Spine-to-module rear fixings: 6 M3×12 bolts, washers and nuts, nominal 8mm grip.
- SHT arm-to-spine: 2 M3×16, nominal 10mm grip; carrier-to-arm: 2 M3×20, nominal
  16mm grip (5mm arm + 8mm standoff + 3mm carrier). All lengths are starting points.
- Electronics tray: 4 M3×16, 6mm printed spacers, washers/nuts; nominal 12mm grip.
- Mic and thermal carrier fixings: M3×10–12 starting lengths, washers/nuts; do not
  overtighten straps or obstruct mic port or thermal lens.
- Nonconductive soft straps/cord or thin cable ties for boards, strain relief and
  mount straps. Adhesive for acoustic trim rings, optional acoustic mesh and label.
- Optional purchased indicator/light pipe through 3mm opening. Rendered green
  lens and metal heads are visual proxies, not printable electronics or included BOM.
- No battery is specified: do not install an unprotected LiPo based on the poster.
  No battery retention, charger safety, endurance or thermal safety is certified.

## Assembly order

1. Inspect and deburr prints; fit-test M3 holes and straps using spare material.
2. Bolt external SHT arm and each tub to the common spine; fasten rear bolts before
   loading electronics. Thread straps through spine slots for a post, or choose
   separately engineered wall hardware. No pole diameter/load capacity guaranteed.
3. Install tray on four 6mm spacers. Route insulated, strain-relieved electronics
   wiring away from bolt ends. Adjustable tray is not proof any board fits.
4. Strap microphone breakout on carrier with actual bottom acoustic port over the
   circular opening; fasten carrier behind lower face. A second carrier is optional
   for actual dual-mic hardware, not required by duplicated mono PCM.
5. Strap thermal breakout to its open carrier; face optical center into aperture.
   The actual sensor may require a wedge/shim or different carrier; lens-to-aperture
   placement and field-of-view are unverified. Do not cover IR aperture with ordinary
   glass, clear plastic or a printed solid disc.
6. Fix SHT carrier onto offset arm; locate actual sensing opening over open center.
   Keep ties off the sensor and leave airflow. No sealed hot main-box installation.
7. Route top/bottom cables through actual module exits, strain-relieve externally.
   Use separate Pi cable path for MLX90640 per canon; no firmware/routing changed.
8. Fasten lids and thermal hood with appropriate length purchased bolts/nuts.
   Apply label and trim rings; apply suitable mic mesh only if function is tested.

## Hardware grounding ledger

No physical dimensions have been measured during this task. Repository's known
ESP32-S3 4MB flash readout is electronic identification, not mechanical metrology.
Vendor examples disagree on SuperMini length (22.5 versus 23.5mm). INMP441 chip
dimensions are not breakout dimensions. SHT31/SHT45 references conflict. Generic
strap carriers deliberately avoid drilling assumed PCB hole patterns. Exact PCB
envelope, protrusions, solder joints, antenna keep-outs and wire bends remain
unverified. No claim that every GY-SHT/MLX/INMP clone fits these carriers.

## Digital checks versus physical limits

- 16 exported STL parts: independent topology, volume, component and scale gates.
- Twelve defined assembled part pairs: exact-boolean overlap below 0.01mm³.
  Mating faces coincide by design; print tolerances and nuts/tool reach are not tested.
- PrusaSlicer 2.7.2 produced actual G-code for all 16 using assumed PETG 235/80 C,
  0.4mm nozzle, 0.2mm layer, 4 perimeters, 20% infill, 220×220mm bed. Hood uses
  buildplate supports. DO NOT run supplied evidence G-code on an unknown printer.
- No physical print, assembly, sensor response, FOV, airflow, Wi-Fi range, long-term
  retention, animal safety, chemical resistance, washdown or ingress test performed.
- Open straps/cable passages mean no IP rating. Not for hose cleaning or exposed
  barn deployment without further protection and testing. Do not repeat poster IP65
  or battery life claims as validated facts.
