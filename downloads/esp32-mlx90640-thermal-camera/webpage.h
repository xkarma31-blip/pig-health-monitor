webpage.h File

Here is the webpage file for webserver, which combines html, CSS, JavaScript and other files. Create a webpage.h file in the same Arduino editor window and paste the following code there.

C++
	
#ifndef WEBPAGE_H
#define WEBPAGE_H
 
#include <Arduino.h>
 
const char WEBPAGE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 MLX90640 Enhanced Thermal Camera</title>
  <style>
    :root {
      color-scheme: dark;
      --bg0: #05070d;
      --bg1: #0b1220;
      --card: rgba(255,255,255,0.075);
      --card2: rgba(0,0,0,0.30);
      --line: rgba(255,255,255,0.14);
      --text: #f5f7fb;
      --muted: #aeb9ca;
      --good: #7bf5c6;
      --warn: #ffd166;
    }
 
    * { box-sizing: border-box; }
 
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(55, 91, 158, 0.42), transparent 38%),
        radial-gradient(circle at top right, rgba(187, 72, 121, 0.22), transparent 32%),
        linear-gradient(135deg, var(--bg1), var(--bg0));
      min-height: 100vh;
    }
 
    .wrap {
      width: min(1180px, 100%);
      margin: 0 auto;
      padding: 18px;
    }
 
    .top {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
 
    h1 {
      font-size: clamp(24px, 4vw, 42px);
      line-height: 1.05;
      margin: 8px 0 5px;
      letter-spacing: -0.045em;
    }
 
    .sub {
      color: var(--muted);
      font-size: 14px;
    }
 
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.08);
      border-radius: 999px;
      padding: 9px 12px;
      color: #dce6f7;
      font-size: 13px;
      white-space: nowrap;
    }
 
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--warn);
      box-shadow: 0 0 16px var(--warn);
    }
 
    .dot.ok {
      background: var(--good);
      box-shadow: 0 0 16px var(--good);
    }
 
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 330px;
      gap: 16px;
      align-items: start;
    }
 
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 14px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(14px);
    }
 
    .cameraShell {
      position: relative;
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      border-radius: 20px;
      overflow: hidden;
      background: #000;
      border: 1px solid rgba(255,255,255,0.18);
    }
 
    canvas {
      width: 100%;
      aspect-ratio: 4 / 3;
      display: block;
      image-rendering: auto;
      background: #000;
    }
 
    .hud {
      position: absolute;
      left: 12px;
      top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      pointer-events: none;
    }
 
    .hud span {
      background: rgba(0,0,0,0.48);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 12px;
      color: #edf3ff;
      backdrop-filter: blur(8px);
    }
 
    .legend {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: center;
      margin: 12px auto 0;
      max-width: 900px;
      color: var(--muted);
      font-size: 12px;
    }
 
    .bar {
      height: 16px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: linear-gradient(90deg,
        #080017,
        #240b55,
        #8d164f,
        #e03b32,
        #ff9a1f,
        #fff36d,
        #ffffff
      );
    }
 
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 14px;
    }
 
    .box {
      background: var(--card2);
      border-radius: 16px;
      padding: 11px 10px;
      border: 1px solid rgba(255, 255, 255, 0.10);
      min-height: 76px;
    }
 
    .label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }
 
    .value {
      display: block;
      font-size: clamp(18px, 3vw, 25px);
      font-weight: 800;
      letter-spacing: -0.03em;
    }
 
    .small {
      color: #9eabba;
      font-size: 12px;
      margin-top: 4px;
    }
 
    .controls {
      display: grid;
      gap: 12px;
    }
 
    .controlTitle {
      font-weight: 800;
      font-size: 16px;
      margin: 2px 0 0;
    }
 
    .control {
      background: var(--card2);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 16px;
      padding: 12px;
      text-align: left;
    }
 
    .control label {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: #dce5f3;
      font-size: 13px;
      margin-bottom: 8px;
    }
 
    .control label strong {
      color: #ffffff;
    }
 
    select, button, input[type="range"] {
      width: 100%;
    }
 
    select, button {
      background: rgba(255,255,255,0.10);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 12px;
      padding: 10px 11px;
      font-weight: 700;
      outline: none;
    }
 
    option { background: #101827; }
 
    button {
      cursor: pointer;
      transition: 0.15s ease;
    }
 
    button:hover {
      background: rgba(255,255,255,0.18);
    }
 
    .buttonRow {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
 
    .toggleLine {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: #dce5f3;
      font-size: 13px;
    }
 
    .toggleLine input { transform: scale(1.15); }
 
    .status {
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
      min-height: 20px;
      text-align: center;
    }
 
    @media (max-width: 980px) {
      .grid { grid-template-columns: 1fr; }
      .controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
 
    @media (max-width: 650px) {
      .wrap { padding: 10px; }
      .panel { padding: 10px; border-radius: 20px; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .controls { grid-template-columns: 1fr; }
      .top { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <h1>MLX90640 Thermal Camera</h1>
        <div class="sub">ESP32-WROOM live thermal stream • 32 × 24 sensor • browser-enhanced image</div>
      </div>
      <div class="pill"><span class="dot" id="liveDot"></span><span id="liveText">Connecting...</span></div>
    </div>
 
    <div class="grid">
      <div class="panel">
        <div class="cameraShell">
          <canvas id="thermal" width="512" height="384"></canvas>
          <div class="hud">
            <span id="hudRange">Range --</span>
            <span id="hudCursor">Move over image</span>
          </div>
        </div>
 
        <div class="legend">
          <span id="legendMin">-- C</span>
          <div class="bar" id="legendBar"></div>
          <span id="legendMax">-- C</span>
        </div>
 
        <div class="stats">
          <div class="box"><span class="label">Center</span><span class="value" id="center">--</span><div class="small">middle 4 pixels</div></div>
          <div class="box"><span class="label">Minimum</span><span class="value" id="min">--</span><div class="small" id="minPos">--</div></div>
          <div class="box"><span class="label">Maximum</span><span class="value" id="max">--</span><div class="small" id="maxPos">--</div></div>
          <div class="box"><span class="label">Average</span><span class="value" id="avg">--</span><div class="small">all 768 pixels</div></div>
          <div class="box"><span class="label">Ambient</span><span class="value" id="ambient">--</span><div class="small">sensor estimate</div></div>
          <div class="box"><span class="label">Speed</span><span class="value" id="fps">--</span><div class="small" id="readMs">--</div></div>
        </div>
 
        <div class="status" id="status">Starting web display...</div>
      </div>
 
      <div class="panel controls">
        <div class="controlTitle">Image Controls</div>
 
        <div class="control">
          <label><strong>Palette</strong><span id="paletteName">Iron</span></label>
          <select id="palette" onchange="setPalette(this.value)">
            <option value="iron" selected>Iron / Thermal</option>
            <option value="rainbow">Rainbow</option>
            <option value="arctic">Arctic</option>
            <option value="gray">Gray</option>
          </select>
        </div>
 
        <div class="control">
          <label><strong>Interpolation</strong><span id="interpName">Smooth</span></label>
          <div class="buttonRow">
            <button onclick="setInterpolation(true)" id="smoothBtn">Smooth</button>
            <button onclick="setInterpolation(false)" id="pixelBtn">Pixel</button>
          </div>
        </div>
 
        <div class="control">
          <label><strong>Detail boost</strong><span id="detailVal">0.35</span></label>
          <input id="detail" type="range" min="0" max="1.2" value="0.35" step="0.05" oninput="setDetail(this.value)">
          <div class="small">Adds light edge/detail enhancement in the browser.</div>
        </div>
 
        <div class="control">
          <label><strong>Frame smoothing</strong><span id="smoothVal">0.35</span></label>
          <input id="temporal" type="range" min="0" max="0.85" value="0.35" step="0.05" oninput="setTemporal(this.value)">
          <div class="small">Higher value reacts faster. Lower value looks steadier.</div>
        </div>
 
        <div class="control">
          <div class="toggleLine">
            <span><strong>Enhanced contrast</strong><br><span class="small">Uses 3% to 97% range for more visible detail.</span></span>
            <input id="contrast" type="checkbox" checked onchange="redrawLast()">
          </div>
        </div>
 
        <div class="control">
          <div class="toggleLine">
            <span><strong>Show hot/cold markers</strong><br><span class="small">Draws max and min crosshairs.</span></span>
            <input id="markers" type="checkbox" checked onchange="redrawLast()">
          </div>
        </div>
 
        <div class="control">
          <button onclick="downloadCsv()">Download Current Frame CSV</button>
        </div>
      </div>
    </div>
  </div>
 
<script>
const SENSOR_W = 32;
const SENSOR_H = 24;
const OUT_W = 512;
const OUT_H = 384;
const FETCH_DELAY_MS = 85;
 
const canvas = document.getElementById('thermal');
canvas.width = OUT_W;
canvas.height = OUT_H;
const ctx = canvas.getContext('2d', { alpha: false });
const imageData = ctx.createImageData(OUT_W, OUT_H);
 
let palette = 'iron';
let useSmoothInterpolation = true;
let detailBoost = 0.35;
let temporalAmount = 0.35;
let temporalPixels = null;
let lastData = null;
let isFetching = false;
 
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fmtC(v) { return Number(v).toFixed(2) + ' C'; }
 
function setPalette(v) {
  palette = v;
  document.getElementById('paletteName').textContent = document.getElementById('palette').selectedOptions[0].textContent;
  updateLegendGradient();
  redrawLast();
}
 
function setInterpolation(v) {
  useSmoothInterpolation = v;
  document.getElementById('interpName').textContent = v ? 'Smooth' : 'Pixel';
  document.getElementById('smoothBtn').style.opacity = v ? '1' : '0.55';
  document.getElementById('pixelBtn').style.opacity = v ? '0.55' : '1';
  redrawLast();
}
 
function setDetail(v) {
  detailBoost = Number(v);
  document.getElementById('detailVal').textContent = detailBoost.toFixed(2);
  redrawLast();
}
 
function setTemporal(v) {
  temporalAmount = Number(v);
  document.getElementById('smoothVal').textContent = temporalAmount.toFixed(2);
}
 
function getPixel(pixels, x, y) {
  x = clamp(x, 0, SENSOR_W - 1);
  y = clamp(y, 0, SENSOR_H - 1);
  return pixels[y * SENSOR_W + x];
}
 
function sampleBilinear(pixels, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, SENSOR_W - 1);
  const y1 = Math.min(y0 + 1, SENSOR_H - 1);
  const fx = x - x0;
  const fy = y - y0;
 
  const p00 = getPixel(pixels, x0, y0);
  const p10 = getPixel(pixels, x1, y0);
  const p01 = getPixel(pixels, x0, y1);
  const p11 = getPixel(pixels, x1, y1);
 
  return lerp(lerp(p00, p10, fx), lerp(p01, p11, fx), fy);
}
 
function applyTemporalSmoothing(newPixels) {
  if (!temporalPixels || temporalPixels.length !== newPixels.length) {
    temporalPixels = newPixels.slice();
    return temporalPixels;
  }
 
  const alpha = clamp(temporalAmount, 0, 1);
  for (let i = 0; i < newPixels.length; i++) {
    temporalPixels[i] = temporalPixels[i] + alpha * (newPixels[i] - temporalPixels[i]);
  }
  return temporalPixels;
}
 
function enhanceDetails(pixels) {
  if (detailBoost <= 0.001) return pixels;
  const out = new Array(pixels.length);
 
  for (let y = 0; y < SENSOR_H; y++) {
    for (let x = 0; x < SENSOR_W; x++) {
      const i = y * SENSOR_W + x;
      const c = pixels[i];
      const n = (
        getPixel(pixels, x - 1, y) +
        getPixel(pixels, x + 1, y) +
        getPixel(pixels, x, y - 1) +
        getPixel(pixels, x, y + 1)
      ) * 0.25;
      out[i] = c + detailBoost * (c - n);
    }
  }
  return out;
}
 
function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}
 
function getDisplayRange(pixels, rawMin, rawMax) {
  if (document.getElementById('contrast').checked) {
    let lo = percentile(pixels, 0.03);
    let hi = percentile(pixels, 0.97);
    if (hi - lo < 0.5) {
      lo = rawMin;
      hi = rawMax;
    }
    return [lo, hi];
  }
  return [rawMin, rawMax];
}
 
function colorStopsForPalette(name) {
  if (name === 'gray') {
    return [
      [0.00, [0,0,0]], [1.00, [255,255,255]]
    ];
  }
  if (name === 'arctic') {
    return [
      [0.00, [1,10,35]], [0.25, [0,80,160]], [0.50, [0,210,255]],
      [0.75, [170,255,230]], [1.00, [255,255,255]]
    ];
  }
  if (name === 'rainbow') {
    return [
      [0.00, [35,0,80]], [0.16, [0,0,255]], [0.33, [0,180,255]],
      [0.50, [0,255,80]], [0.66, [255,255,0]], [0.83, [255,90,0]], [1.00, [255,255,255]]
    ];
  }
  return [
    [0.00, [0,0,12]], [0.18, [34,6,75]], [0.36, [132,20,78]],
    [0.55, [224,58,48]], [0.72, [255,151,31]], [0.88, [255,243,105]], [1.00, [255,255,255]]
  ];
}
 
function thermalColor(t) {
  t = clamp(t, 0, 1);
  const stops = colorStopsForPalette(palette);
 
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0]);
      return [
        lerp(a[1][0], b[1][0], k),
        lerp(a[1][1], b[1][1], k),
        lerp(a[1][2], b[1][2], k)
      ];
    }
  }
  return stops[stops.length - 1][1];
}
 
