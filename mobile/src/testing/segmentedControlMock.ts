// A stand-in for @react-native-segmented-control/segmented-control in Jest. Each segment is a tab
// that reports whether it's selected and whether the control is disabled, like the native one.
// Use: jest.mock('@react-native-segmented-control/segmented-control', () =>
//   jest.requireActual('../testing/segmentedControlMock'));
import { createElement } from 'react';
import { Pressable, Text, View } from 'react-native';

export default function SegmentedControl(props: {
  values: string[];
  selectedIndex?: number;
  enabled?: boolean;
  accessibilityLabel?: string;
  onChange?: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
}) {
  const disabled = props.enabled === false;
  return createElement(
    View,
    { accessibilityLabel: props.accessibilityLabel },
    props.values.map((value, index) =>
      createElement(
        Pressable,
        {
          key: value,
          accessibilityRole: 'tab',
          accessibilityState: { selected: index === props.selectedIndex, disabled },
          disabled,
          onPress: () => props.onChange?.({ nativeEvent: { selectedSegmentIndex: index } }),
        },
        createElement(Text, null, value),
      ),
    ),
  );
}
