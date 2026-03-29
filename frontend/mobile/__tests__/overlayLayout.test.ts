import { OVERLAY_LAYOUT, buildScaledLayout, getOverlayScale, ptToPx } from '../src/constants/overlayLayout';

describe('OVERLAY_LAYOUT constants', () => {
  test('all values are positive numbers', () => {
    expect(OVERLAY_LAYOUT.watermark.paddingLeft).toBeGreaterThan(0);
    expect(OVERLAY_LAYOUT.watermark.logoSize).toBeGreaterThan(0);
    expect(OVERLAY_LAYOUT.watermark.fontSize).toBeGreaterThan(0);
    expect(OVERLAY_LAYOUT.progress.barWidth).toBeGreaterThan(0);
    expect(OVERLAY_LAYOUT.progress.barHeight).toBeGreaterThan(0);
    expect(OVERLAY_LAYOUT.progress.fontSize).toBeGreaterThan(0);
  });
});

describe('getOverlayScale', () => {
  test('scale for 390px video = 1.0', () => {
    expect(getOverlayScale(390)).toBeCloseTo(1.0);
  });

  test('scale for 720px video ≈ 1.846', () => {
    expect(getOverlayScale(720)).toBeCloseTo(720 / 390, 5);
  });

  test('scale for 810px video ≈ 2.077', () => {
    expect(getOverlayScale(810)).toBeCloseTo(810 / 390, 5);
  });
});

describe('ptToPx', () => {
  test('16pt at 390px video = 16px', () => {
    expect(ptToPx(16, 390)).toBeCloseTo(16.0);
  });

  test('16pt at 720px video ≈ 29.5px', () => {
    expect(ptToPx(16, 720)).toBeCloseTo(16 * (720 / 390), 3);
  });
});

describe('buildScaledLayout', () => {
  test('for 390px video: all px values equal pt values', () => {
    const scaled = buildScaledLayout(390);
    expect(scaled.watermark.paddingLeft).toBeCloseTo(OVERLAY_LAYOUT.watermark.paddingLeft);
    expect(scaled.watermark.logoSize).toBeCloseTo(OVERLAY_LAYOUT.watermark.logoSize);
    expect(scaled.watermark.fontSize).toBeCloseTo(OVERLAY_LAYOUT.watermark.fontSize);
    expect(scaled.progress.barWidth).toBeCloseTo(OVERLAY_LAYOUT.progress.barWidth);
    expect(scaled.progress.barHeight).toBeCloseTo(OVERLAY_LAYOUT.progress.barHeight);
    expect(scaled.progress.fontSize).toBeCloseTo(OVERLAY_LAYOUT.progress.fontSize);
  });

  test('for 810px video (3:4 resolution): scale ≈ 2.077', () => {
    const scaled = buildScaledLayout(810);
    const scale = 810 / 390;
    expect(scaled.watermark.paddingLeft).toBeCloseTo(OVERLAY_LAYOUT.watermark.paddingLeft * scale, 2);
    expect(scaled.progress.barWidth).toBeCloseTo(OVERLAY_LAYOUT.progress.barWidth * scale, 2);
    expect(scaled.progress.fontSize).toBeCloseTo(OVERLAY_LAYOUT.progress.fontSize * scale, 2);
  });

  test('for 720px video (9:16 resolution): all values scaled correctly', () => {
    const scaled = buildScaledLayout(720);
    const scale = 720 / 390;
    expect(scaled.watermark.logoSize).toBeCloseTo(OVERLAY_LAYOUT.watermark.logoSize * scale, 2);
    expect(scaled.timer.fontSize).toBeCloseTo(OVERLAY_LAYOUT.timer.fontSize * scale, 2);
    expect(scaled.streak.paddingRight).toBeCloseTo(OVERLAY_LAYOUT.streak.paddingRight * scale, 2);
  });

  test('no overflow for 810x1080 video (3:4)', () => {
    const videoWidth = 810;
    const scaled = buildScaledLayout(videoWidth);

    // Watermark text X must not overflow
    const wmTextX = scaled.watermark.paddingLeft + scaled.watermark.logoSize + scaled.watermark.gap;
    expect(wmTextX).toBeLessThan(videoWidth * 0.8);

    // Progress bar must not overflow
    const barX = videoWidth - scaled.progress.paddingRight - scaled.progress.barWidth;
    expect(barX).toBeGreaterThan(0);

    // Label X: estimate label width as fontSize * 5 (5 chars '5 min')
    const estimatedLabelWidth = scaled.progress.fontSize * 5;
    const labelX = barX - scaled.progress.labelGap - estimatedLabelWidth;
    expect(labelX).toBeGreaterThan(0);
  });

  test('no overflow for 720x1280 video (9:16)', () => {
    const videoWidth = 720;
    const scaled = buildScaledLayout(videoWidth);

    const barX = videoWidth - scaled.progress.paddingRight - scaled.progress.barWidth;
    expect(barX).toBeGreaterThan(0);

    const estimatedLabelWidth = scaled.progress.fontSize * 5;
    const labelX = barX - scaled.progress.labelGap - estimatedLabelWidth;
    expect(labelX).toBeGreaterThan(0);
  });

  test('JSON serializable (can be passed as string to Swift)', () => {
    const scaled = buildScaledLayout(810);
    const json = JSON.stringify(scaled);
    const parsed = JSON.parse(json);
    expect(parsed.watermark.paddingLeft).toBeCloseTo(scaled.watermark.paddingLeft);
    expect(parsed.progress.barWidth).toBeCloseTo(scaled.progress.barWidth);
  });
});
