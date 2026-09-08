import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HardwareMonitor } from '../HardwareMonitor';
import { ChaosPanel } from '../ChaosPanel';
import { OtaDialog } from '../OtaDialog';
import { TopNav } from '../TopNav';

describe('HardwareMonitor (SSR smoke)', () => {
  it('renders battery, heap, and WiFi status', () => {
    const html = renderToStaticMarkup(
      createElement(HardwareMonitor, {})
    );
    expect(html).toContain('data-testid="battery-level"');
    expect(html).toContain('data-testid="free-heap"');
    expect(html).toContain('data-testid="wifi-rssi"');
  });

  it('flags the accessible class when enabled', () => {
    const html = renderToStaticMarkup(
      createElement(HardwareMonitor, { accessible: true })
    );
    expect(html).toContain('class="hardware-monitor accessible');
  });
});

describe('ChaosPanel (SSR smoke)', () => {
  it('renders sliders for packet loss, I2C lockup, battery sag, brownout', () => {
    const html = renderToStaticMarkup(
      createElement(ChaosPanel, {})
    );
    expect(html).toContain('data-testid="packet-loss"');
    expect(html).toContain('data-testid="i2c-lockup"');
    expect(html).toContain('data-testid="battery-sag"');
    expect(html).toContain('data-testid="brownout"');
  });

  it('flags the accessible class when enabled', () => {
    const html = renderToStaticMarkup(
      createElement(ChaosPanel, { accessible: true })
    );
    expect(html).toContain('class="chaos-panel accessible');
  });
});

describe('OtaDialog (SSR smoke)', () => {
  it('renders an OTA update dialog with cancel and confirm actions', () => {
    const html = renderToStaticMarkup(
      createElement(OtaDialog, {})
    );
    expect(html).toContain('data-testid="ota-dialog"');
    expect(html).toContain('data-testid="ota-cancel"');
    expect(html).toContain('data-testid="ota-confirm"');
  });

  it('flags the accessible class when enabled', () => {
    const html = renderToStaticMarkup(
      createElement(OtaDialog, { accessible: true })
    );
    expect(html).toContain('class="ota-dialog accessible');
  });
});

describe('TopNav (SSR smoke)', () => {
  it('always renders the accessibility toggle (so the user can turn it ON)', () => {
    const html = renderToStaticMarkup(
      createElement(TopNav, { accessible: false })
    );
    expect(html).toContain('data-testid="top-nav"');
    expect(html).toContain('data-testid="accessible-toggle"');
    expect(html).toMatch(/aria-pressed="false"/);
    expect(html).toContain('Accessible mode: off');
    expect(html).toContain('role="navigation"');
  });

  it('reflects the enabled state in aria-pressed and label', () => {
    const html = renderToStaticMarkup(
      createElement(TopNav, { accessible: true })
    );
    expect(html).toContain('data-testid="accessible-toggle"');
    expect(html).toMatch(/aria-pressed="true"/);
    expect(html).toContain('Accessible mode: on');
    expect(html).toContain('class="top-nav accessible');
  });
});