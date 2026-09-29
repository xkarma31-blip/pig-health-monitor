#!/usr/bin/env python3
"""
Generate PigPulse Hardware Matrix XLSX workbook.
Requirements: openpyxl (installed).
Output: docs/HARDWARE_MATRIX_20260916.xlsx
"""

import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUTPUT = os.path.expanduser("~/pig-health-monitor/docs/HARDWARE_MATRIX_20260916.xlsx")

# ---- Color palette (high contrast, deep navy + cyan/teal) ----
NAVY = "1A1A2E"
CYAN = "0D9488"
LIGHT_CYAN = "14B8A6"
WHITE = "FFFFFF"
LIGHT_GRAY = "F0F4F8"
RED = "DC2626"
AMBER = "F59E0B"
GREEN = "16A34A"

header_font = Font(name="Arial", size=12, bold=True, color=WHITE)
header_fill = PatternFill(start_color=NAVY, end_color=NAVY, fill_type="solid")
subheader_font = Font(name="Arial", size=11, bold=True, color=NAVY)
subheader_fill = PatternFill(start_color=LIGHT_CYAN, end_color=LIGHT_CYAN, fill_type="solid")
body_font = Font(name="Arial", size=10, color="FF222222")
label_font = Font(name="Arial", size=10, bold=True, color=NAVY)
wrap_align = Alignment(wrap_text=True, vertical="top")
header_align = Alignment(wrap_text=True, vertical="center", horizontal="center")
thin_border = Border(
    left=Side(style="thin", color=NAVY),
    right=Side(style="thin", color=NAVY),
    top=Side(style="thin", color=NAVY),
    bottom=Side(style="thin", color=NAVY),
)

def color_for_label(label):
    if label == "OFFICIAL":
        return PatternFill(start_color=GREEN, end_color=GREEN, fill_type="solid")
    elif label == "ESTIMATE":
        return PatternFill(start_color=AMBER, end_color=AMBER, fill_type="solid")
    elif label == "MEASURED":
        return PatternFill(start_color=CYAN, end_color=CYAN, fill_type="solid")
    elif label == "CORRECTION":
        return PatternFill(start_color=RED, end_color=RED, fill_type="solid")
    else:
        return None

def write_header_row(ws, row, headers, widths=None):
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border
    if widths:
        for col_idx, width in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(col_idx)].width = width

def write_data_row(ws, row, data, fill=None):
    for col_idx, value in enumerate(data, 1):
        cell = ws.cell(row=row, column=col_idx, value=value)
        cell.font = body_font if not fill else Font(name="Arial", size=10, color=WHITE, bold=(col_idx==1))
        cell.alignment = wrap_align
        cell.border = thin_border
        if fill:
            cell.fill = fill

def add_section(ws, row, title):
    cell = ws.cell(row=row, column=1, value=title)
    cell.font = Font(name="Arial", size=14, bold=True, color=NAVY)
    cell.fill = PatternFill(start_color=LIGHT_CYAN, end_color=LIGHT_CYAN, fill_type="solid")
    cell.alignment = Alignment(vertical="center")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
    for c in range(1, 7):
        ws.cell(row=row, column=c).border = thin_border
    return row + 1

wb = Workbook()

# ============================================================
# Sheet 1: Component Matrix
# ============================================================
ws1 = wb.active
ws1.title = "Component Matrix"
ws1.sheet_properties.tabColor = CYAN

headers = ["Component", "Parameter", "Value", "Evidence Label", "Source", "Notes"]
widths = [22, 30, 38, 18, 55, 40]
write_header_row(ws1, 1, headers, widths)

