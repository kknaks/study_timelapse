/**
 * FocusTimelapse logo icon — pure React Native (no SVG dependency).
 *
 * Renders a rounded-square black box containing a stopwatch+camera
 * symbol built entirely from View/Text primitives so it works on
 * both native and web without any native module.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  /** Height of the icon box in px (default 72) */
  size?: number;
  /** Box background colour (default '#1a1a1a') */
  bgColor?: string;
  /** Icon / text colour (default '#FFFFFF') */
  color?: string;
}

export default function FocusTimelapseIcon({
  size = 72,
  bgColor = '#1a1a1a',
  color = '#FFFFFF',
}: Props) {
  const radius = size * 0.26;          // corner radius
  const iconSize = size * 0.52;        // stopwatch emoji area

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bgColor,
        },
      ]}
    >
      {/* Stopwatch emoji — universal, no native module needed */}
      <Text style={{ fontSize: iconSize, lineHeight: iconSize * 1.15, color }}>
        ⏱
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
