# 🛒 Project Pig Health Monitor: Hardware Bill of Materials (BOM)

**Status:** Ready for Procurement
**Phase:** 1 (Data Acquisition)

To build the **Data Logger** and final **Prototype**, you need the following specific modules. 
*Note: Prices are estimates based on Shopee PH/Lazada.*

---

## 1. Core Computing (The Brain)
| Component | Qty | Spec Requirement | Est. Price | Why? |
| :--- | :---: | :--- | :---: | :--- |
| **ESP32-S3 DevKitC** | 1 | **N16R8** (16MB Flash, 8MB PSRAM) | ₱450 | Needs PSRAM for audio buffering and TinyML operations. **Do not buy basic ESP32.** |
| **Micro SD Card Module** | 1 | SPI Interface | ₱50 | For logging audio samples (.wav) to train the AI later. |
| **Micro SD Card** | 1 | 16GB or 32GB (Class 10) | ₱250 | Storage for weeks of data. |

## 2. Acoustic Array (The Ears)
| Component | Qty | Spec Requirement | Est. Price | Why? |
| :--- | :---: | :--- | :---: | :--- |
| **INMP441 Microphone** | **2** | I2S Interface (Omnidirectional) | ₱120 ea | Digital MEMS mic. Low noise. **We need 2** (one for Pig, one for Noise Ref). |

## 3. Environmental Sensing (The Thermal Eye & Skin)
| Component | Qty | Spec Requirement | Est. Price | Why? |
| :--- | :---: | :--- | :---: | :--- |
| **MLX90640 Thermal Sensor** | 1 | I2C, 32x24 IR Array (768 pixels) | ₱1,200 | Higher resolution non-contact thermal imaging. Validated by research for individual ID. |
| **BME280 Sensor** | 1 | I2C (Temp/Hum/Pressure) | ₱150 | Bosch sensor. Provides ambient temp offset for accurate thermal readings. |

## 4. Power & Logic (The Lifeblood)
| Component | Qty | Spec Requirement | Est. Price | Why? |
| :--- | :---: | :--- | :---: | :--- |
| **18650 Battery Shield** | 1 | 1-slot or 2-slot w/ 5V/3V output | ₱150 | Portable power for the pen-side deployment. |
| **18650 Li-Ion Cells** | 2 | Authentic (e.g., Samsung/LG) | ₱200 ea | Power source. |
| **Breadboard & Wires** | 1 set | Jumper wires (M-M, M-F, F-F) | ₱100 | Prototyping connections. |

---

## ⚠️ Critical Purchasing Notes

1.  **ESP32-S3 vs ESP32**: You **MUST** get the **S3** version. The original ESP32 does not have the "Vector Instructions" that accelerate the TinyML (TensorFlow Lite) math by 3x.
2.  **INMP441 vs MAX4466/9814**: You **MUST** get **INMP441** (I2S Digital). The MAX series are Analog and will be too noisy/hard to process for this specific "Subtract" algorithm.
3.  **BME280 vs BMP280**: Look closely. **BME** measures Humidity. **BMP** does not. You need Humidity to calculate the "Heat Index" (THI).
