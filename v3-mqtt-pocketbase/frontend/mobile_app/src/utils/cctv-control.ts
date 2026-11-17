/**
 * CCTV mode/state contract for the app.
 *
 * Safe defaults: a missing or unknown mode is video-only. The Pi already
 * serves `/camera-audio` from the camera's own RTSP track, so `video_audio`
 * is a supported mode whenever a recent camera frame proves the camera is
 * reachable. OFF stops polling so a stale frame can never be presented live.
 */

export type CctvMode = 'off' | 'video' | 'video_audio';

/** Normalize a stored/raw mode. Unknown values fall back to video-only. */
export function resolveCctvMode(raw: string | null | undefined): CctvMode {
  if (raw === 'off') return 'off';
  if (raw === 'video_audio') return 'video_audio';
  return 'video';
}

export interface CctvStatusInput {
  mode: CctvMode;
  live: boolean;
  base?: string | null;
}

export interface CctvStatus {
  poll: boolean;
  showFrame: boolean;
  audioAvailable: boolean;
  label: string;
  reason: string;
}

export function cctvStatus({ mode, live, base }: CctvStatusInput): CctvStatus {
  if (mode === 'off') {
    return {
      poll: false,
      showFrame: false,
      audioAvailable: false,
      label: 'CCTV OFF',
      reason: 'Video is switched off. Turn it on to poll the camera.',
    };
  }
  if (!base) {
    return {
      poll: true,
      showFrame: false,
      audioAvailable: false,
      label: 'CCTV UNAVAILABLE — no Pi connection',
      reason: 'No Pi connection. Join PigPulse or use remote access.',
    };
  }
  if (!live) {
    return {
      poll: true,
      showFrame: false,
      audioAvailable: false,
      label: 'CCTV OFFLINE — no recent frame',
      reason: 'No recent camera frame. Check camera power, PigPulse Wi-Fi and RTSP.',
    };
  }
  const withAudio = mode === 'video_audio';
  return {
    poll: true,
    showFrame: true,
    audioAvailable: withAudio,
    label: withAudio ? 'CCTV LIVE · AUDIO READY' : 'CCTV LIVE',
    reason: withAudio
      ? 'Recent camera frame received. Camera audio is available from the Pi.'
      : 'Recent camera frame received.',
  };
}