function updateLegendGradient() {
  const stops = colorStopsForPalette(palette)
    .map(s => `rgb(${s[1][0]},${s[1][1]},${s[1][2]}) ${Math.round(s[0] * 100)}%`)
    .join(',');
  document.getElementById('legendBar').style.background = `linear-gradient(90deg, ${stops})`;
}
 
function drawMarker(sensorX, sensorY, label, color) {
  const x = (sensorX / (SENSOR_W - 1)) * OUT_W;
  const y = (sensorY / (SENSOR_H - 1)) * OUT_H;
 
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 5;
 
  ctx.beginPath();
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x, y + 12);
  ctx.stroke();
 
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();
 
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(label, clamp(x + 9, 4, OUT_W - 90), clamp(y - 9, 14, OUT_H - 4));
  ctx.restore();
}
 
function drawThermal(data) {
  const rawPixels = data.pixels;
  let pixels = applyTemporalSmoothing(rawPixels);
  pixels = enhanceDetails(pixels);
 
  const range = getDisplayRange(pixels, data.min, data.max);
  const displayMin = range[0];
  const displayMax = range[1];
  const span = Math.max(0.25, displayMax - displayMin);
 
  for (let py = 0; py < OUT_H; py++) {
    const sySmooth = (py / (OUT_H - 1)) * (SENSOR_H - 1);
    const syPixel = Math.floor((py / OUT_H) * SENSOR_H);
 
    for (let px = 0; px < OUT_W; px++) {
      const sxSmooth = (px / (OUT_W - 1)) * (SENSOR_W - 1);
      const sxPixel = Math.floor((px / OUT_W) * SENSOR_W);
 
      const temp = useSmoothInterpolation
        ? sampleBilinear(pixels, sxSmooth, sySmooth)
        : getPixel(pixels, sxPixel, syPixel);
 
      const c = thermalColor((temp - displayMin) / span);
      const o = (py * OUT_W + px) * 4;
      imageData.data[o + 0] = c[0];
      imageData.data[o + 1] = c[1];
      imageData.data[o + 2] = c[2];
      imageData.data[o + 3] = 255;
    }
  }
 
  ctx.putImageData(imageData, 0, 0);
 
  if (document.getElementById('markers').checked) {
    drawMarker(data.maxX, data.maxY, 'HOT ' + fmtC(data.max), '#ffffff');
    drawMarker(data.minX, data.minY, 'COLD ' + fmtC(data.min), '#62d9ff');
  }
 
  document.getElementById('legendMin').textContent = displayMin.toFixed(1) + ' C';
  document.getElementById('legendMax').textContent = displayMax.toFixed(1) + ' C';
  document.getElementById('hudRange').textContent = 'Display range ' + displayMin.toFixed(1) + '–' + displayMax.toFixed(1) + ' C';
}
 
