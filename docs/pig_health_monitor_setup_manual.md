# 🛠️ Pig Health Monitor: The "Full Power" Setup Manual

> **Objective:** Go from "Zero" to "Code Running" on your laptop.
> **Target OS:** Linux (Primary) / Windows (Compatible via VS Code)

---

## 1. The Arsenal (Download These First)

Before you touch the code, you need the **Tools of the Trade**.

### A. VS Code (The Editor)
*   **Download:** [code.visualstudio.com](https://code.visualstudio.com/)
*   **Why:** It is the industry standard. Do not use Arduino IDE; it is too weak for this project.

### B. PlatformIO (The Embedded Brain)
*   *This is an Extension inside VS Code.*
1.  Open VS Code.
2.  Click the **Extensions Icon** (Left Sidebar, looks like blocks).
3.  Search for `PlatformIO IDE`.
4.  Click **Install**. (Wait for the alien icon to appear on the left).
*   **Why:** It manages the ESP32 libraries/drivers for you automatically.

### C. Python 3 (The Simulator & AI)
*   **Linux:** `sudo apt install python3 python3-pip`
*   **Windows:** Download from [python.org](https://www.python.org/) (Check "Add to PATH" during install).

### D. Node.js (The App Backend)
*   **Linux:** `sudo apt install nodejs npm`
*   **Windows:** Download from [nodejs.org](https://nodejs.org/).

---

## 2. The Ritual of Installation (Setting up the Repo)

Now that you have the tools, let's set up the project.

### Step 1: Open the Project
1.  Open VS Code.
2.  **File** > **Open Folder...**
3.  Select: `.../shikigami_memory/capstone_pig_health_monitor/`

### Step 2: Initialize Firmware (ESP32)
1.  Click the **PlatformIO Alien Icon** (Left Sidebar).
2.  Click **Pick a folder** or **Open Project**.
3.  Navigate to `capstone_pig_health_monitor/firmware`.
4.  *Magic:* PlatformIO will detect the `platformio.ini` (I need to create this for you!) and download the ESP32 toolchain automatically.

### Step 3: Initialize Simulator (Python)
1.  Open a Terminal in VS Code (`Ctrl + ~`).
2.  Navigate to scripts: `cd scripts`
3.  Run the simulator: `python3 mock_data_generator.py`
4.  *Success:* You should see "📡 Sending: ..."

---

## 3. How to "Flash" the Code (Burning the Soul)

When your **ESP32-S3** hardware arrives:

1.  **Plug it in:** Connect ESP32 to Laptop via USB-C.
2.  **Check Connection:**
    *   Click the **PlatformIO Alien**.
    *   Look for "Devices" or "Ports". (e.g., `/dev/ttyUSB0` or `COM3`).
3.  **The "Arrow" Button:**
    *   Look at the bottom blue bar in VS Code.
    *   Click the **Right Arrow (→)** icon. (This means "Upload").
4.  **Monitor:**
    *   Click the **Plug Icon (🔌)** to open the Serial Monitor.
    *   You should see: `🐷 Pig Health Monitor: Listening...`

---

## 4. Troubleshooting (The "It Broken" Guide)

| **Error** | **Fix** |
| :--- | :--- |
| `pyserial module not found` | Run: `pip install pyserial` |
| `Upload Failed` | Hold the **BOOT** button on the ESP32 while plugging it in. |
| `No module named 'EdgeImpulse'` | We haven't reached Phase 5 yet. Relax. |

---

## 5. Next Actions for the Team

*   **Member 1 (Hardware):** Install PlatformIO and try to compile the empty code.
*   **Member 2 (Software):** Run the Python Simulator and read the logic.
*   **Member 3 (App):** Install Node.js and React Native CLI.

(You are now technically ready to build.)
