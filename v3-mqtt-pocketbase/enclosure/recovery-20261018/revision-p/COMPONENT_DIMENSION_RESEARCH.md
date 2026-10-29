# Component dimensions — source-grounded approximation, work in progress

Fetched 2026-10-19. All values below are published product facts, unverified
against actual user hardware, NOT measured from the board. Do not use sensor-chip
package size as breakout PCB size. Header/cable accommodation is separate.

## Directly fetched sources

- Waveshare MLX90640-D55/D110 wiki: specification gives dimensions28×16mm,
  mounting hole size2mm; height is not supplied in the text specification.
  https://www.waveshare.com/wiki/MLX90640-D55_Thermal_Camera
  A dimension drawing is linked on the page; hole centers not inferred here.
- Adafruit MLX90640 product4469: product dimensions25.8×17.8×10.5mm.
  https://www.adafruit.com/product/4469
  This is one assembled product, not proof of generic GY board dimensions. Page
  contains inconsistent vertical FOV wording70/75°; use exact lens datasheet for
  optics, not that inconsistency as a mechanical design instruction.
- Art of Circuits ESP32-S3 SuperMini listing: dimensions22.5×18×4.32mm
  explicitly WITHOUT HEADERS; elsewhere22.52×18mm. Vendor, not original-board
  manufacturer measurement. Clone variants remain possible.
  https://artofcircuits.com/product/esp32-s3-supermini-wifi-bluetooth-5-le-development-board
- Adafruit SHT31 product2857:12.7×18×2.6mm. It is NOT a GY-SHT identity match.
  https://www.adafruit.com/product/2857
- Adafruit SHT45 product5665:25.5×17.7×4.8mm. It is NOT a GY-SHT identity match.
  https://www.adafruit.com/product/5665

## Deliberately excluded substitution

Adafruit product3421 is SPH0645LM4H,16.7×12.7×1.8mm. Although an I2S mic,
it is NOT INMP441; do not assign those dimensions or port position to INMP441.
https://www.adafruit.com/product/3421

## Engineering reservation hypotheses — NOT manufacturer dimensions

For collision experiments only: ESP30×24×12mm; thermal34×24×16mm;
microphone22×20×12mm; SHT30×24×12mm. These include chosen extra space rather
than representing literal PCB solids. Research of generic variants and installed
header/connector routes is still underway. They do not cover every possible
clone, cable termination, bend radius, antenna keep-out or sensor free zone.
Keep them out of printable exports. Test body and wiring volumes separately.

Next: resolve INMP441 and GY variants, record quoted source evidence, check actual
P mesh collisions, enlarge or reposition carriers only where collisions justify it.

## Independent search findings — verification tier matters

Further directly fetched manufacturer evidence: Adafruit narrow55° MLX90640
product4407 specifies25.7×17.7×16.0mm, materially taller than product4469.
https://www.adafruit.com/product/4407
Independent inspection of official SparkFun Eagle outline reports25.4×25.4mm:
https://raw.githubusercontent.com/sparkfun/Qwiic_IR_Array_MLX90640/master/Hardware/sparkfun-mlx90640-qwiic-breakout.brd
Thus the initial34×24 thermal reservation does NOT even cover that PCB's second
dimension. Revise research-family plan reservation to34×30mm, with separate
16mm published assembled-height example and chosen extra routing/seat allowance.
This is a union of sourced examples, not a guarantee for every thermal board.

Direct retrieval corroborated iFuture's contradictory14×12mm and14×14×5mm
INMP441 entries, and Easyelecmodule's12×12mm SHT31 text. No corresponding
direct evidence yet establishes generic GY-SHT45 board size or header heights.

Independent mic/SHT search report retained separately. It cites iFuture INMP441
listing with conflicting14×12mm board and14×14×5mm dimensions. Direct retrieval
is being checked. AliExpress/Accio search-aggregation articles in that report
are NOT authoritative dimensional drawings; circular-board and header-height
claims from them are not accepted as manufacturer facts. Likewise it groups
GY-SHT31 and GY-SHT45 without proving identical PCB geometry. Do not carry over
its asserted15mm mounting-hole spacing or acoustic gasket dimensions to CAD.

For conservative approximate assembly planning, a12mm height hypothesis may be
too small for untrimmed straight headers plus mating sockets. Test a second
20mm-high installed-connector reservation independently; do not call either a
published maximum. Cable route needs its own volume and cannot be inferred from
an arbitrary universal bend-radius number. Direct-solder and socketed-header
configurations must be distinguished, not mixed into a falsely exact board size.