function redrawLast() {
  if (lastData) drawThermal(lastData);
}
 
function updateNumbers(data) {
  document.getElementById('center').textContent = fmtC(data.center);
  document.getElementById('min').textContent = fmtC(data.min);
  document.getElementById('max').textContent = fmtC(data.max);
  document.getElementById('avg').textContent = fmtC(data.avg);
  document.getElementById('ambient').textContent = fmtC(data.ambient);
  document.getElementById('fps').textContent = data.fps.toFixed(1) + ' fps';
  document.getElementById('readMs').textContent = data.readMs + ' ms read time';
  document.getElementById('minPos').textContent = 'x=' + data.minX + ', y=' + data.minY;
  document.getElementById('maxPos').textContent = 'x=' + data.maxX + ', y=' + data.maxY;
  document.getElementById('status').textContent = 'Frame ' + data.frame + ' • updated ' + new Date().toLocaleTimeString();
  document.getElementById('liveDot').classList.add('ok');
  document.getElementById('liveText').textContent = 'Live';
}
 
async function updateFrame() {
  if (isFetching) return;
  isFetching = true;
 
  try {
    const res = await fetch('/data?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
 
    if (!data.ok) {
      document.getElementById('status').textContent = data.error || 'Sensor not ready';
      document.getElementById('liveDot').classList.remove('ok');
      document.getElementById('liveText').textContent = 'Sensor error';
      return;
    }
 
    lastData = data;
    drawThermal(data);
    updateNumbers(data);
  } catch (e) {
    document.getElementById('status').textContent = 'Web update error: ' + e;
    document.getElementById('liveDot').classList.remove('ok');
    document.getElementById('liveText').textContent = 'Disconnected';
  } finally {
    isFetching = false;
    setTimeout(updateFrame, FETCH_DELAY_MS);
  }
}
 
canvas.addEventListener('mousemove', (ev) => {
  if (!lastData) return;
  const rect = canvas.getBoundingClientRect();
  const x = clamp((ev.clientX - rect.left) / rect.width, 0, 0.9999);
  const y = clamp((ev.clientY - rect.top) / rect.height, 0, 0.9999);
  const sx = Math.floor(x * SENSOR_W);
  const sy = Math.floor(y * SENSOR_H);
  const temp = getPixel(lastData.pixels, sx, sy);
  document.getElementById('hudCursor').textContent = 'x=' + sx + ' y=' + sy + ' • ' + fmtC(temp);
});
 
canvas.addEventListener('mouseleave', () => {
  document.getElementById('hudCursor').textContent = 'Move over image';
});
 
function downloadCsv() {
  window.location.href = '/csv?ts=' + Date.now();
}
 
setInterpolation(true);
setPalette('iron');
updateFrame();
</script>
</body>
</html>
)rawliteral";
 
