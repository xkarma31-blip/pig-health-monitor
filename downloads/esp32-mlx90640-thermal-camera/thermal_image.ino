thermal_image.ino File

Here is the main.ino code for the ESP32 MLX90640 Thermal Camera project.

C++
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
248
249
250
251
252
253
254
255
256
257
258
259
260
261
262
263
264
265
266
267
268
269
270
271
272
273
274
275
276
277
278
279
280
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
	
/*
  ESP32-WROOM-32 + MLX90640 Enhanced Web Thermal Camera
 
  Only two sketch files are normally edited:
    thermal_image/thermal_image.ino   -> ESP32, Wi-Fi, web server, MLX90640 read logic
    thermal_image/webpage.h           -> Browser UI and thermal image rendering
 
  MLX90640 library stays in:
    libraries/MLX90640/
 
  Hardware wiring:
    ESP32 GPIO21 -> MLX90640 SDA
    ESP32 GPIO22 -> MLX90640 SCL
    ESP32 3V3    -> MLX90640 VIN / 3V3
    ESP32 GND    -> MLX90640 GND
 
  Browser:
    Connect to ESP32 Wi-Fi AP: MLX90640-Camera
    Password: 12345678
    Open: http://192.168.4.1
*/
 
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
 
#include <MLX90640_I2C_Driver.h>
#include <MLX90640_API.h>
 
#include "webpage.h"
 
// ---------------- ESP32 I2C pins ----------------
#define I2C_SDA 21
#define I2C_SCL 22
 
// ---------------- MLX90640 settings ----------------
static const uint8_t MLX90640_ADDR = 0x33;
static const float EMISSIVITY = 0.95f;
static const float TA_SHIFT = 8.0f;
 
// Faster MLX90640 settings:
// Refresh-rate register values used by the Melexis API:
// 0x00=0.5Hz, 0x01=1Hz, 0x02=2Hz, 0x03=4Hz,
// 0x04=8Hz, 0x05=16Hz, 0x06=32Hz, 0x07=64Hz
// Recommended default: 0x04 = 8Hz. Try 0x05 only if wiring is short and stable.
static const uint8_t MLX_REFRESH_RATE = 0x04;  // 8 Hz
 
// 0x00=16-bit, 0x01=17-bit, 0x02=18-bit, 0x03=19-bit
// 18-bit gives good quality. For more speed/noise tradeoff, try 0x01.
static const uint8_t MLX_RESOLUTION = 0x02;    // 18-bit ADC resolution
 
// MLX90640 supports fast I2C. 800 kHz is a good ESP32 balance.
// If unstable, change this to 400000UL. If very stable, you can try 1000000UL.
static const uint32_t I2C_CLOCK_HZ = 800000UL;
 
// Target browser/sensor update period. MLX90640_GetFrameData waits until data is ready,
// so the real speed is still limited by the sensor refresh rate.
static const uint32_t FRAME_INTERVAL_MS = 110;
 
// ---------------- Wi-Fi mode ----------------
// 1 = ESP32 creates its own Wi-Fi network.
// 0 = ESP32 connects to your router/hotspot using WIFI_SSID/WIFI_PASS.
#define USE_AP_MODE 1
 
#if USE_AP_MODE
const char* AP_SSID = "MLX90640-Camera";
const char* AP_PASS = "12345678";  // minimum 8 characters for ESP32 AP mode
#else
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
#endif
 
WebServer server(80);
 
paramsMLX90640 mlxParams;
float thermalPixels[32 * 24];
uint16_t mlxFrame[834];
 
float minTemp = 0.0f;
float maxTemp = 0.0f;
float avgTemp = 0.0f;
float centerTemp = 0.0f;
float ambientTemp = 0.0f;
 
uint16_t minIndex = 0;
uint16_t maxIndex = 0;
uint8_t minX = 0;
uint8_t minY = 0;
uint8_t maxX = 0;
uint8_t maxY = 0;
 
bool sensorReady = false;
bool frameValid = false;
uint32_t lastFrameRequestMs = 0;
uint32_t lastFrameCompleteMs = 0;
uint32_t frameCounter = 0;
uint32_t lastReadDurationMs = 0;
float measuredFps = 0.0f;
String lastError = "Starting";
 
bool isMLXConnected()
{
  Wire.beginTransmission(MLX90640_ADDR);
  return Wire.endTransmission() == 0;
}
 
