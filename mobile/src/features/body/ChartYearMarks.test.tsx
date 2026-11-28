import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ProgressChart, type ChartPoint } from '../training/ProgressChart';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));

const point = (date: string, value: number): ChartPoint => ({
  date,
  value,
  id: date,
  detail: `${value} kg × 5`,
});
// Oct 2024 to Jun 2025: a short slice of 2024, then most of the chart in 2025.
const points = [
  point('2024-10-01', 100),
  point('2024-12-01', 105),
  point('2025-02-01', 107.5),
  point('2025-06-01', 112.5),
];

async function renderChart(yearLines: boolean) {
  await render(
    <ProgressChart
      points={points}
      label="Bench Press Est. 1RM"
      unit="kg"
      height={300}
      markRecords
      formatValue={(value) => String(value)}
      yearLines={yearLines}
    />,
  );
  await fireEvent(screen.getByLabelText('Bench Press Est. 1RM'), 'layout', {
    nativeEvent: { layout: { width: 700, height: 300 } },
  });
}

test('the progress chart draws a pill per year only while year lines are on', async () => {
  await renderChart(false);
  expect(screen.queryByRole('button', { name: '2025' })).toBeNull();

  await renderChart(true);
  expect(screen.getByRole('button', { name: '2024' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '2025' })).toBeOnTheScreen();
});

test("a year pill shows that year's start, end and change, and clears on a second tap", async () => {
  await renderChart(true);
  const year = () => screen.getByRole('button', { name: '2025' });
  await act(async () => fireEvent.press(year()));
  expect(year()).toBeSelected();
  // Drawn for sight, and given to screen readers as the pill's value.
  const summary = '2025 · 107.5 → 112.5 kg · +5 kg';
  expect(screen.getByText(summary, { includeHiddenElements: true })).toBeOnTheScreen();
  expect(year()).toHaveAccessibilityValue({ text: summary });

  await act(async () => fireEvent.press(year()));
  expect(year()).not.toBeSelected();
  expect(screen.queryByText(summary, { includeHiddenElements: true })).toBeNull();
});
