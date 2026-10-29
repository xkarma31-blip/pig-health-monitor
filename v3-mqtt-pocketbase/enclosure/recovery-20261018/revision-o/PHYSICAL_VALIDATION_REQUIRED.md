# Physical validation still required — no tests below performed

This is a bench-test plan, not evidence of successful tests. Stop if actual
electronics or hardware differ from the assumed CAD; revise before powering.

## Measure before full printing

- Record exact board manufacturer/revision and measured PCB length,width,thickness,
  connector/header/solder protrusions and mounting/strap keep-outs. Resolve actual
  GY-SHT identity (SHT31/SHT45 references conflict). Include actual wire bends.
- Measure actual M3 head,washer,nut and bolt lengths. Cradle head+washer must fit
  diameter6mm×height2.4mm envelope. SHT forward joint envelope assumes diameter7mm
  and depth3mm; test nut and tool separately. Do not equate envelope to compatibility.
- Establish printer hole clearance and shrinkage using a coupon before whole case.

## Unpowered test assembly

- Inspect warped walls,layer adhesion,support removal and flat bearing surfaces.
- Fit spine/tubs/SHT arm first; check notches expose fasteners and retain enough
  wall for actual clamp/load. Verify real driver and nut access in chosen sequence.
- Inspect all bolt engagement and protruding ends. Upper thermal nominal40mm has
  only0.381mm calculated margin under provisional washer/nut assumptions.
- Install boards with insulating supports and gentle straps. Check antenna,
  solder and connector clearance,wire pinch and external strain relief.
- Fit cradle with hood removed; then fit hood. Verify sensor optical axis and
  actual pupil position; no ordinary glass/plastic cover over thermal aperture.

## Function and safety checks before any barn use

- Compare thermal image with/without enclosure across intended scene and angles;
  inspect edge clipping and temperature bias against appropriate reference.
- Compare actual microphone recordings with/without carrier/mesh at controlled
  geometry; assess obstruction,resonance and noise. Two ports do not prove stereo.
- Compare SHT readings with reference instrument before/after enclosure mounting;
  inspect lag,self-heating and airflow effects. Record conditions and uncertainty.
- Check power supply,insulation,short protection,heat and cable strain under real
  load. No battery safety/retention design has been validated here.
- Engineer and test mounting loads,impact,chemical exposure and cleaning method.
  Open passages/notches mean no IP claim; no washdown or animal-contact approval.

Record measurements,photos,printer/material/profile,hardware and results with
dates. Failure must trigger revision,not relabeling of digital checks as physical
success. Safe thresholds require the actual intended operating requirements;
none are invented here.