void calculateStats()
{
  minTemp = thermalPixels[0];
  maxTemp = thermalPixels[0];
  avgTemp = 0.0f;
  minIndex = 0;
  maxIndex = 0;
 
  for (uint16_t i = 0; i < 768; i++)
  {
    const float t = thermalPixels[i];
    avgTemp += t;
 
    if (t < minTemp)
    {
      minTemp = t;
      minIndex = i;
    }
 
    if (t > maxTemp)
    {
      maxTemp = t;
      maxIndex = i;
    }
  }
 
  avgTemp /= 768.0f;
 
  minX = minIndex % 32;
  minY = minIndex / 32;
  maxX = maxIndex % 32;
  maxY = maxIndex / 32;
 
  // Four center pixels around the middle of the 32x24 thermal array.
  centerTemp = (thermalPixels[367] + thermalPixels[368] + thermalPixels[399] + thermalPixels[400]) / 4.0f;
}
 
bool readMLX90640Frame()
{
  if (!sensorReady)
  {
    lastError = "MLX90640 not initialized";
    return false;
  }
 
  const uint32_t startMs = millis();
 
  // MLX90640 uses two subpages. Reading twice gives one complete 32x24 image.
  for (uint8_t subpage = 0; subpage < 2; subpage++)
  {
    int status = MLX90640_GetFrameData(MLX90640_ADDR, mlxFrame);
    if (status < 0)
    {
      lastError = "MLX90640_GetFrameData error: " + String(status);
      frameValid = false;
      return false;
    }
 
    ambientTemp = MLX90640_GetTa(mlxFrame, &mlxParams);
    const float reflectedTemp = ambientTemp - TA_SHIFT;
    MLX90640_CalculateTo(mlxFrame, &mlxParams, EMISSIVITY, reflectedTemp, thermalPixels);
  }
 
  calculateStats();
 
  const uint32_t nowMs = millis();
  lastReadDurationMs = nowMs - startMs;
 
  if (lastFrameCompleteMs > 0)
  {
    const uint32_t dt = nowMs - lastFrameCompleteMs;
    if (dt > 0)
    {
      const float instantFps = 1000.0f / (float)dt;
      measuredFps = (measuredFps <= 0.01f) ? instantFps : (0.75f * measuredFps + 0.25f * instantFps);
    }
  }
 
  lastFrameCompleteMs = nowMs;
  frameCounter++;
  frameValid = true;
  lastError = "OK";
  return true;
}
 
String makeJsonData()
{
  if (!frameValid)
  {
    String err = "{\"ok\":false,\"error\":\"";
    err += lastError;
    err += "\"}";
    return err;
  }
 
  String json;
  json.reserve(10500);
  json += "{\"ok\":true,";
  json += "\"frame\":" + String(frameCounter) + ",";
  json += "\"min\":" + String(minTemp, 2) + ",";
  json += "\"max\":" + String(maxTemp, 2) + ",";
  json += "\"avg\":" + String(avgTemp, 2) + ",";
  json += "\"center\":" + String(centerTemp, 2) + ",";
  json += "\"ambient\":" + String(ambientTemp, 2) + ",";
  json += "\"fps\":" + String(measuredFps, 2) + ",";
  json += "\"readMs\":" + String(lastReadDurationMs) + ",";
  json += "\"minX\":" + String(minX) + ",";
  json += "\"minY\":" + String(minY) + ",";
  json += "\"maxX\":" + String(maxX) + ",";
  json += "\"maxY\":" + String(maxY) + ",";
  json += "\"pixels\":[";
 
  for (uint16_t i = 0; i < 768; i++)
  {
    if (i) json += ',';
    json += String(thermalPixels[i], 2);
  }
 
  json += "]}";
  return json;
}
 
String makeCsvData()
{
  String csv;
  csv.reserve(7200);
 
  for (uint8_t row = 0; row < 24; row++)
  {
    for (uint8_t col = 0; col < 32; col++)
    {
      if (col) csv += ',';
      csv += String(thermalPixels[row * 32 + col], 2);
    }
    csv += '\n';
  }
 
  return csv;
}
 
