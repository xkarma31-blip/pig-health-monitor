import { describe, it, expect } from 'vitest';
import { 
  generateThermalFrame, 
  extractFirmwareHotspot, 
  extractEarRoiHotspot, 
  encodeBase64Frame, 
  decodeBase64Frame,
  SimulatedPig 
} from '../thermalEngine';

describe('Thermal Engine & MLX90640 Math', () => {
  const mockPigs: SimulatedPig[] = [
    {
      id: 'pig-001',
      name: 'Porkchop',
      x: 16,
      y: 12,
      baseTemp: 39.8, // Feverish
      angleRad: 0,
      inFov: true
    },
    {
      id: 'pig-002',
      name: 'Peppa',
      x: 5,
      y: 5,
      baseTemp: 38.6, // Normal
      angleRad: Math.PI / 2,
      inFov: true
    }
  ];

  it('generates a 768-element Float32Array bounded to realistic ambient and fever temperatures', () => {
    const ambient = 28.5; // Cebu warm ambient
    const frame = generateThermalFrame(mockPigs, ambient, { noiseSigma: 0.15, mudBlotches: false });
    
    expect(frame.length).toBe(768); // 32 * 24
    let maxT = -Infinity;
    let minT = Infinity;
    for (let i = 0; i < frame.length; i++) {
      if (frame[i] > maxT) maxT = frame[i];
      if (frame[i] < minT) minT = frame[i];
    }
    expect(maxT).toBeGreaterThan(39.0);
    expect(minT).toBeGreaterThan(20.0);
  });

  it('correctly quantizes to (t - 20.0) * 12.75 byte format and base64 encodes/decodes with <0.08°C precision', () => {
    const originalTemp = 39.5;
    const testFrame = new Float32Array(768).fill(originalTemp);
    const b64 = encodeBase64Frame(testFrame);
    
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(500);

    const decoded = decodeBase64Frame(b64);
    expect(decoded.length).toBe(768);
    // uint8 quantization step = 20.0 / 255 = 0.0784 C
    expect(Math.abs(decoded[0] - originalTemp)).toBeLessThan(0.08);
  });

  it('extracts firmware global maxT hotspot identical to main.cpp:278-286', () => {
    const frame = new Float32Array(768).fill(25.0);
    // Put highest hotspot at (x=10, y=15)
    frame[15 * 32 + 10] = 40.5;

    const hotspot = extractFirmwareHotspot(frame);
    expect(hotspot.targetX).toBe(10);
    expect(hotspot.targetY).toBe(15);
    expect(hotspot.maxTemp).toBeCloseTo(40.5, 2);
  });

  it('extracts anatomical ear-ROI tracking separate from snout artifacts', () => {
    const pig: SimulatedPig = {
      id: 'pig-001',
      name: 'Porkchop',
      x: 16,
      y: 12,
      baseTemp: 39.8,
      angleRad: 0,
      inFov: true
    };
    const frame = generateThermalFrame([pig], 28.0, { noiseSigma: 0.1, mudBlotches: true });
    const earRoi = extractEarRoiHotspot(frame, pig);

    expect(earRoi.confidence).toBeGreaterThan(0.5);
    expect(earRoi.roiTemp).toBeGreaterThan(38.0);
  });
});