#endif





Testing DIY Thermal Camera with Live Web Display

Once the hardware assembly is complete, it’s time to upload the code.

To upload the code, connect your FTDI module directly to the PROG header on the PCB. In the Arduino IDE, go to Tools → Board and select ESP32 Dev Module. Then choose the correct COM port for your FTDI adapter.

Finally, click the Upload button. The code will be uploaded to the ESP32 board. After uploading, power the device and wait for the ESP32 Wi-Fi network to appear.

Connect your phone or computer to the ESP32 Wi-Fi network:

	
Wi-Fi: MLX90640-Camera
Password: 12345678

Then open a browser and go to:

	
192.168.4.1

The webpage will display a live thermal image from the MLX90640 thermal camera. The heatmap shows temperature differences in front of the sensor. Warmer objects, such as your hand or face, will appear in brighter/hotter colors, while cooler background areas will appear in darker/cooler colors.

To test the sensor, move your hand slowly in front of the camera and observe the thermal image changing in real time on the webpage. You can also stand in front of the camera to see your body heat displayed as a thermal image. The webpage also shows useful temperature values such as minimum temperature, maximum temperature, average temperature, and center temperature.

You can use the webpage controls to change the color palette, enable smooth view, view hot/cold markers, and adjust the thermal image display. For the best result, point the sensor toward a clear object with a temperature difference from the background.

