import React, { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Image } from 'react-native';
import { Theme } from '../constants/Theme';

const PEPPA_ICON = 'https://upload.wikimedia.org/wikipedia/en/3/3b/Peppa_Pig_character.png';

interface ThermalLiveViewProps {
  base64Frame?: string; // Optional real telemetry frame
  targetX?: number;
  targetY?: number;
  identifiedPig?: string;
  selectedPigToTrack?: string;
  width?: number;
  height?: number;
  isFullscreen?: boolean;
}

const ROWS = 24;
const COLS = 32;

// Professional Ironbow Thermal Color Scale
function getHeatmapColor(value: number): string {
  // value is 0-255
  if (value < 32) {
    // Black to Deep Blue
    return `rgb(0, 0, ${Math.floor((value / 32) * 128)})`;
  } else if (value < 96) {
    // Deep Blue to Purple/Magenta
    const r = Math.floor(((value - 32) / 64) * 128);
    const b = 128 + Math.floor(((value - 32) / 64) * 127);
    return `rgb(${r}, 0, ${b})`;
  } else if (value < 160) {
    // Magenta to Orange
    const r = 128 + Math.floor(((value - 96) / 64) * 127);
    const g = Math.floor(((value - 96) / 64) * 128);
    const b = 255 - Math.floor(((value - 96) / 64) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (value < 224) {
    // Orange to Yellow
    const r = 255;
    const g = 128 + Math.floor(((value - 160) / 64) * 127);
    return `rgb(${r}, ${g}, 0)`;
  } else {
    // Yellow to White
    const r = 255;
    const g = 255;
    const b = Math.floor(((value - 224) / 31) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export function ThermalLiveView({
  base64Frame,
  targetX,
  targetY,
  identifiedPig,
  selectedPigToTrack,
  width = Dimensions.get('window').width - 32,
  height = (width / COLS) * ROWS,
  isFullscreen = false,
}: ThermalLiveViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Custom mock state for physical simulation of moving pig
  const [simulatedFrame, setSimulatedFrame] = useState<Uint8Array>(() => new Uint8Array(COLS * ROWS));
  const [trackerPos, setTrackerPos] = useState({ x: 8, y: 16, temp: 39.9 });
  const frameCounter = useRef(0);
  
  // Simulated positions of pigs in the pen (slow shifting, huddling)
  const pigs = useRef([
    { id: 'Pig A (Peppa)', x: 12, y: 8, targetX: 12, targetY: 8, size: 4.8, baseTemp: 38.4, stepTimer: 0 },
    { id: 'Pig B (Boss Hog)', x: 20, y: 14, targetX: 20, targetY: 14, size: 5.2, baseTemp: 38.1, stepTimer: 0 },
    { id: 'Pig C (Fever)', x: 8, y: 16, targetX: 8, targetY: 16, size: 4.5, baseTemp: 39.9, stepTimer: 0 },
  ]);

  // Simulation loop when no active ESP32 base64Frame is provided
  useEffect(() => {
    if (base64Frame) return; // Skip if we have live feed

    const runSimulation = () => {
      frameCounter.current += 1;
      
      // Update pig coordinates slowly (pigs shift positions every few seconds)
      pigs.current.forEach(pig => {
        pig.stepTimer += 1;
        
        // Every 120-180 frames (approx 2-3 seconds), maybe take a slow, tiny step
        if (pig.stepTimer > (120 + Math.random() * 60)) {
          pig.stepTimer = 0;
          
          // Small chance to shift target coordinate slightly within natural bounds
          if (Math.random() > 0.4) {
            const shiftX = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
            const shiftY = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
            
            pig.targetX = Math.max(4, Math.min(COLS - 5, pig.targetX + shiftX));
            pig.targetY = Math.max(4, Math.min(ROWS - 5, pig.targetY + shiftY));
          }
        }
        
        // Interpolate slowly towards target position (adds realistic slow shifting)
        pig.x += (pig.targetX - pig.x) * 0.05;
        pig.y += (pig.targetY - pig.y) * 0.05;
      });

      const newFrame = new Uint8Array(COLS * ROWS);
      let maxTemp = 36.0;
      let peakX = 8;
      let peakY = 16;

      // Populate thermal values with realistic pig body heat signatures
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          // Ambient background noise (cool concrete pen floor)
          let baseValue = 30 + Math.random() * 6; // ~15C to 18C on a blocky scale
          
          // Draw each pig signature
          pigs.current.forEach(pig => {
            const dist = Math.sqrt(Math.pow(x - pig.x, 2) + Math.pow(y - pig.y, 2));
            if (dist < pig.size) {
              // Body heat decay from center (hottest) to edges (cooler)
              const heatFactor = (1 - dist / pig.size);
              
              // Scale to match the actual temp value
              const pigVal = (pig.baseTemp - 30.0) / 11.0 * 255;
              const contribution = heatFactor * pigVal;

              baseValue = Math.max(baseValue, baseValue + contribution * 0.95);
            }
          });

          // Heat leakages / pen warm spots (heaters, feeders)
          const heatLampDist = Math.sqrt(Math.pow(x - 28, 2) + Math.pow(y - 3, 2));
          if (heatLampDist < 5) {
            baseValue = Math.max(baseValue, baseValue + (1 - heatLampDist / 5) * 110);
          }

          // Apply to array clamp 0-255
          const clampedVal = Math.min(255, Math.max(0, Math.floor(baseValue)));
          newFrame[y * COLS + x] = clampedVal;

          // Computer Vision: track the absolute peak temperature cell (fever detection)
          const calculatedTemp = 30.0 + (clampedVal / 255) * 11.0; 
          if (calculatedTemp > maxTemp) {
            maxTemp = calculatedTemp;
            peakX = x;
            peakY = y;
          }
        }
      }

      setSimulatedFrame(newFrame);
      setTrackerPos({ x: peakX, y: peakY, temp: parseFloat(maxTemp.toFixed(1)) });
    };

    // Run simulation loop 15 times a second (matches real MLX90640 frame rates perfectly!)
    const interval = setInterval(runSimulation, 66);
    return () => clearInterval(interval);
  }, [base64Frame]);

  // Decode live base64 frame if present, else use simulation
  const pixels = useMemo(() => {
    if (base64Frame) {
      try {
        const raw = atob(base64Frame);
        const uint8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          uint8[i] = raw.charCodeAt(i);
        }
        return uint8;
      } catch (e) {
        console.error('Failed to decode base64 thermal feed', e);
        return simulatedFrame;
      }
    }
    return simulatedFrame;
  }, [base64Frame, simulatedFrame]);

  // Raw Pixelated Canvas Rendering (Disable smoothing for realistic blocky MLX90640 look!)
  useEffect(() => {
    if (Platform.OS !== 'web' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create the 32x24 source canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = COLS;
    tempCanvas.height = ROWS;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const imgData = tempCtx.createImageData(COLS, ROWS);
    for (let i = 0; i < pixels.length; i++) {
      const val = pixels[i];
      const colorStr = getHeatmapColor(val);
      const rgb = colorStr.match(/\d+/g);
      if (rgb) {
        imgData.data[i * 4] = parseInt(rgb[0]);     // R
        imgData.data[i * 4 + 1] = parseInt(rgb[1]); // G
        imgData.data[i * 4 + 2] = parseInt(rgb[2]); // B
        imgData.data[i * 4 + 3] = 255;              // A
      }
    }
    tempCtx.putImageData(imgData, 0, 0);

    // Disable image smoothing for the RAW pixelated sensor matrix look
    ctx.imageSmoothingEnabled = false;
    
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  }, [pixels, width, height]);

  // Track coordinates scaling
  const pixelSize = width / COLS;

  // Find which simulated pig is closest to the peak tracker position for organic mock tracking
  const closestPig = useMemo(() => {
    let bestPig = pigs.current[2]; // Default to Pig C
    let minDist = 9999;
    pigs.current.forEach(pig => {
      const dist = Math.sqrt(Math.pow(trackerPos.x - pig.x, 2) + Math.pow(trackerPos.y - pig.y, 2));
      if (dist < minDist) {
        minDist = dist;
        bestPig = pig;
      }
    });
    return bestPig;
  }, [trackerPos.x, trackerPos.y]);

  // When a specific pig is selected from the roster, look up its coordinates directly
  const selectedPigData = useMemo(() => {
    if (!selectedPigToTrack) return null;
    return pigs.current.find(p => p.id === selectedPigToTrack) || null;
  }, [selectedPigToTrack]);

  // Dynamically resolve coordinates and names based on selection
  const activeX = targetX !== undefined ? targetX 
    : selectedPigData ? Math.round(selectedPigData.x) 
    : trackerPos.x;
  const activeY = targetY !== undefined ? targetY 
    : selectedPigData ? Math.round(selectedPigData.y) 
    : trackerPos.y;
  const activePig = identifiedPig !== undefined ? identifiedPig 
    : selectedPigData ? selectedPigData.id 
    : closestPig.id;
  const activeTemp = targetX !== undefined ? trackerPos.temp 
    : selectedPigData ? selectedPigData.baseTemp 
    : (closestPig.id === 'Pig C (Fever)' ? 39.9 : trackerPos.temp);

  // Evaluate tracker state — always true when a pig is selected or auto-detected
  const isTracking = activeX !== undefined && activeY !== undefined && !!activePig;

  return (
    <View style={[styles.container, { width, height }, isFullscreen && styles.fullscreenContainer]}>
      {Platform.OS === 'web' ? (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block', borderRadius: 8 }}
        />
      ) : (
        // Mobile fallback block grid
        <View style={styles.mobileGrid}>
          {Array.from({ length: ROWS }).map((_, y) => (
            <View key={y} style={styles.mobileRow}>
              {Array.from({ length: COLS }).map((_, x) => {
                const val = pixels[y * COLS + x];
                return (
                  <View
                    key={x}
                    style={{
                      flex: 1,
                      aspectRatio: 1,
                      backgroundColor: getHeatmapColor(val),
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/* Target Tracker Bounding Box */}
      {isTracking && activeX !== undefined && activeY !== undefined && (
        <View
          style={[
            styles.boundingBox,
            {
              left: Math.max(0, Math.min(width - 10 * pixelSize, (activeX - 5) * pixelSize)),
              top: Math.max(0, Math.min(height - 6 * pixelSize, (activeY - 3) * pixelSize)),
              width: 10 * pixelSize,
              height: 6 * pixelSize,
            }
          ]}
        >
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      )}

      {/* Tracker Label Overlay */}
      {isTracking && activeX !== undefined && activeY !== undefined && (
        <View
          style={[
            styles.trackerLabel,
            {
              left: Math.max(0, Math.min(width - 120, (activeX - 5) * pixelSize)),
              top: Math.max(0, Math.min(height - 85, (activeY - 3) * pixelSize - 42)),
            },
          ]}
        >
          <Image 
            source={{ uri: PEPPA_ICON }} 
            style={styles.peppaCursor} 
            resizeMode="contain"
          />
          <View style={[
            styles.bubble,
            activeTemp >= 39.5 ? styles.bubbleDanger : styles.bubbleNormal
          ]}>
            <Text style={styles.trackerLabelText}>
              🎯 {activePig} ({activeTemp}°C)
            </Text>
          </View>
        </View>
      )}
      
      {/* Dynamic Overlay HUD Info */}
      <View style={styles.hudOverlay}>
        <Text style={styles.hudText}>FPS: 15 (SENSOR RATE) | RES: 32x24 RAW MAT</Text>
        <Text style={styles.hudText}>MLX90640 PEN SENSOR (PIXELATED MODE)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Theme.colors.cardBorder,
    position: 'relative',
    overflow: 'visible', // Permitted to prevent tracker label clipping at top edges
  },
  fullscreenContainer: {
    borderRadius: 0,
    borderWidth: 0,
  },
  mobileGrid: {
    flex: 1,
    flexDirection: 'column',
  },
  mobileRow: {
    flex: 1,
    flexDirection: 'row',
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00D4AA', // Cyberpunk Cyan Bounding Box
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderColor: '#00D4AA',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  trackerLabel: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 1000,
  },
  peppaCursor: {
    width: 44,
    height: 44,
    marginBottom: -4,
  },
  bubble: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleNormal: {
    backgroundColor: '#00D4AA',
    borderColor: '#fff',
  },
  bubbleDanger: {
    backgroundColor: Theme.colors.danger,
    borderColor: '#fff',
  },
  trackerLabelText: {
    color: '#000', // High contrast black on cyan/red
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hudOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hudText: {
    color: Theme.colors.primary,
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
});
