import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Path,
  Line,
  Rect,
  Polygon,
} from 'react-native-svg';

interface Props {
  size?: number;       // icon height (px), default 52
  color?: string;      // fill/stroke colour, default '#1a1a1a'
  iconOnly?: boolean;  // render icon without text (text handled outside)
}

/**
 * FocusTimelapse logo mark:
 *   - Stopwatch (filled circle body + crown at top)
 *   - Camera-play triangle on the right side
 * Matches the top-left variant (dark on white, horizontal layout).
 */
export default function FocusTimelapseIcon({
  size = 52,
  color = '#1a1a1a',
}: Props) {
  // All coordinates are in a 56×52 local viewport so the icon keeps
  // proportions regardless of the `size` prop.
  const vw = 56;
  const vh = 52;

  return (
    <View style={{ width: size * (vw / vh), height: size }}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${vw} ${vh}`}
        fill="none"
      >
        {/* ── Stopwatch body ── */}
        {/* Crown / stem at top-center */}
        <Rect x="22" y="1" width="8" height="4" rx="2" fill={color} />
        {/* Side crown nub (left) */}
        <Rect x="16" y="3" width="6" height="3" rx="1.5" fill={color} />

        {/* Main circle body (filled) */}
        <Circle cx="26" cy="28" r="20" fill={color} />

        {/* Inner clock face (cut-out white) */}
        <Circle cx="26" cy="28" r="14" fill="white" />

        {/* Clock tick marks */}
        <Line x1="26" y1="15.5" x2="26" y2="18.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1="26" y1="37.5" x2="26" y2="40.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1="13.5" y1="28" x2="16.5" y2="28" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1="35.5" y1="28" x2="38.5" y2="28" stroke={color} strokeWidth="2" strokeLinecap="round" />

        {/* Hour hand  (pointing ~10 o'clock) */}
        <Line
          x1="26" y1="28"
          x2="19" y2="21"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* Minute hand (pointing ~2 o'clock, slightly longer) */}
        <Line
          x1="26" y1="28"
          x2="32" y2="20"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <Circle cx="26" cy="28" r="1.8" fill={color} />

        {/* ── Camera play-triangle (right side, partially overlapping circle) ── */}
        {/* Triangle pointing right — like a record/play button */}
        <Polygon
          points="40,20 40,36 52,28"
          fill={color}
        />
      </Svg>
    </View>
  );
}
