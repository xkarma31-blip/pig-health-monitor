/**
 * LiveCamera — web renderer.
 *
 * Browsers decode multipart/x-mixed-replace natively inside <img>, so the web
 * build streams the Pi's MJPEG proxy directly. A raw DOM <img> is used because
 * react-native-web's Image maps to a background-image element, which does not
 * stream MJPEG reliably.
 *
 * Mixed content is not an issue: the deployed app is HTTPS and the Pi serves
 * HTTPS. The self-signed certificate still has to be accepted once for that
 * origin — and until a frame actually decodes, `onLive` stays unfired so the
 * screen does not claim a live feed.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { stage } from './tokens';
import type { LiveCameraProps } from './LiveCamera.types';

const Img = 'img' as unknown as React.ElementType;

export function LiveCamera({ uri, height, placeholder, onLive, onFailure }: LiveCameraProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <>{placeholder}</>;

  return (
    <View style={[styles.frame, height ? { height } : styles.ratio]}>
      <Img
        src={uri}
        alt="Live barn camera"
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        onLoad={() => onLive?.()}
        onError={() => {
          setFailed(true);
          onFailure?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: stage.deep, overflow: 'hidden' },
  ratio: { aspectRatio: 16 / 9 },
});
