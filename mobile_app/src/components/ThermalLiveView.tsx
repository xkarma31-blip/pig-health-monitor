import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import Svg, { Rect, G, Path } from 'react-native-svg';
import { Buffer } from 'buffer';
import { Theme } from '../constants/Theme';

const PEPPA_ICON = 'https://upload.wikimedia.org/wikipedia/en/3/3b/Peppa_Pig_character.png';

interface ThermalLiveViewProps {
  base64Frame: string; // 768 bytes encoded (32x24)
  targetX?: number; // 0 to 31
  targetY?: number; // 0 to 23
  identifiedPig?: string;
  selectedPigToTrack?: string;
  width?: number;
}

const ROWS = 24;
const COLS = 32;

// Heatmap color scale (Ironbow/Inferno style)
function getHeatmapColor(value: number): string {
  // value is 0-255
  if (value < 64) {
    // Deep blue to Purple
    const b = 255;
    const r = Math.floor((value / 64) * 128);
    return `rgb(${r}, 0, ${b})`;
  } else if (value < 128) {
    // Purple to Red
    const b = Math.floor(255 - ((value - 64) / 64) * 255);
    const r = Math.floor(128 + ((value - 64) / 64) * 127);
    return `rgb(${r}, 0, ${b})`;
  } else if (value < 192) {
    // Red to Yellow
    const r = 255;
    const g = Math.floor(((value - 128) / 64) * 255);
    return `rgb(${r}, ${g}, 0)`;
  } else {
    // Yellow to White
    const r = 255;
    const g = 255;
    const b = Math.floor(((value - 192) / 63) * 255);
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
}: ThermalLiveViewProps) {
  const pixelSize = width / COLS;
  const height = pixelSize * ROWS;

  // Decode the base64 payload into an array of 0-255 values
  const pixels = useMemo(() => {
    if (!base64Frame) return new Uint8Array(768);
    try {
      return new Uint8Array(Buffer.from(base64Frame, 'base64'));
    } catch (e) {
      console.error('Base64 Decode Error', e);
      return new Uint8Array(768);
    }
  }, [base64Frame]);

  // Bilinear interpolation for super-resolution (upscaling)
  const getInterpolatedPixels = (src: Uint8Array, srcW: number, srcH: number, scale: number) => {
    const dstW = srcW * scale;
    const dstH = srcH * scale;
    const dst = new Uint8Array(dstW * dstH);

    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const gx = (x / dstW) * (srcW - 1);
        const gy = (y / dstH) * (srcH - 1);
        
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = Math.min(srcW - 1, x0 + 1);
        const y1 = Math.min(srcH - 1, y0 + 1);
        
        const dx = gx - x0;
        const dy = gy - y0;
        
        const v00 = src[y0 * srcW + x0];
        const v10 = src[y0 * srcW + x1];
        const v01 = src[y1 * srcW + x0];
        const v11 = src[y1 * srcW + x1];
        
        const val = 
          v00 * (1 - dx) * (1 - dy) +
          v10 * dx * (1 - dy) +
          v01 * (1 - dx) * dy +
          v11 * dx * dy;
          
        dst[y * dstW + x] = Math.round(val);
      }
    }
    return { pixels: dst, cols: dstW, rows: dstH };
  };

  // Optimize Rendering: Instead of 768 Rects, we could construct a massive Path 
  // but for 768 elements SVG Rects usually perform adequately if memoized.
  const renderPixels = useMemo(() => {
    if (pixels.length < 768) return null;
    
    const rects = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const val = pixels[y * COLS + x];
        rects.push(
          <Rect
            key={`${x}-${y}`}
            x={x * pixelSize}
            y={y * pixelSize}
            width={pixelSize + 0.1} // Minimal overlap for performance
            height={pixelSize + 0.1}
            fill={getHeatmapColor(val)}
          />
        );
      }
    }
    return rects;
  }, [pixels, pixelSize]);

  // Is this the pig we are actively tracking?
  const isTracking =
    selectedPigToTrack &&
    identifiedPig === selectedPigToTrack &&
    targetX !== undefined &&
    targetY !== undefined;

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Thermal Grid */}
        <G>{renderPixels}</G>

        {/* Bounding Box / Tracker */}
        {isTracking && targetX !== undefined && targetY !== undefined && (
          <Rect
            x={(targetX - 2) * pixelSize}
            y={(targetY - 2) * pixelSize}
            width={4 * pixelSize}
            height={4 * pixelSize}
            stroke="#00D4AA" // Cyan highlight
            strokeWidth={3}
            fill="none"
            rx={4}
          />
        )}
      </Svg>

      {/* Tracker Label Overlay */}
      {isTracking && targetX !== undefined && targetY !== undefined && (
        <View
          style={[
            styles.trackerLabel,
            {
              left: Math.max(0, Math.min(width - 100, (targetX - 2) * pixelSize - 10)),
              top: Math.max(0, Math.min(height - 80, (targetY - 4) * pixelSize - 20)),
            },
          ]}
        >
          <Image 
            source={{ uri: PEPPA_ICON }} 
            style={styles.peppaCursor} 
            resizeMode="contain"
          />
          <View style={styles.bubble}>
            <Text style={styles.trackerLabelText}>🎯 {identifiedPig}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: Theme.borderRadius.sm,
    // overflow: 'hidden', // Disabled to prevent label clipping
    borderWidth: 2,
    borderColor: Theme.colors.cardBorder,
  },
  trackerLabel: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 1000,
  },
  peppaCursor: {
    width: 50,
    height: 50,
    marginBottom: -5,
  },
  bubble: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  trackerLabelText: {
    color: '#000', // High contrast black on cyan
    fontSize: 12,
    fontWeight: '900',
  },
});
