import { useState, useEffect } from 'react';
import * as Network from 'expo-network';
import { mockSensors, SensorReading } from '../data/mockSensors';
import { mockAlerts, AlertEntry } from '../data/mockAlerts';
import { useAuth } from '../utils/auth';
import { subscribeSensors, subscribeAlerts } from '../utils/firebase';

export interface TelemetryData {
  sensors: SensorReading[];
  alerts: AlertEntry[];
  isOfflineMode: boolean;
  isConnecting: boolean;
  error: string | null;
}

const ESP32_LOCAL_IP = 'http://192.168.4.1';

export function useOfflineTelemetry(): TelemetryData {
  const user = useAuth();
  const [data, setData] = useState<TelemetryData>({
    sensors: [],
    alerts: [],
    isOfflineMode: false,
    isConnecting: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    let unsubSensors: (() => void) | undefined;
    let unsubAlerts: (() => void) | undefined;

    const clearFirebaseListeners = () => {
      unsubSensors?.();
      unsubAlerts?.();
      unsubSensors = undefined;
      unsubAlerts = undefined;
    };

    const startFirebaseListeners = () => {
      clearFirebaseListeners();
      unsubSensors = subscribeSensors((sensors) => {
        if (!isMounted) return;
        setData((prev) => ({
          ...prev,
          sensors,
          isOfflineMode: false,
          isConnecting: false,
          error: null,
        }));
      });
      unsubAlerts = subscribeAlerts((alerts) => {
        if (!isMounted) return;
        setData((prev) => ({
          ...prev,
          alerts: alerts as AlertEntry[],
          isOfflineMode: false,
          isConnecting: false,
          error: null,
        }));
      });
    };

    const checkNetworkAndFetch = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();

        if (networkState.isConnected && networkState.isInternetReachable) {
          if (!user) {
            clearFirebaseListeners();
            if (isMounted) {
              setData({
                sensors: [],
                alerts: [],
                isOfflineMode: false,
                isConnecting: false,
                error: 'Farmer/Vet login required to synchronize Cloud databases.',
              });
            }
            return;
          }

          if (isMounted) {
            setData((prev) => ({
              ...prev,
              isOfflineMode: false,
              isConnecting: true,
              error: null,
            }));
          }
          startFirebaseListeners();
          return;
        }

        clearFirebaseListeners();

        if (isMounted) {
          setData((prev) => ({ ...prev, isOfflineMode: true, isConnecting: true }));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
          const res = await fetch(`${ESP32_LOCAL_IP}/data`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!res.ok) throw new Error('ESP32 Local Fetch failed');

          const espData = await res.json();

          if (isMounted) {
            setData({
              sensors: [
                ...mockSensors.filter((s) => s.id !== 'temp-01' && s.id !== 'acoustic-01'),
                {
                  id: 'temp-01',
                  type: 'thermal',
                  label: 'Live Local Temperature',
                  icon: '🌡️',
                  value: espData.bodyTemp || 0,
                  unit: '°C',
                  status: espData.bodyTemp > 39 ? 'danger' : 'normal',
                  lastUpdated: new Date().toLocaleTimeString(),
                  minRange: 37.5,
                  maxRange: 40.0,
                },
                {
                  id: 'acoustic-01',
                  type: 'acoustic',
                  label: 'Live Local Cough Count',
                  icon: '🩺',
                  value: espData.coughCount || 0,
                  unit: 'coughs/hr',
                  status: espData.coughCount > 10 ? 'warning' : 'normal',
                  lastUpdated: new Date().toLocaleTimeString(),
                  minRange: 0,
                  maxRange: 100,
                },
              ],
              alerts: [],
              isOfflineMode: true,
              isConnecting: false,
              error: null,
            });
          }
        } catch {
          if (isMounted) {
            if (user) {
              setData({
                sensors: mockSensors,
                alerts: mockAlerts,
                isOfflineMode: true,
                isConnecting: false,
                error: 'Cannot reach Cloud OR Local ESP32 AP. Displaying cached data.',
              });
            } else {
              setData({
                sensors: [],
                alerts: [],
                isOfflineMode: true,
                isConnecting: false,
                error: 'Farmer/Vet login required to synchronize Cloud databases.',
              });
            }
          }
        }
      } catch (err) {
        console.error('Network check error', err);
      }
    };

    checkNetworkAndFetch();
    const pollInterval = setInterval(checkNetworkAndFetch, 5000);

    return () => {
      isMounted = false;
      clearFirebaseListeners();
      clearInterval(pollInterval);
    };
  }, [user]);

  return data;
}
