import { estimateOutputSec } from '../src/utils/captureSchedule';

describe('estimateOutputSec', () => {
  it('returns 0 when recordingSec is 0', () => {
    expect(estimateOutputSec(0, 3600, 60)).toBe(0);
  });

  it('clamps to minOutputSec (3) when result < 3', () => {
    // very short recording → estimated < 3 → clamp to 3
    expect(estimateOutputSec(1, 3600, 60)).toBe(3);
  });

  it('returns full outputSec when recordingSec === goalSec', () => {
    expect(estimateOutputSec(3600, 3600, 60)).toBe(60);
  });

  it('matches sqrt curve at midpoint (0.25 ratio → 0.5 of outputSec)', () => {
    // recordingSec = goalSec * 0.25 → ratio = 0.25 → sqrt(0.25) = 0.5 → outputSec * 0.5
    expect(estimateOutputSec(900, 3600, 60)).toBeCloseTo(30, 0);
  });

  it('clamps recordingSec > goalSec to goalSec', () => {
    // ratio clamped to 1 → sqrt(1) = 1 → full outputSec
    expect(estimateOutputSec(7200, 3600, 60)).toBe(60);
  });
});
