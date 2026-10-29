# PigPulse Modular Enclosure - 3D Printing & Fabrication Guide
**Canon Repository:** `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/enclosure`  
**Generated 3D Model:** `pigpulse_modular_case.blend`  
**High-Res Technical Render:** `/tmp/pigpulse_render/pigpulse_case_exploded.png`

---

## 1. Grounded Architecture & Separation of Concerns

As highlighted in the architecture diagram, **the electronics cannot be 3D printed** — they are industrial components fitted into precision snap/boss mounts inside the printable shells:

```
           [ 1. Thermal Sensor Module ]  --> Angled 15° Downward FOV (Pen Coverage)
                     │
             (M12 4-Pin IP65 Gland)     --> I2C: MLX90640 (SDA, SCL, 3V3, GND)
                     │
            [ 2. Main Enclosure Body ]  --> ESP32-S3 Board + LiPo 2000mAh + Charge IC
                     │
             (M12 5-Pin IP65 Gland)     --> I2S: INMP441 / S3-Mic (BCLK, WS, SD, 3V3, GND)
                     │
           [ 3. Acoustic Sensor Module ] --> Dual Bottom-Facing Acoustic Ports + Gore Mesh
```

---

## 2. 3D Printable STL Manifest

The 3D printable mechanical parts have been exported to `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/enclosure/stl/`:

| Part Name | Filename | Function & Print Orientation | Recommended Material |
|---|---|---|---|
| **Main Body Lower** | `pigpulse_main_body_lower.stl` | Internal tub with PCB standoffs, M3 corner brass heat-set bosses, cable glands | PETG / ABS / ASA (UV & Ammonia resistant) |
| **Main Body Lid** | `pigpulse_main_body_lid.stl` | Front protective face with gasket tongue & status LED aperture | PETG / ASA |
| **Thermal Housing** | `pigpulse_thermal_module_housing.stl` | 15° down-angled Germanium lens bezel & MLX90640 mounting plate | PETG / ASA (Black) |
| **Acoustic Housing** | `pigpulse_acoustic_module_housing.stl` | Dual resonant mic chambers with dust/splash drip lips | PETG / ASA |
| **Pole Clamp Bracket** | `pigpulse_pole_mounting_bracket.stl` | Clamps to standard 48 mm steel farm pen posts via hose clamps / U-bolts | PETG / Polycarbonate (High strength) |

---

## 3. Recommended Print & Hardware Slicing Specs

1. **Filament:** **PETG or ASA** (Avoid standard PLA; swine barns contain high ambient humidity and ammonia fumes which degrade PLA within months).
2. **Layer Height:** `0.20 mm` (0.16 mm for the lens and mic bezels).
3. **Wall Perimeters:** `4 perimeters` (minimum 1.6 mm shell thickness for water ingress resistance).
4. **Infill:** `30% Gyroid` for impact resistance against animal contact or high-pressure hose-downs.
5. **Gasket Sealing:**
   - 2 mm Silicone cord / O-ring channel around perimeter (`Gasket_Main`).
   - M3 brass threaded heat-set inserts (M3 x 4 mm x 5 mm OD) in the 4 corner bosses.
   - Waterproof acoustic membrane (e.g. Gore IP67 acoustic vent sticker) behind the front dual mic grills.
   - M12 x 1.5 IP68 waterproof nylon cable glands for inter-module wiring.
