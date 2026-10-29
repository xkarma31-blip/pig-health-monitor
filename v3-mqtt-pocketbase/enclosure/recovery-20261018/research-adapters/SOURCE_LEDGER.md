# Dimensional provenance and design allowances

Fetched2026-10-19; not measured from user hardware.

Manufacturer product sources:
- Adafruit4407 MLX90640 narrow:25.7×17.7×16mm overall product.
  https://www.adafruit.com/product/4407
- Adafruit4469 MLX90640 wide:25.8×17.8×10.5mm overall product.
  https://www.adafruit.com/product/4469
- Waveshare MLX90640:28×16mm,2mm mounting holes; height unknown.
  https://www.waveshare.com/wiki/MLX90640-D55_Thermal_Camera
- SparkFun official Eagle outline:25.4×25.4mm PCB, height not derived.
  https://raw.githubusercontent.com/sparkfun/Qwiic_IR_Array_MLX90640/master/Hardware/sparkfun-mlx90640-qwiic-breakout.brd
- Adafruit2857 SHT31:12.7×18×2.6mm product.
  https://www.adafruit.com/product/2857
- Adafruit5665 SHT45:25.5×17.7×4.8mm product.
  https://www.adafruit.com/product/5665

Vendor/secondary, lower certainty:
- SuperMini22.5×18×4.32mm without headers, conflicting23.5×18 reference.
  https://artofcircuits.com/product/esp32-s3-supermini-wifi-bluetooth-5-le-development-board
  https://www.espboards.dev/esp32/esp32-s3-super-mini/
- INMP441 vendor14×12mm board versus14×14×5mm attribute: unresolved.
  https://ifuturetech.org/product/inmp441-mems-high-precision-omnidirectional-microphone-module
- Compact SHT31 vendor12×12mm, not proof of actual GY-SHT45.
  https://easyelecmodule.com/product/sht31-temperature-and-humidity-sensor-module

Chosen allowances are not published dimensions: ESP30×24 plan,12/20mm stacks;
MLX34×30 plan,16/20mm stacks; mic22×20 reservation versus14×12 example PCB;
SHT30×24 reservation versus separate12×12,18×12.7,25.5×17.7 contact inserts.
No universal header height,cable bend,port location or pupil offset is asserted.
Actual connectors/underside parts may exceed these scenarios.

Do not use Adafruit SPH0645 dimensions as INMP441; chip package dimensions as
breakout dimensions; circular-board SEO pages as manufacturing drawings; or
one overall product-height figure as optical pupil projection.