void setupWebServer()
{
  server.on("/", HTTP_GET, []()
  {
    server.send_P(200, "text/html", WEBPAGE_HTML);
  });
 
  server.on("/data", HTTP_GET, []()
  {
    server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server.sendHeader("Pragma", "no-cache");
    server.send(200, "application/json", makeJsonData());
  });
 
  server.on("/csv", HTTP_GET, []()
  {
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("Content-Disposition", "attachment; filename=mlx90640_frame.csv");
    server.send(200, "text/csv", makeCsvData());
  });
 
  server.on("/health", HTTP_GET, []()
  {
    String health = "ESP32 MLX90640 Enhanced Web Thermal Camera\n";
    health += "Sensor ready: " + String(sensorReady ? "yes" : "no") + "\n";
    health += "Frame valid: " + String(frameValid ? "yes" : "no") + "\n";
    health += "Frame count: " + String(frameCounter) + "\n";
    health += "Measured FPS: " + String(measuredFps, 2) + "\n";
    health += "Read duration ms: " + String(lastReadDurationMs) + "\n";
    health += "I2C clock Hz: " + String(I2C_CLOCK_HZ) + "\n";
    health += "Refresh setting: 0x" + String(MLX_REFRESH_RATE, HEX) + "\n";
    health += "Resolution setting: 0x" + String(MLX_RESOLUTION, HEX) + "\n";
    health += "Last error: " + lastError + "\n";
    server.send(200, "text/plain", health);
  });
 
  server.onNotFound([]()
  {
    server.send(404, "text/plain", "Not found");
  });
 
  server.begin();
}
 
bool initializeMLX90640()
{
  if (!isMLXConnected())
  {
    lastError = "MLX90640 not detected at I2C address 0x33. Check SDA=21, SCL=22, 3.3V, GND.";
    return false;
  }
 
  uint16_t eeMLX90640[832];
  int status = MLX90640_DumpEE(MLX90640_ADDR, eeMLX90640);
  if (status != 0)
  {
    lastError = "MLX90640_DumpEE failed: " + String(status);
    return false;
  }
 
  status = MLX90640_ExtractParameters(eeMLX90640, &mlxParams);
  if (status != 0)
  {
    lastError = "MLX90640_ExtractParameters failed: " + String(status);
    return false;
  }
 
  status = MLX90640_SetRefreshRate(MLX90640_ADDR, MLX_REFRESH_RATE);
  if (status != 0)
  {
    lastError = "SetRefreshRate failed: " + String(status);
    return false;
  }
 
  status = MLX90640_SetResolution(MLX90640_ADDR, MLX_RESOLUTION);
  if (status != 0)
  {
    lastError = "SetResolution failed: " + String(status);
    return false;
  }
 
  status = MLX90640_SetChessMode(MLX90640_ADDR);
  if (status != 0)
  {
    lastError = "SetChessMode failed: " + String(status);
    return false;
  }
 
  sensorReady = true;
  lastError = "OK";
  return true;
}
 
void setupWiFi()
{
  WiFi.setSleep(false);  // lower latency for live streaming
 
#if USE_AP_MODE
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS, 1, false, 4);
 
  Serial.println();
  Serial.println("Wi-Fi AP started");
  Serial.print("SSID: ");
  Serial.println(AP_SSID);
  Serial.print("Password: ");
  Serial.println(AP_PASS);
  Serial.print("Open browser: http://");
  Serial.println(WiFi.softAPIP());
#else
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to Wi-Fi");
 
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(250);
    Serial.print('.');
  }
 
  Serial.println();
  Serial.print("Open browser: http://");
  Serial.println(WiFi.localIP());
#endif
}
 
void setup()
{
  setCpuFrequencyMhz(240);
 
  Serial.begin(115200);
  delay(800);
 
  Serial.println();
  Serial.println("ESP32 MLX90640 Enhanced Web Thermal Camera");
 
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(1000);
 
  Serial.print("I2C SDA: GPIO");
  Serial.println(I2C_SDA);
  Serial.print("I2C SCL: GPIO");
  Serial.println(I2C_SCL);
  Serial.print("I2C clock: ");
  Serial.println(I2C_CLOCK_HZ);
  Serial.println("MLX90640 address: 0x33");
 
  setupWiFi();
  setupWebServer();
 
  if (initializeMLX90640())
  {
    Serial.println("MLX90640 initialized successfully");
    readMLX90640Frame();
  }
  else
  {
    Serial.print("MLX90640 initialization failed: ");
    Serial.println(lastError);
  }
}
 
void loop()
{
  server.handleClient();
 
  const uint32_t now = millis();
  if (now - lastFrameRequestMs >= FRAME_INTERVAL_MS)
  {
    lastFrameRequestMs = now;
    readMLX90640Frame();
  }
}