# --- ESP32-S3 ---
row = add_section(ws1, 2, "ESP32-S3")
esp32_data = [
    ["ESP32-S3", "Processor", "Xtensa dual-core LX7, up to 240 MHz", "OFFICIAL",
     "ESP32-S3 Datasheet v2.2 (Espressif)", "§2.1"],
    ["ESP32-S3", "SRAM", "512 KB on-chip", "OFFICIAL", "ESP32-S3 Datasheet, §2.1", "Data + instructions"],
    ["ESP32-S3", "RTC SRAM", "16 KB", "OFFICIAL", "ESP32-S3 Datasheet, §2.1", "RTC FAST memory"],
    ["ESP32-S3", "Flash (module)", "16 MB possible; module-dependent", "OFFICIAL",
     "ESP32-S3 Datasheet, §2.2", "Module/config claim, NOT universal SoC value"],
    ["ESP32-S3", "PSRAM (module)", "8 MB possible; module-dependent", "OFFICIAL",
     "ESP32-S3 Datasheet, §2.2", "Module/config claim, NOT universal SoC value"],
    ["ESP32-S3", "Wi-Fi", "2.4 GHz IEEE 802.11b/g/n", "OFFICIAL", "ESP32-S3 Datasheet, §3.1", "20/40 MHz bandwidth"],
    ["ESP32-S3", "Bluetooth", "Bluetooth 5 / BLE", "OFFICIAL", "ESP32-S3 Datasheet, §3.2", "BLE Mesh supported"],
    ["ESP32-S3", "Deep-sleep current", "~7 µA", "OFFICIAL", "ESP32-S3 Datasheet, §4.2.1", "Only RTC powered"],
    ["ESP32-S3", "Active current", "~80–260 mA (Wi-Fi TX)", "OFFICIAL", "ESP32-S3 Datasheet, §5.7", "Varies by mode"],
    ["ESP32-S3", "GPIOs", "45", "OFFICIAL", "ESP32-S3 Datasheet, §2.4", ""],
    ["ESP32-S3", "SIMD/vector", "Yes (INT8 acceleration)", "OFFICIAL", "ESP32-S3 TRM", "2-10x INT8 speedup"],
    ["ESP32-S3", "Physical board variant", "ESP32-S3-WROOM-1 assumed; VERIFY installed module", "ESTIMATE",
     "—", "Cannot confirm without board readout"],
]
for d in esp32_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# --- INMP441 ---
row += 1
row = add_section(ws1, row, "INMP441 MEMS Microphone (×2)")
inmp441_data = [
    ["INMP441", "SNR", "61 dBA", "OFFICIAL",
     "TDK INMP441 Product Page", "CORRECTION: earlier session used 65 dBA — corrected"],
    ["INMP441", "Frequency response", "~60 Hz – 15 kHz (flat)", "OFFICIAL", "TDK INMP441 spec", ""],
    ["INMP441", "Sensitivity", "−26 dBFS at 94 dB SPL", "OFFICIAL", "TDK INMP441 spec", ""],
    ["INMP441", "Supply current", "~1.4 mA (typical, normal mode)", "OFFICIAL", "TDK INMP441 spec", ""],
    ["INMP441", "Interface", "Digital I²S", "OFFICIAL", "TDK INMP441 spec", ""],
    ["INMP441", "Cough frequency range", "0.5 – 5 kHz", "ESTIMATE", "Oduor et al. pig cough audio analysis", ""],
    ["INMP441", "Practical barn range", "2–4 m per microphone", "ESTIMATE",
     "Physics-based; field validation needed", "Distance sweep, noise, clipping check"],
    ["INMP441", "Dual-mic coverage (4×4m pen)", "Adequate with one mic per far wall", "ESTIMATE",
     "Geometry + beam pattern", "Requires field test"],
]
for d in inmp441_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# --- MLX90640 ---
row += 1
row = add_section(ws1, row, "MLX90640 Thermal Array")
mlx_data = [
    ["MLX90640", "Resolution", "32 × 24 pixels (768 pixels)", "OFFICIAL", "MLX90640 Datasheet, §1", ""],
    ["MLX90640", "FOV (wide-angle)", "110° × 75°", "OFFICIAL", "MLX90640 Datasheet, §1", ""],
    ["MLX90640", "Refresh rate", "0.5 – 64 Hz programmable", "OFFICIAL", "MLX90640 Datasheet, §12.2", ""],
    ["MLX90640", "Supply current", "< 23 mA", "OFFICIAL", "MLX90640 Datasheet, §1", ""],
    ["MLX90640", "NETD", "~0.1 K RMS at 1 Hz", "OFFICIAL", "MLX90640 Datasheet, §12.3", ""],
    ["MLX90640", "Interface", "I²C", "OFFICIAL", "MLX90640 Datasheet", ""],
    ["MLX90640", "Operating temp", "−40°C to 85°C", "OFFICIAL", "MLX90640 Datasheet", ""],
    ["MLX90640", "Target temp range", "−40°C to 300°C", "OFFICIAL", "MLX90640 Datasheet", ""],
    ["MLX90640", "Frame accuracy (0–50°C Ta)", "±1°C (uniformity zone 1)", "OFFICIAL", "MLX90640 Datasheet, §12.1", ""],
    ["MLX90640", "Frame accuracy (−40°C)", "±5°C", "OFFICIAL", "MLX90640 Datasheet, §12.1", ""],
    ["MLX90640", "Pixel accuracy", "±1°C to ±2°C per zone; ±2%*|To−Ta|", "OFFICIAL", "MLX90640 Datasheet, §12.1.1", "Zones 1/2/3 specified"],
    ["MLX90640", "FOV footprint at 1.5 m", "~4.3 m × 2.3 m", "ESTIMATE",
     "Calculated: 2d·tan(55°), 2d·tan(37.5°)", ""],
    ["MLX90640", "FOV footprint at 2.0 m", "~5.7 m × 3.1 m", "ESTIMATE",
     "Calculated; usable area lower after angle", ""],
    ["MLX90640", "Pixel size at 1.5 m", "~13 cm × 10 cm", "ESTIMATE", "Calculated from FOV / pixels", ""],
    ["MLX90640", "Pixel size at 2.0 m", "~18 cm × 13 cm", "ESTIMATE", "Calculated from FOV / pixels", ""],
    ["MLX90640", "Ear identification at pen dist.", "NOT possible", "OFFICIAL",
     "32×24 = 2–4 pixels per pig ear", "Insufficient for YOLO detection"],
    ["MLX90640", "Zone-level detection", "Feasible (warm blob + relative threshold)", "ESTIMATE",
     "Supported by zone-tracker implementation", ""],
]
for d in mlx_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# --- BME280 ---
row += 1
row = add_section(ws1, row, "BME280 Environmental Sensor")
bme_data = [
    ["BME280", "Temperature accuracy", "±0.5°C (0–65°C)", "OFFICIAL",
     "BME280 Datasheet, §1", "Absolute accuracy"],
    ["BME280", "Humidity accuracy", "±3% RH (20–80% RH, 25°C)", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Pressure accuracy", "±1 hPa (300–1100 hPa)", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Current (h+t, 1Hz)", "1.8 µA", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Current (p+t, 1Hz)", "2.8 µA", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Current (h+p+t, 1Hz)", "3.6 µA", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Sleep current", "0.1 µA", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Operating range", "−40…+85°C, 0…100% RH, 300…1100 hPa", "OFFICIAL", "BME280 Datasheet, §1", ""],
    ["BME280", "Interface", "I²C (up to 3.4 MHz), SPI", "OFFICIAL", "BME280 Datasheet", ""],
]
for d in bme_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# --- Raspberry Pi 4 ---
row += 1
row = add_section(ws1, row, "Raspberry Pi 4 Model B (4GB) — OPTIONAL ADD-ON")
rpi_data = [
    ["RPi 4", "Power requirement", "5 V / 3 A recommended", "OFFICIAL",
     "RPi4 Datasheet, §4.1", "Quality supply mandatory"],
    ["RPi 4", "Wi-Fi", "802.11 b/g/n/ac", "OFFICIAL", "RPi4 Datasheet, §2.2", ""],
    ["RPi 4", "Bluetooth", "5.0 with BLE", "OFFICIAL", "RPi4 Datasheet, §2.2", ""],
    ["RPi 4", "RAM", "4 GB LPDDR4 (configurable)", "OFFICIAL", "RPi4 Datasheet", ""],
    ["RPi 4", "Ambient range", "0–50°C", "OFFICIAL", "RPi4 Datasheet", ""],
    ["RPi 4", "Idle power draw (latest fw)", "~2.47 W", "OFFICIAL",
     "RPi Foundation thermal testing", "Latest firmware SDRAM update"],
    ["RPi 4", "Load power draw", "~6.79 W (synthetic stress)", "OFFICIAL",
     "RPi Foundation thermal testing", ""],
    ["RPi 4", "7-day runtime on 2000 mAh", "NOT FEASIBLE (~2.4 h at idle)", "CORRECTION",
     "Calculated: 5.9 Wh / 2.47 W", "Supersedes earlier 7-day claim"],
    ["RPi 4", "Architecture role", "Optional Linux server / MQTT / dashboard / vision", "OFFICIAL",
     "Architecture decision v3", "NOT in minimum battery node"],
]
for d in rpi_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# --- UPS HAT ---
row += 1
row = add_section(ws1, row, "UPS HAT (B) — OPTIONAL ADD-ON (Pi Power Backup)")
ups_data = [
    ["UPS HAT (B)", "Battery", "2× 18650 Li-ion (NOT included)", "OFFICIAL",
     "Waveshare UPS HAT (B) spec", ""],
    ["UPS HAT (B)", "Battery capacity", "2600 mAh per cell (typical; VERIFY installed cells)", "OFFICIAL",
     "Waveshare spec; verify cell datasheet", ""],
    ["UPS HAT (B)", "Output", "5 V, up to 5 A", "OFFICIAL", "Waveshare UPS HAT (B) spec", ""],
    ["UPS HAT (B)", "Charger input", "8.4 V / 2 A", "OFFICIAL", "Waveshare UPS HAT (B) spec", ""],
    ["UPS HAT (B)", "Nominal energy (2×2600, 3.7V)", "~19.24 Wh", "ESTIMATE",
     "Calculated from typical 18650 spec", ""],
    ["UPS HAT (B)", "Usable energy (80%)", "~15.4 Wh", "ESTIMATE", "Calculated", ""],
    ["UPS HAT (B)", "Pi 4 idle runtime", "~6.2 hours at 2.47 W", "ESTIMATE",
     "Calculated: 15.4 / 2.47", ""],
    ["UPS HAT (B)", "7-day runtime", "NOT FEASIBLE without duty cycling", "ESTIMATE",
     "Requires solar or duty cycle", ""],
]
for d in ups_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# --- ESP-NOW ---
row += 1
row = add_section(ws1, row, "ESP-NOW Wireless")
espn_data = [
    ["ESP-NOW", "Protocol", "Connectionless 2.4 GHz, vendor-specific action frames", "OFFICIAL",
     "ESP-IDF ESP-NOW Docs", ""],
    ["ESP-NOW", "Max packet (v2.0)", "1470 bytes", "OFFICIAL", "ESP-IDF ESP-NOW documentation", ""],
    ["ESP-NOW", "Max packet (v1.0)", "250 bytes", "OFFICIAL", "ESP-IDF ESP-NOW documentation", ""],
    ["ESP-NOW", "Default bit rate", "1 Mbps", "OFFICIAL", "ESP-FAQ", ""],
    ["ESP-NOW", "Channel range", "0–14 (1–13 usable in most regions)", "OFFICIAL", "ESP-IDF ESP-NOW docs", ""],
    ["ESP-NOW", "Security", "CCMP (AES-128) for action frames", "OFFICIAL", "ESP-IDF ESP-NOW docs", ""],
    ["ESP-NOW", "Universal range claim", "NOT guaranteed — varies with environment", "OFFICIAL",
     "Docs specify protocol, not range", ""],
    ["ESP-NOW", "Barn design target", "10–30 m", "ESTIMATE",
     "Physics-based; RSSI/PDR field test needed", ""],
    ["ESP-NOW", "220 m figure", "Open-air, line-of-sight; NOT a farm guarantee", "OFFICIAL",
     "Secondary report; not official guarantee", ""],
]
for d in espn_data:
    row += 1
    label = d[3]
    write_data_row(ws1, row, d, color_for_label(label) if label in ("OFFICIAL", "ESTIMATE") else None)

