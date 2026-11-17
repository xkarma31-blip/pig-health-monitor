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

  /** Explicit camera-audio mode from the caller, for honest disabled copy. */
  audioMode?: boolean;
}

/** Short status line for the camera-sound control. */
export function audioHint(status: CctvStatus): string {
  if (status.audioAvailable) return 'Tap to listen';
  if (!status.poll) return 'Video is switched off';
  if (status.audioMode) return 'No recent camera frame — camera audio unavailable';
  return 'Video-only mode — switch to VIDEO + AUDIO to listen';
}

export function cctvStatus({ mode, live, base }: CctvStatusInput): CctvStatus {
  if (mode === 'off') {
    return {
      poll: false,
      showFrame: false,
      audioAvailable: false,
      audioMode: false,
      label: 'CCTV OFF',
      reason: 'Video is switched off. Turn it on to poll the camera.',
    };
  }
  if (!base) {
    return {
      poll: true,
      showFrame: false,
      audioAvailable: false,
      audioMode: mode === 'video_audio',
      label: 'CCTV UNAVAILABLE — no Pi connection',
      reason: 'No Pi connection. Join PigPulse or use remote access.',
    };
  }
  if (!live) {
    return {
      poll: true,
      showFrame: false,
      audioAvailable: false,
      audioMode: mode === 'video_audio',
      label: 'CCTV OFFLINE — no recent frame',
      reason: 'No recent camera frame. Check camera power, PigPulse Wi-Fi and RTSP.',
    };
  }
  const withAudio = mode === 'video_audio';
  return {
    poll: true,
    showFrame: true,
    audioAvailable: withAudio,
    audioMode: withAudio,
    label: withAudio ? 'CCTV LIVE · AUDIO READY' : 'CCTV LIVE',
    reason: withAudio
      ? 'Recent camera frame received. Camera audio is available from the Pi.'
      : 'Recent camera frame received.',
  };
}
