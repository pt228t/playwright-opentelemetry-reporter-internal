import test from 'ava';

import {
  calculateDurationPercentiles,
  calculatePercentile,
} from './percentile';

test('calculatePercentile returns nearest-rank percentile', (t) => {
  t.is(calculatePercentile([30, 10, 20, 40], 50), 20);
  t.is(calculatePercentile([10, 20, 30, 40], 95), 40);
});

test('calculateDurationPercentiles returns zeros for empty values', (t) => {
  t.deepEqual(calculateDurationPercentiles([]), {
    min: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    p95: 0,
    p99: 0,
    max: 0,
  });
});