# ============================================================
# Sheet 2: Power Budget
# ============================================================
ws2 = wb.create_sheet("Power Budget")
ws2.sheet_properties.tabColor = LIGHT_CYAN

write_header_row(ws2, 1, ["Scenario", "Battery (mAh/V)", "Nominal Wh", "Usable Wh (80%)", "Load (W)", "Runtime (h)", "7-Day Feasible?", "Label"], [28, 22, 16, 18, 14, 16, 20, 14])
power_data = [
    ["RPi4 idle on 2000 mAh", "2000 / 3.7 V", 7.4, 5.9, 2.47, 2.4, "NO", "ESTIMATE"],
    ["RPi4 7-day energy needed", "—", 414.96, 331.97, 2.47, 168, "NO (need ~519 Wh battery)", "ESTIMATE"],
    ["ESP32-S3 duty-cycled on 2000 mAh", "2000 / 3.7 V", 7.4, 5.9, 0.030, "~170", "YES (with duty cycling)", "ESTIMATE"],
    ["RPi4 on UPS HAT (2×2600)", "5200 / 3.7 V", 19.24, 15.4, 2.47, 6.2, "NO (backup only)", "ESTIMATE"],
]
for i, d in enumerate(power_data):
    write_data_row(ws2, 2 + i, d)

