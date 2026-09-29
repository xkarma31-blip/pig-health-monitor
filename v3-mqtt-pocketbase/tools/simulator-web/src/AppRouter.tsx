/**
 * AppRouter — Root routing shell (replaces monolithic App.tsx).
 *
 * Uses react-router-dom v7 BrowserRouter, wraps Layout (sidebar +
 * content), and maps routes to lazy-loaded pages.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';

import DashboardPage from './pages/DashboardPage';
import AudioLabPage from './pages/AudioLabPage';
import ThermalLabPage from './pages/ThermalLabPage';
import FusionLabPage from './pages/FusionLabPage';
import SettingsPage from './pages/SettingsPage';
import { useSimulationLoop } from './hooks/useSimulationLoop';

/** Top-level router — renders the Layout shell with nested routes. */
export default function AppRouter() {
  useSimulationLoop();
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="audio" element={<AudioLabPage />} />
          <Route path="thermal" element={<ThermalLabPage />} />
          <Route path="fusion" element={<FusionLabPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
