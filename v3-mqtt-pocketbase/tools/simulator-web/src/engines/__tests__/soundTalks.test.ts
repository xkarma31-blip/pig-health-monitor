import { describe, it, expect } from 'vitest';
import { SoundTalks, DEFAULT_CALIBRATION, SIM_DAY_SEC, ROLLING_BINS, BIN_SEC } from '../soundTalks';

describe('v3.1: SoundTalks-style respiratory index engine', () => {
  const cal = (extra: object) => ({ ...DEFAULT_CALIBRATION, ...extra });

  it('rolls a 24-bin hourly window across a 360 s accelerated day', () => {
    expect(SIM_DAY_SEC).toBe(360);
    expect(ROLLING_BINS).toBe(24);
    expect(BIN_SEC).toBe(15);
  });

  it('computes RDI = coughs per head per sim-day and stays GREEN at baseline', () => {
    const st = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12 }));
    // 12 coughs spread across a full sim day with 4 heads → RDI 3/head/day,
    // far below the 12/head/day baseline.
    st.record(6, 180);
    st.record(6, 180); // day boundary: 360 s elapsed, both bins still in window
    const s = st.state;
    expect(s.rdi).toBeCloseTo(3, 1);
    expect(s.rehs).toBe(100);
    expect(s.band).toBe('GREEN');
    expect(s.alarm).toBe(false);
  });

  it('pins ReHS at the real 60/40 band boundaries and goes RED past them', () => {
    const st = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12 }));
    // Doubling the baseline (rise = baseline) pins ReHS at 100 − 40 = 60 → still GREEN.
    st.record(96, 360);
    let s = st.state;
    expect(s.rehs).toBe(60);
    expect(s.band).toBe('GREEN');
    // 1.25× baseline rise → ReHS 40 → top of YELLOW (real SoundTalks: 40–59 is YELLOW).
    const stY = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12 }));
    stY.record(120, 360);
    s = stY.state;
    expect(s.rehs).toBe(40);
    expect(s.band).toBe('YELLOW');
    // 1.75× baseline rise → ReHS 30 → RED (hard alarm).
    const st2 = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12 }));
    st2.record(132, 360);
    s = st2.state;
    expect(s.rehs).toBe(30);
    expect(s.band).toBe('RED');
    expect(s.alarm).toBe(true);
  });

  it('falls into YELLOW between the floors', () => {
    const st = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12, greenFloor: 70, redCeiling: 30 }));
    st.record(96, 360); // rise = baseline → ReHS 60 → YELLOW (below 70, above 30)
    expect(st.state.band).toBe('YELLOW');
  });

  it('forgets coughs once they slide out of the 24-bin window', () => {
    const st = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12 }));
    st.record(96, 360); // spike the whole day
    expect(st.state.rehs).toBe(60);
    st.observe(360); // one full quiet sim day
    expect(st.state.rdi).toBe(0);
    expect(st.state.rehs).toBe(100);
  });

  it('is dt-robust: large jumps advance bins and drop stale data without crashing', () => {
    const st = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12 }));
    st.record(96, 360); // day 0 spike
    st.observe(3600); // +10 sim days in one call
    expect(st.state.rdi).toBe(0);
    st.record(5, 900); // single record spanning bins still lands somewhere
    expect(st.state.rdi).toBeGreaterThan(0);
  });

  it('trend trips when the last 3 bins exceed baseline + alarmDelta / sensitivity', () => {
    const st = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12, alarmDelta: 4, sensitivity: 2 }));
    // hourly baseline = 48/24 = 2; threshold = 2 + 4/2 = 4 → 3 bins of 5 each trip it.
    for (let i = 0; i < 21; i++) st.observe(BIN_SEC);
    st.record(5, BIN_SEC);
    st.record(5, BIN_SEC);
    st.record(5, BIN_SEC);
    expect(st.state.trend).toBe(true);
    expect(st.state.alarm).toBe(true);
    // …and a flat-low herd stays calm.
    const calm = new SoundTalks(cal({ headCount: 4, baselineCoughsPerHeadDay: 12, alarmDelta: 4, sensitivity: 2 }));
    for (let i = 0; i < 24; i++) calm.record(1, BIN_SEC);
    expect(calm.state.trend).toBe(false);
    expect(calm.state.alarm).toBe(false);
  });

  it('clamps sensitivity into the sane range and merges calibration live', () => {
    const st = new SoundTalks(cal({ headCount: 4 }));
    st.setCalibration({ sensitivity: 10, headCount: 0 });
    expect(st.state.calibration.sensitivity).toBe(4);
    expect(st.state.calibration.headCount).toBe(1);
    st.setCalibration({ sensitivity: 0.1 });
    expect(st.state.calibration.sensitivity).toBe(0.25);
  });

  it('calibrateNow learns the baseline from the observed day total', () => {
    const st = new SoundTalks(cal({ headCount: 4 }));
    for (let i = 0; i < 24; i++) st.record(1, BIN_SEC); // 24 coughs/day → 6/head/day
    expect(st.state.baselineLearned).toBe(false);
    st.calibrateNow();
    expect(st.state.baselineLearned).toBe(true);
    expect(st.state.calibration.baselineCoughsPerHeadDay).toBe(6);
    // A fresh clean day matching the learned baseline → back to a calm 100.
    for (let i = 0; i < 24; i++) st.record(1, BIN_SEC);
    expect(st.state.rehs).toBe(100);
  });

  it('resetBaseline restores the default and forgets the learner flag', () => {
    const st = new SoundTalks(cal({ headCount: 4 }));
    st.record(24, 360);
    st.calibrateNow();
    expect(st.state.calibration.baselineCoughsPerHeadDay).toBe(6);
    st.resetBaseline();
    expect(st.state.baselineLearned).toBe(false);
    expect(st.state.calibration.baselineCoughsPerHeadDay).toBe(12);
  });

  it('autoBaseline rebaselines from the recent median after two quiet days', () => {
    const st = new SoundTalks(cal({ headCount: 4, autoBaseline: true }));
    // Herd coughs 6/head/day (1/bin) for 3 sim days — the factory 12/head/day is stale.
    st.record(24, 360);
    st.record(24, 360);
    st.record(24, 360);
    expect(st.state.baselineLearned).toBe(true);
    expect(st.state.calibration.baselineCoughsPerHeadDay).toBe(6);
    expect(st.state.rehs).toBe(100);
  });
});