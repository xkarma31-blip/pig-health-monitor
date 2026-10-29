# Manufacturer-grounded reinforcement — 2026-10-19

Published guidance only: unverified against physical boards, NOT measured hardware.
Research does not convert CAD prototype into a fitted or validated product.

## Thermal: important correction to optical interpretation

Melexis MLX90640 datasheet, revision12, December3 2019, sections4,12.4,13.1:
https://www.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf

Manufacturer lists BAA110x75degree and BAB55x35degree options. Actual fitted
variant unknown. Section12.4's FOV diagram uses50% sensitivity; nominal FOV is
NOT a hard zero-response boundary. Table15 also allows up to5degree central
pointing from normal. Section13.1 says optical path must remain unobstructed;
factory external aperture is installed before calibration and is part of sensor.

Consequence: our centered110x75degree discrete cone is exploratory only,not a
complete optical free-zone specification. Zero blocked rays cannot prove no
radiometric interference. Need actual variant,package aperture/pupil position,
angular alignment/tolerance and enclosure-on/off thermal comparison. Do not add
decorative circular shrouds or infer safe setback from nominal cone alone.

## Humidity: external placement is directionally sensible,not validated accuracy

Sensirion Design Guide for Humidity and Temperature Sensors,D1 v2,March2024,
sections2.3,2.4,3,5:
https://sensirion.com/media/documents/FC5BED84/662B494D/Sensirion_Humidity_Temperature_Design_Guide.pdf

Guide distinguishes stand-alone sensor accuracy from system accuracy; recommends
small dead volume,large air opening,thermal decoupling and representative sampling.
Heat sources affect temperature and RH; manufacturer example at90%RH gives about
5%RH deviation for1degreeC temperature error. This example is not a universal
error bound. Membrane/chemical protection must match actual environment.

Consequence: open offset carrier supports exposure but does not prove protection
from heated airflow,radiation,PCB/wire conduction,dust or chemical contamination.
Identify actual GY-SHT board first. Test response lag/bias under powered system
conditions; don't seal it into the warm main case merely to mimic concept artwork.

## Acoustics: aperture clearance is not acoustic coupling

InvenSense AN-1003-00,revision1.0,December31 2013,mechanical design/sound path/
avoiding resonances. Manufacturer-authored document hosted by distributor:
https://www.cdiweb.com/datasheets/invensense/recommendations-for-mounting-and-connecting-invensense-mems-microphones.pdf

Bottom-port microphones require aligned PCB and case paths. Housing/PCB/gasket
form acoustic circuit; wide cavity plus narrow vent can cause Helmholtz resonance.
Guide recommends small gasket or board directly at case,good interface seal,and
appropriate path diameter. Its typical0.5–1mm holes refer to PCB microphone sound
holes,NOT a mandate to resize our12mm case opening or a breakout dimension.
Its PDM electrical examples must NOT be applied to INMP441 I2S interface.

Consequence: strap retention and unobstructed12mm opening do not establish sealed
port coupling or frequency response. Measure actual breakout port location and
standoff; design a short controlled gasket path without oversized cavity after
measurement. Compare recordings with/without housing/mesh; do not invent a gasket
size from generic chip drawings.

TDK/InvenSense AN-100-00,v1.3,December10 2015,handling/assembly:
https://invensense.tdk.com/wp-content/uploads/2016/03/AN-100-00-MEMS-Microphone-Handling-and-Assembly-Guide-v1.3.pdf
Warns not to blow into/pull air from port,not to ultrasonically clean MEMS,and
cleaning solvents may enter port and damage device. Relevant to barn cleaning:
do not imply washdown-safe electronics because a shell is PETG.

## Evidence boundary and next work

Primary-source thermal PDF downloaded/extracted for exact sections; Sensirion
guide and manufacturer-authored acoustic note read through Exa full-text retrieval.
No vendor dimensions substituted for actual breakout measurements. No geometry
changed solely from generic guidance. Highest remaining integration uncertainty
is actual microphone coupling and thermal free zone/alignment,not mesh topology.
Agent-reach CLI unavailable here; Exa MCP route worked. Update check unavailable.

## Applied sensitivity test

check_optical_alignment.py tests30 conditional cases: both nominal lens FOVs,
setbacks9.5/12/16mm,centered and individual±5degree yaw/pitch. At16mm the wide
variant clips46/441 rays for either yaw extreme,39/441 for either pitch extreme.
Centered16mm passes the nominal-ray test,so the earlier centered-only exploration
was insufficient to justify that setback. Other26 sampled cases have no blocked
rays. See optical-alignment-sweep.json. No interpolation to a universal safe limit.

Action: remove any interpretation that16mm is an approved placement. Current
9.5mm exploratory target has clearance for these sampled angular cases only;
actual assembly offset,pupil and sensitivity tails remain unknown. Do not enlarge
hood blindly from an unmeasured worst-case placement; locate actual sensor first.

Additional60 wide-angle cases combine chosen individual2mm lateral offsets with
centered or individual±5degree yaw/pitch at9.5,12,16mm setbacks. At9.5 and12mm,
all20 sampled cases each have0 blocked rays. At16mm all20 cases clip,up to77/441
rays. optical-offset-sweep.json retains full results.2mm is a sensitivity probe,
not a measured mounting tolerance; diagonal offsets,simultaneous yaw/pitch and
continuous angular response are not covered. No safe placement certification.