# Formula section
row = 7
row = add_section(ws2, row, "Power Calculation Formulae")
formulas = [
    ["battery_Wh", "= battery_Ah × nominal_voltage", ""],
    ["usable_Wh", "= battery_Wh × converter_efficiency (assume 80%)", ""],
    ["runtime_hours", "= usable_Wh / average_load_W", ""],
    ["required_battery_Wh", "= average_load_W × target_hours / converter_efficiency", ""],
]
for i, d in enumerate(formulas):
    write_data_row(ws2, row + 1 + i, d)

# ============================================================
# Sheet 3: Range Estimates
# ============================================================
ws3 = wb.create_sheet("Range Estimates")
ws3.sheet_properties.tabColor = AMBER

write_header_row(ws3, 1, ["Signal", "Estimate", "Basis", "Validation Required", "Label"], [28, 22, 40, 40, 14])
range_data = [
    ["ESP-NOW (barn)", "10–30 m", "2.4 GHz penetration, metal pens, physics", "RSSI, PDR, retransmission log", "ESTIMATE"],
    ["INMP441 audio (per mic)", "2–4 m", "Cough SPL vs ambient, distance attenuation", "Distance sweep, ground-truth playback", "ESTIMATE"],
    ["Dual-mic coverage (4×4m pen)", "Adequate (far-wall placement)", "Geometry, beam pattern", "Field test", "ESTIMATE"],
    ["MLX90640 zone detection", "1.5–2.5 m perpendicular", "FOV footprint, pixel resolution", "Thermal map vs pen layout", "ESTIMATE"],
    ["ESP32-S3 → Pi 4 (Wi-Fi)", "10–30 m", "Same channel assumption", "RSSI in actual pen", "ESTIMATE"],
    ["ESP-NOW 220 m figure", "Open-air, line-of-sight only", "Secondary report", "NOT a farm guarantee", "OFFICIAL (unsupported)"],
]
for i, d in enumerate(range_data):
    write_data_row(ws3, 2 + i, d)