Video Tutorial & Guide
DIY Heat Vision Camera Using ESP32 & MLX90640
Watch this video on YouTube.

SHARE.
Facebook
Twitter
Pinterest
LinkedIn
Tumblr
Email
Reddit
Telegram
WhatsApp
 PREVIOUS ARTICLE
IoT Activity Tracker with ESP32 & Accelerometer/Gyroscope
NEXT ARTICLE 
IoT Based PM & Air Quality Monitoring System using ESP32
RELATED POSTS
DIY ESP32 LoRa GPS Tracker with Live Google Maps Integration
When Does an ESP32 PCB Need Controlled Impedance?
Estimate Velocity with GPS + MPU6050 + ESP32 Dead Reckoning
Updated:August 16, 2026
ESP32 Patient Health Monitor (ECG, SpO₂, BPM) & Live Dashboard
Updated:July 26, 20266K
ESP32 Fingerprint Voting Machine with Live Web Dashboard
Updated:July 12, 2026
ESP32 Fingerprint Attendance System with Live Web Dashboard
Updated:July 6, 20262K
ADD A COMMENT
Latest Posts
DIY ESP32 LoRa GPS Tracker with Live Google Maps Integration
September 7, 2026
When Does an ESP32 PCB Need Controlled Impedance?
August 30, 2026
How to Choose an SS14 Replacement for a DC-DC Converter
August 30, 2026
How to Replace a Small-Signal Diode Without Causing Circuit Problems
August 30, 2026
Designing of MPPT Solar Charge Controller using Arduino
August 30, 2026
Estimate Velocity with GPS + MPU6050 + ESP32 Dead Reckoning
August 16, 2026
Types of Diode : Overview, Symbol, Working & Applications
July 26, 2026
ESP32 Patient Health Monitor (ECG, SpO₂, BPM) & Live Dashboard
July 26, 2026
Top Posts & Pages
Designing of MPPT Solar Charge Controller using Arduino
Buck Converter: Basics, Working, Design & Application
ESP32 Patient Health Monitor (ECG, SpO₂, BPM) & Live Dashboard
IoT AC Energy Meter with PZEM-004T & ESP32 WebServer
LD2410 Sensor with ESP32 - Human Presence Detection
How to use INA226 DC Current Sensor with Arduino
12V DC to 220V AC Inverter Circuit & PCB
ECG Graph Monitoring with AD8232 ECG Sensor & Arduino
Categories
Arduino Projects
(197)
Articles
(64)
Learn Electronics
(20)
Product Review
(15)
Tech Articles
(31)
Electronics Circuits
(46)
555 Timer Projects
(21)
Op-Amp Circuits
(7)
Power Electronics
(13)
IoT Projects
(210)
ESP32 MicroPython
(7)
ESP32 Projects
(87)
ESP32-CAM Projects
(15)
ESP8266 Projects
(76)
LoRa/LoRaWAN Projects
(23)
Microcontrollers
(38)
AMB82-Mini IoT AI Camera
(4)
BLE Projects
(18)
STM32 Projects
(19)
Raspberry Pi
(93)
Raspberry Pi Pico Projects
(57)
Raspberry Pi Pico W Projects
(12)
Raspberry Pi Projects
(24)