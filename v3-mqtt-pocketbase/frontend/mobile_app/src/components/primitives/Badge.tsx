import React, { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme, statusColor, type Status } from '../../theme';

type BadgeProps = {
  label: string;
  status?: Status;
  icon?: ReactNode;
};

export function Badge({ label, status = 'neutral', icon }: BadgeProps) {
  const { colors, radius, typography } = useTheme();
  const { fg, bg } = statusColor(colors, status);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingHorizontal: 11,
        alignSelf: 'flex-start',
        backgroundColor: bg,
        borderRadius: radius.pill,
      }}
    >
      {icon}
      <Text
        style={[
          typography.label,
          { color: fg, marginLeft: icon ? 5 : 0 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}