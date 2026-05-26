import { DurationPercentiles } from '../types';

const EMPTY_PERCENTILES: DurationPercentiles = {
  min: 0,
  p25: 0,
  p50: 0,
  p75: 0,
  p95: 0,
  p99: 0,
  max: 0,
};

export function calculatePercentile(
  values: number[],
  percentile: number
): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const boundedIndex = Math.min(Math.max(index, 0), sortedValues.length - 1);

  return sortedValues[boundedIndex];
}

export function calculateDurationPercentiles(
  values: number[]
): DurationPercentiles {
  if (values.length === 0) {
    return EMPTY_PERCENTILES;
  }

  const sortedValues = [...values].sort((left, right) => left - right);

  return {
    min: sortedValues[0],
    p25: calculatePercentile(sortedValues, 25),
    p50: calculatePercentile(sortedValues, 50),
    p75: calculatePercentile(sortedValues, 75),
    p95: calculatePercentile(sortedValues, 95),
    p99: calculatePercentile(sortedValues, 99),
    max: sortedValues[sortedValues.length - 1],
  };
}
