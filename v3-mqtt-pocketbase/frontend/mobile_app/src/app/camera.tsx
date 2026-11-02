import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveCamera, stage, monitorText } from '../components/monitor';
import { ChevronLeftIcon } from '../components/primitives';
import { piBaseFromPbUrl, piEndpoints } from '../utils/live-source';
import { loadFarmerSetup } from '../utils/setupStore';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';

/**
 * Full-screen barn camera.
 *
 * The stream is the Pi's MJPEG proxy (`web_server.py` `/cctv`), not a cloud
 * service: it only resolves over the Pi's own network. When the surface cannot
 * render it (self-signed certificate on a stock native build — see
 * docs/track-t5-apps.md), the browser fallback is offered instead of a spinner
 * that never finishes.
 */
export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [piBase, setPiBase] = useState<string | null>(null);
  const [state, setState] = useState<'connecting' | 'live' | 'failed'>('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadFarmerSetup()
      .then((setup) => {
        if (alive) setPiBase(piBaseFromPbUrl(setup.pbUrl));
      })
      .catch(() => {
        if (alive) setPiBase(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const endpoints = useMemo(() => (piBase ? piEndpoints(piBase) : null), [piBase]);

  const openInBrowser = () => {
    playSound('tap');
    haptic('light');
    if (!endpoints) return;
    Linking.openURL(endpoints.cctv).catch(() => {
      /* no browser handler — the on-screen address is still readable */
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={() => {
            playSound('tap');
            haptic('light');
            router.back();
          }}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back to the live monitor"
        >
          <ChevronLeftIcon size={20} color={stage.ink} />
          <Text style={[monitorText.label, { color: stage.ink, marginLeft: 2 }]}>Monitor</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor:
                  state === 'live' ? stage.live : state === 'failed' ? stage.offline : stage.idle,
              },
            ]}
          />
          <Text style={[monitorText.label, { color: stage.ink }]} numberOfLines={1}>
            {state === 'live' ? 'Barn camera — live' : state === 'failed' ? 'Barn camera — offline' : 'Barn camera — connecting'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={openInBrowser}
          disabled={!endpoints}
          style={[styles.action, { opacity: endpoints ? 1 : 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Open the camera stream in the phone browser"
        >
          <Text style={[monitorText.label, { color: stage.live }]}>Browser</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stage}>
        {endpoints && state !== 'failed' ? (
          <LiveCamera
            key={attempt}
            uri={endpoints.cctv}
            baseUrl={endpoints.base}
            height={undefined}
            onLive={() => setState('live')}
            onFailure={() => setState('failed')}
          />
        ) : (
          <View style={styles.fallback}>
            <Text style={[monitorText.h2, styles.center, { color: stage.ink }]}>
              {endpoints ? 'Stream not rendering here' : 'No Pi address yet'}
            </Text>
            <Text style={[monitorText.body, styles.center, { color: stage.inkDim, marginTop: 8 }]}>
              {endpoints
                ? 'The Pi serves HTTPS with a self-signed certificate. Native WebView does not inherit a browser exception — open the stream in the browser once, accept the certificate, and the app build can trust it.'
                : 'Finish the setup wizard so the app can derive the Pi host from the PocketBase address.'}
            </Text>
            {endpoints ? (
              <>
                <Text style={[monitorText.body, styles.mono, { color: stage.ink, marginTop: 12 }]} selectable>
                  {endpoints.cctv}
                </Text>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    onPress={openInBrowser}
                    style={[styles.btn, { borderColor: stage.live }]}
                    accessibilityRole="button"
                    accessibilityLabel="Open the stream in the browser"
                  >
                    <Text style={[monitorText.label, { color: stage.live }]}>Open in browser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      playSound('tap');
                      haptic('light');
                      setState('connecting');
                      setAttempt((a) => a + 1);
                    }}
                    style={[styles.btn, { borderColor: stage.edge }]}
                    accessibilityRole="button"
                    accessibilityLabel="Retry the embedded stream"
                  >
                    <Text style={[monitorText.label, { color: stage.ink }]}>Retry</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        )}
      </View>

      <Text style={[monitorText.body, { color: stage.inkDim, paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }]}>
        {endpoints
          ? `MJPEG · ${endpoints.cctv} · Pi network only`
          : 'The camera is served by the Pi on its own network (thermal-pi :8080).'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: stage.deep },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: stage.edge,
    minHeight: 56,
  },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 44, paddingRight: 6 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  stage: { flex: 1, justifyContent: 'center', backgroundColor: stage.deep },
  fallback: { paddingHorizontal: 20, paddingVertical: 24 },
  center: { textAlign: 'center' },
  mono: { textAlign: 'center', fontFamily: 'monospace', fontSize: 16 },
  btnRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  btn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
});
