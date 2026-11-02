import type { ReactNode } from 'react';

export interface LiveCameraProps {
  /** Absolute MJPEG URL, e.g. https://192.168.69.1:8080/cctv */
  uri: string;
  /** Origin used as the WebView base, e.g. https://192.168.69.1:8080 */
  baseUrl: string;
  /** 16:9 by default; pass a pixel height to pin it. */
  height?: number;
  /** Rendered when there is no Pi address at all. */
  placeholder?: ReactNode;
  /**
   * Called the first time a frame actually decodes. Until this fires, the
   * stream state is unknown — callers must not paint it green.
   */
  onLive?: () => void;
  /** Called when the frame surface reports a load failure, or never loads. */
  onFailure?: () => void;
}