# ============================================================
# Sheet 4: Failure Modes
# ============================================================
ws4 = wb.create_sheet("Failure Modes")
ws4.sheet_properties.tabColor = RED

write_header_row(ws4, 1, ["Component", "Primary Failure Mode", "Mitigation", "Label"], [22, 40, 50, 14])
failures = [
    ["ESP32-S3", "Thermal throttling (>85°C ambient)", "Shade enclosure, duty cycle", "ESTIMATE"],
    ["ESP32-S3", "Flash wear from OTA updates", "Wear-leveling, minimize OTA frequency", "ESTIMATE"],
    ["INMP441", "AGC deafening in noisy pen", "Disable AGC, fixed-gain mode", "OFFICIAL+ESTIMATE"],
    ["INMP441", "Clipping from loud coughs", "Input level monitoring, hardware limiter", "ESTIMATE"],
    ["INMP441", "I2S cable length >1m signal loss", "Short cable runs, signal integrity check", "ESTIMATE"],
    ["MLX90640", "Solar heating false positives", "PE film window + shade + ceiling mount", "ESTIMATE"],
    ["MLX90640", "Drift >2°C in 80s", "Die temp compensation LUT", "OFFICIAL+ESTIMATE"],
    ["MLX90640", "Pixel outlier", "Factory calibration, per-unit LUT", "OFFICIAL"],
    ["BME280", "Humidity saturation >80% RH", "Enclosure ventilation design", "OFFICIAL"],
    ["RPi 4", "Power brown-out (<5V)", "Quality 5V/3A supply; UPS HAT", "OFFICIAL"],
    ["RPi 4", "Thermal throttling", "Heatsink + fan; enclosure airflow", "OFFICIAL"],
    ["ESP-NOW", "Packet loss in metal barn", "RSSI/PDR monitoring, multi-hop relay", "ESTIMATE"],
    ["Battery", "Capacity fade over cycles", "Capacity test at deployment; replace schedule", "ESTIMATE"],
    ["LiPo", "Swelling / safety risk", "BMS, enclosure venting, periodic inspection", "OFFICIAL"],
]
for i, d in enumerate(failures):
    write_data_row(ws4, 2 + i, d)

