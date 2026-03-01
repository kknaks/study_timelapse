import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg';

interface Props {
  size?: number;   // icon height in px, default 52
  color?: string;  // fill colour, default '#1a1a1a'
}

/**
 * FocusTimelapse logo mark
 *
 * Layout (viewBox 64 × 60):
 *   - Thick-ring stopwatch centred at (28, 32), outer r=26, inner r=17
 *   - Small crown nub at top-centre
 *   - Hour hand ~10 o'clock, minute hand ~12-1 o'clock
 *   - Play/camera triangle on right, tip at x=62, base from (42,20)→(42,44)
 *     overlapping the ring so it looks "attached"
 */
export default function FocusTimelapseIcon({
  size = 52,
  color = '#1a1a1a',
}: Props) {
  const vw = 64;
  const vh = 60;
  const cx = 28;  // stopwatch centre x
  const cy = 32;  // stopwatch centre y
  const ro = 26;  // outer radius
  const ri = 17;  // inner (clock-face) radius

  return (
    <View style={{ width: size * (vw / vh), height: size }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`} fill="none">

        {/* ── Crown nub at top-centre ── */}
        <Rect x={cx - 4} y={2} width={8} height={5} rx={2.5} fill={color} />

        {/* ── Stopwatch outer filled circle ── */}
        <Circle cx={cx} cy={cy} r={ro} fill={color} />

        {/* ── Inner clock-face (white cutout) ── */}
        <Circle cx={cx} cy={cy} r={ri} fill="white" />

        {/* ── Tick marks at 12 / 3 / 6 / 9 ── */}
        <Line x1={cx}      y1={cy - ri + 0.5} x2={cx}      y2={cy - ri + 4} stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1={cx}      y1={cy + ri - 0.5} x2={cx}      y2={cy + ri - 4} stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1={cx - ri + 0.5} y1={cy} x2={cx - ri + 4} y2={cy}           stroke={color} strokeWidth="2" strokeLinecap="round" />
        {/* right tick deliberately omitted — covered by triangle */}

        {/* ── Hour hand: ~10 o'clock (210° from top = pointing upper-left) ── */}
        <Line
          x1={cx} y1={cy}
          x2={cx - 8} y2={cy - 9}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
        />

        {/* ── Minute hand: ~1 o'clock (pointing upper-right, longer) ── */}
        <Line
          x1={cx} y1={cy}
          x2={cx + 6} y2={cy - 13}
          stroke={color} strokeWidth="2" strokeLinecap="round"
        />

        {/* ── Centre dot ── */}
        <Circle cx={cx} cy={cy} r={2} fill={color} />

        {/* ── Camera / play triangle (right side, overlaps ring) ── */}
        {/* Base of triangle sits at x=42 (inside ring edge), tip at x=62 */}
        <Polygon
          points={`42,${cy - 12} 42,${cy + 12} 62,${cy}`}
          fill={color}
        />

        {/* White "bite" to cleanly separate triangle from clock face */}
        <Circle cx={cx} cy={cy} r={ri} fill="white" />

        {/* Re-draw hands & dot on top of the white circle */}
        <Line
          x1={cx} y1={cy}
          x2={cx - 8} y2={cy - 9}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
        />
        <Line
          x1={cx} y1={cy}
          x2={cx + 6} y2={cy - 13}
          stroke={color} strokeWidth="2" strokeLinecap="round"
        />
        <Circle cx={cx} cy={cy} r={2} fill={color} />
        {/* Re-draw tick marks */}
        <Line x1={cx}      y1={cy - ri + 0.5} x2={cx}      y2={cy - ri + 4} stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1={cx}      y1={cy + ri - 0.5} x2={cx}      y2={cy + ri - 4} stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1={cx - ri + 0.5} y1={cy} x2={cx - ri + 4} y2={cy}           stroke={color} strokeWidth="2" strokeLinecap="round" />

      </Svg>
    </View>
  );
}
