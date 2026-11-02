/**
 * LiveCamera — native renderer.
 *
 * The Tapo feed reaches the phone as multipart/x-mixed-replace MJPEG from
 * thermal-pi (`/cctv`). React Native's <Image> cannot decode that on
 * iOS/Android, so a WebView hosts a tiny HTML page with an <img>. Chromium and
 * WKWebView both render MJPEG inside <img>, unlike top-level navigation to the
 * raw stream.
 *
 * HONEST LIMIT — the Pi serves HTTPS with a SELF-SIGNED certificate, and
 * react-native-webview 13.16.1 exposes no `onSslError` hook. Nothing in JS can
 * make a stock WebView trust it.
 *
 * That is exactly why failure detection is explicit here: the hosted page
 * reports `load` / `error` from the <img> back over `postMessage`, and a
 * watchdog turns "no frame decoded within 12 s" into a failure. Without this,
 * a certificate rejection left a black stage under a green LIVE dot — the
 * screen claiming a working feed it had never seen.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { stage } from './tokens';
import type { LiveCameraProps } from './LiveCamera.types';

/** Give the Pi this long to deliver one decoded frame before calling it dead. */
const FIRST_FRAME_TIMEOUT_MS = 12_000;

export function LiveCamera({ uri, baseUrl, height, placeholder, onLive, onFailure }: LiveCameraProps) {
  const [failed, setFailed] = useState(false);
  const settled = useRef(false);

  const fail = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    setFailed(true);
    onFailure?.();
  }, [onFailure]);

  // Watchdog: MJPEG never "finishes loading", so silence is the failure signal.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!settled.current) fail();
    }, FIRST_FRAME_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fail]);

  const html = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>html,body{margin:0;height:100%;background:${stage.deep};overflow:hidden}` +
      `img{width:100%;height:100%;object-fit:contain;display:block}</style></head>` +
      `<body><img src="${uri}" alt="">` +
      `<script>(function(){var i=document.querySelector('img');` +
      `function send(m){try{window.ReactNativeWebView.postMessage(m)}catch(e){}}` +
      `i.addEventListener('load',function(){send('live')});` +
      `i.addEventListener('error',function(){send('error')});})();</script>` +
      `</body></html>`,
    [uri],
  );

  if (failed) return <>{placeholder}</>;

  return (
    <View style={[styles.frame, height ? { height } : styles.ratio]}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        mixedContentMode="never"
        allowsInlineMediaPlayback
        onMessage={(event) => {
          const data = event.nativeEvent.data;
          if (data === 'live' && !settled.current) {
            settled.current = true;
            onLive?.();
          } else if (data === 'error') {
            fail();
          }
        }}
        onError={fail}
        onHttpError={fail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: stage.deep, overflow: 'hidden' },
  ratio: { aspectRatio: 16 / 9 },
  webview: { flex: 1, backgroundColor: stage.deep },
});