# ============================================================
# Sheet 5: Field Validation
# ============================================================
ws5 = wb.create_sheet("Field Validation")
ws5.sheet_properties.tabColor = GREEN

write_header_row(ws5, 1, ["#", "Test", "Method", "Acceptance Criteria"], [6, 35, 55, 40])
tests = [
    [1, "Board identity verification", "Read installed module model and flash/PSRAM", "Match claimed 16MB/8MB config"],
    [2, "Current measurement", "Power logger per ESP32-S3 operating mode", "Avg/peak within datasheet range"],
    [3, "ESP-NOW wireless test", "RSSI/PDR log at multiple distances/orientations", "PDR >80% at 10–30m in barn"],
    [4, "Acoustic distance sweep", "Labeled cough playback at 1m, 2m, 3m, 4m", "SNR >15 dB at 2m, no clipping"],
    [5, "Thermal FOV mapping", "Map MLX90640 against pen layout", "Zone coverage matches pen geometry"],
    [6, "Thermal ground truth", "Compare vs calibrated thermometer on 5–10 pigs", "Within ±2°C of rectal reading"],
    [7, "Battery runtime test", "Run until cutoff at measured load, 25°C", "Target: >160h duty-cycled ESP32-S3"],
    [8, "I2C/I2S cable test", "Signal integrity at 0.5m, 1.0m, 1.5m", "No CRC errors, no signal loss"],
    [9, "Humidity sensor verification", "BME280 vs psychrometer in pen", "Within ±3% RH across range"],
    [10, "Sunlight false-positive test", "Direct sun exposure on MLX90640", "No fever alerts on healthy pigs in sun"],
]
for i, d in enumerate(tests):
    write_data_row(ws5, 2 + i, d)

# ============================================================
# Sheet 6: Source Index
# ============================================================
ws6 = wb.create_sheet("Source Index")
ws6.sheet_properties.tabColor = NAVY

write_header_row(ws6, 1, ["#", "Source", "URL", "Retrieved"], [6, 45, 80, 14])
sources = [
    [1, "ESP32-S3 Datasheet v2.2", "https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf", "2026-09-16"],
    [2, "INMP441 Product Page (TDK)", "https://product.tdk.com/en/search/sw_piezo/mic/mems-mic/info?part_no=INMP441", "2026-09-16"],
    [3, "MLX90640 Datasheet (Melexis)", "https://media.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf", "2026-09-16"],
    [4, "BME280 Datasheet (Bosch)", "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf", "2026-09-16"],
    [5, "Raspberry Pi 4 Datasheet", "https://pip-assets.raspberrypi.com/categories/545-raspberry-pi-4-model-b/documents/RP-008341-DS-1-raspberry-pi-4-datasheet.pdf", "2026-09-16"],
    [6, "RPi 4 Thermal Testing (Foundation)", "https://www.raspberrypi.com/news/thermal-testing-raspberry-pi-4/", "2026-09-16"],
    [7, "Waveshare UPS HAT (B)", "https://www.waveshare.com/ups-hat-b.htm", "2026-09-16"],
    [8, "ESP-NOW Documentation (Espressif)", "https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp_now.html", "2026-09-16"],
    [9, "ESP-FAQ (ESP-NOW)", "https://docs.espressif.com/projects/esp-faq/en/latest/application-solution/esp-now.html", "2026-09-16"],
    [10, "PigPulse Skill — Hardware Audit Ref", "local: ~/.hermes/skills/pig-health-monitor/.../hardware-audit-and-power-budget-2026-09-16.md", "2026-09-16"],
]
for i, d in enumerate(sources):
    write_data_row(ws6, 2 + i, d)

# Save
wb.save(OUTPUT)
print(f"XLSX saved: {OUTPUT}")
print(f"Size: {os.path.getsize(OUTPUT)} bytes")