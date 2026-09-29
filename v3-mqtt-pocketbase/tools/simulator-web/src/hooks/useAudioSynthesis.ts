/**
 * Audio ring buffer hook for the simulation tick loop.
 *
 * Maintains a 4096-sample Float32Array ring buffer. Cough bursts are
 * appended via addCoughAudio(); getAudioBuffer() returns the current
 * contents (oldest → newest) for the inference chain.
 */
import { useRef } from 'react';

const BUFFER_SIZE = 4096;

export function useAudioSynthesis() {
  const bufRef = useRef<Float32Array>(new Float32Array(BUFFER_SIZE));

  const addCoughAudio = (coughBurst: Float32Array) => {
    const buf = bufRef.current;
    const burstLen = Math.min(coughBurst.length, BUFFER_SIZE);
    const shift = Math.min(burstLen, BUFFER_SIZE);
    buf.copyWithin(0, shift);
    const writeStart = BUFFER_SIZE - burstLen;
    buf.set(coughBurst.subarray(0, burstLen), writeStart);
  };

  const getAudioBuffer = (): Float32Array => bufRef.current;

  return { addCoughAudio, getAudioBuffer };
}
