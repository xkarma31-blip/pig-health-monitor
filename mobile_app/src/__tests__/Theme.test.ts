import { Theme, getStatusColor } from '../constants/Theme';

describe('Theme', () => {
  it('has all required color tokens', () => {
    expect(Theme.colors.background).toBe('#0D0D1A');
    expect(Theme.colors.text).toBe('#FFFFFF');
    expect(Theme.colors.primary).toBe('#00D4AA');
    expect(Theme.colors.success).toBe('#00D4AA');
    expect(Theme.colors.warning).toBe('#FFD700');
    expect(Theme.colors.danger).toBe('#FF3366');
  });

  it('has minimum 16px body typography for accessibility', () => {
    expect(Theme.typography.body).toBeGreaterThanOrEqual(16);
  });

  it('returns correct status colors', () => {
    expect(getStatusColor('normal')).toBe(Theme.colors.success);
    expect(getStatusColor('warning')).toBe(Theme.colors.warning);
    expect(getStatusColor('danger')).toBe(Theme.colors.danger);
  });

  it('returns default text color for unknown status', () => {
    expect(getStatusColor('unknown')).toBe(Theme.colors.text);
  });
});
