import React, { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Image } from 'react-native';
import { useTheme } from '../theme';
import Svg, { Rect } from 'react-native-svg';

function decodeBase64(b64: string): Uint8Array {
  const sanitized = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  const len = sanitized.length;
  let bufferLength = Math.floor(len * 0.75);
  if (sanitized[len - 1] === '=') {
    bufferLength--;
    if (sanitized[len - 2] === '=') {
      bufferLength--;
    }
  }
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const base641 = lookup[sanitized.charCodeAt(i)];
    const base642 = lookup[sanitized.charCodeAt(i + 1)];
    const base643 = lookup[sanitized.charCodeAt(i + 2)];
    const base644 = lookup[sanitized.charCodeAt(i + 3)];
    bytes[p++] = (base641 << 2) | (base642 >> 4);
    if (p < bufferLength) {
      bytes[p++] = ((base642 & 15) << 4) | (base643 >> 2);
    }
    if (p < bufferLength) {
      bytes[p++] = ((base643 & 3) << 6) | base644;
    }
  }
  return bytes;
}

const PEPPA_ICON = 'https://upload.wikimedia.org/wikipedia/en/3/3b/Peppa_Pig_character.png';

interface ThermalLiveViewProps {
  base64Frame?: string;
  targetX?: number;
  targetY?: number;
  identifiedPig?: string;
  liveTemp?: number;
  selectedPigToTrack?: string;
  width?: number;
  height?: number;
  isFullscreen?: boolean;
}

const ROWS = 24;
const COLS = 32;

const PIGS = [
  { id: 'Pig A (Peppa)', x: 12, y: 8, targetX: 12, targetY: 8, size: 4.8, baseTemp: 38.4, stepTimer: 0 },
  { id: 'Pig B (Boss Hog)', x: 20, y: 14, targetX: 20, targetY: 14, size: 5.2, baseTemp: 38.1, stepTimer: 0 },
  { id: 'Pig C (Fever)', x: 8, y: 16, targetX: 8, targetY: 16, size: 4.5, baseTemp: 39.9, stepTimer: 0 },
];

function getHeatmapColor(value: number): string {
  if (value < 32) {
    return `rgb(0, 0, ${Math.floor((value / 32) * 128)})`;
  } else if (value < 96) {
    const r = Math.floor(((value - 32) / 64) * 128);
    const b = 128 + Math.floor(((value - 32) / 64) * 127);
    return `rgb(${r}, 0, ${b})`;
  } else if (value < 160) {
    const r = 128 + Math.floor(((value - 96) / 64) * 127);
    const g = Math.floor(((value - 96) / 64) * 128);
    const b = 255 - Math.floor(((value - 96) / 64) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (value < 224) {
    const r = 255;
    const g = 128 + Math.floor(((value - 160) / 64) * 127);
    return `rgb(${r}, ${g}, 0)`;
  } else {
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
  liveTemp,
  selectedPigToTrack,
  width = Dimensions.get('window').width - 32,
  height = (width / COLS) * ROWS,
  isFullscreen = false,
}: ThermalLiveViewProps) {
  const canvasRef = useRef<any>(null); // Web-only canvas ref; guarded by Platform.OS === 'web'
  const { colors } = useTheme();

  const [simulatedFrame, setSimulatedFrame] = useState<Uint8Array>(() => new Uint8Array(COLS * ROWS));
  const [trackerPos, setTrackerPos] = useState({ x: 8, y: 16, temp: 39.9 });
  const frameCounter = useRef(0);

  useEffect(() => {
    if (base64Frame) return;

    const runSimulation = () => {
      frameCounter.current += 1;
      PIGS.forEach((pig) => {
        pig.stepTimer += 1;
        if (pig.stepTimer > 120 + Math.random() * 60) {
          pig.stepTimer = 0;
          if (Math.random() > 0.4) {
            const shiftX = Math.floor(Math.random() * 3) - 1;
            const shiftY = Math.floor(Math.random() * 3) - 1;
            pig.targetX = Math.max(4, Math.min(COLS - 5, pig.targetX + shiftX));
            pig.targetY = Math.max(4, Math.min(ROWS - 5, pig.targetY + shiftY));
          }
        }
        pig.x += (pig.targetX - pig.x) * 0.05;
        pig.y += (pig.targetY - pig.y) * 0.05;
      });

      const newFrame = new Uint8Array(COLS * ROWS);
      let maxTemp = 36.0;
      let peakX = 8;
      let peakY = 16;

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          let baseValue = 30 + Math.random() * 6;
          PIGS.forEach((pig) => {
            const dist = Math.sqrt(Math.pow(x - pig.x, 2) + Math.pow(y - pig.y, 2));
            if (dist < pig.size) {
              const heatFactor = 1 - dist / pig.size;
              const pigVal = (pig.baseTemp - 30.0) / 11.0 * 255;
              const contribution = heatFactor * pigVal;
              baseValue = Math.max(baseValue, baseValue + contribution * 0.95);
            }
          });

          const heatLampDist = Math.sqrt(Math.pow(x - 28, 2) + Math.pow(y - 3, 2));
          if (heatLampDist < 5) {
            baseValue = Math.max(baseValue, baseValue + (1 - heatLampDist / 5) * 110);
          }

          const clampedVal = Math.min(255, Math.max(0, Math.floor(baseValue)));
          newFrame[y * COLS + x] = clampedVal;
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

    const interval = setInterval(runSimulation, Platform.OS === 'web' ? 66 : 250);
    return () => clearInterval(interval);
  }, [base64Frame]);

  const pixels = useMemo(() => {
    if (base64Frame) {
      try {
        return decodeBase64(base64Frame);
      } catch (e) {
        console.error('Failed to decode base64 thermal feed', e);
        return simulatedFrame;
      }
    }
    return simulatedFrame;
  }, [base64Frame, simulatedFrame]);

  useEffect(() => {
    // Canvas rendering is web-only — guard ensures this block never executes on native
    if (Platform.OS !== 'web' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Runtime type guard: verify the ref has canvas-like web APIs before using it
    if (typeof (canvas as any).getContext !== 'function') return;
    const ctx = (canvas as any).getContext('2d');
    if (!ctx) return;

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
        imgData.data[i * 4] = parseInt(rgb[0]);
        imgData.data[i * 4 + 1] = parseInt(rgb[1]);
        imgData.data[i * 4 + 2] = parseInt(rgb[2]);
        imgData.data[i * 4 + 3] = 255;
      }
    }
    tempCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  }, [pixels, width, height]);

  const pixelSize = width / COLS;

  const closestPig = useMemo(() => {
    let bestPig = PIGS[2];
    let minDist = 9999;
    PIGS.forEach((pig) => {
      const dist = Math.sqrt(Math.pow(trackerPos.x - pig.x, 2) + Math.pow(trackerPos.y - pig.y, 2));
      if (dist < minDist) {
        minDist = dist;
        bestPig = pig;
      }
    });
    return bestPig;
  }, [trackerPos.x, trackerPos.y]);

  const selectedPigData = useMemo(() => {
    if (!selectedPigToTrack) return null;
    return PIGS.find((p) => p.id === selectedPigToTrack) || null;
  }, [selectedPigToTrack]);

  const activeX = targetX !== undefined ? targetX : selectedPigData ? Math.round(selectedPigData.x) : trackerPos.x;
  const activeY = targetY !== undefined ? targetY : selectedPigData ? Math.round(selectedPigData.y) : trackerPos.y;
  const activePig = identifiedPig !== undefined ? identifiedPig : selectedPigData ? selectedPigData.id : closestPig.id;
  const activeTemp = liveTemp !== undefined ? liveTemp
    : targetX !== undefined ? trackerPos.temp
    : selectedPigData ? selectedPigData.baseTemp
    : closestPig.id === 'Pig C (Fever)' ? 39.9 : trackerPos.temp;

  const isTracking = activeX !== undefined && activeY !== undefined && !!activePig;

  return (
    <View style={[styles.container, { width, height, backgroundColor: colors.bg, borderRadius: 8 }, isFullscreen && styles.fullscreenContainer]}>
      {Platform.OS === 'web' ? (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block', borderRadius: 8 }}
        />
      ) : (
        <View style={styles.mobileGrid} accessibilityLabel="Thermal grid fallback">
          <Svg width={width} height={height} viewBox="0 0 32 24">
            {Array.from({ length: ROWS }).map((_, y) =>
              Array.from({ length: COLS }).map((_, x) => {
                const val = pixels[y * COLS + x];
                return <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={getHeatmapColor(val)} />;
              }),
            )}
          </Svg>
        </View>
      )}

      {isTracking && activeX !== undefined && activeY !== undefined && (
        <View
          style={[
            styles.boundingBox,
            {
              left: Math.max(0, Math.min(width - 10 * pixelSize, (activeX - 5) * pixelSize)),
              top: Math.max(0, Math.min(height - 6 * pixelSize, (activeY - 3) * pixelSize)),
              width: 10 * pixelSize,
              height: 6 * pixelSize,
              borderColor: colors.info,
            },
          ]}
        >
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      )}

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
          <Image source={{ uri: PEPPA_ICON }} style={styles.peppaCursor} resizeMode="contain" />
          <View style={[
            styles.bubble,
            { backgroundColor: activeTemp >= 39.5 ? colors.alert : colors.accent, borderColor: colors.white, shadowColor: colors.shadow },
          ]}>
            <Text style={[styles.trackerLabelText, { color: colors.onAccent }]}>
              🎯 {activePig} ({activeTemp}°C)
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.hudOverlay, { backgroundColor: colors.overlay }]}>
        <Text style={[styles.hudText, { color: colors.accent }]}>FPS: 15 (SENSOR RATE) | RES: 32x24 RAW MAT</Text>
        <Text style={[styles.hudText, { color: colors.accent }]}>MLX90640 PEN SENSOR (PIXELATED MODE)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
  fullscreenContainer: {
    borderRadius: 0,
    borderWidth: 0,
  },
  mobileGrid: {
    flex: 1,
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 8,
    height: 8,
  },
  topLeft: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  trackerLabelText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hudOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hudText: {
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
});
