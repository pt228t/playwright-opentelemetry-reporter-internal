import test from 'ava';

import OpenTelemetryReporter, {
  annotationLabel,
  METRIC_TEST_COUNT,
  METRIC_TEST_DURATION,
  METRIC_TEST_STEP_DURATION,
  name,
  OpenTelemetryReporter as NamedOpenTelemetryReporter,
  OpenTelemetryMetricsExporter,
  PlaywrightMetricsListener,
  version,
} from './index';

test('public API exports reporter and metrics primitives', (t) => {
  t.is(OpenTelemetryReporter, NamedOpenTelemetryReporter);
  t.is(annotationLabel('owner'), 'pw_otel_reporter.owner');
  t.is(METRIC_TEST_COUNT, 'test.count');
  t.is(METRIC_TEST_DURATION, 'test.duration');
  t.is(METRIC_TEST_STEP_DURATION, 'test.step.duration');
  t.is(name, '@internal/playwright-opentelemetry-reporter');
  t.is(version, '0.2.0');
  t.truthy(OpenTelemetryMetricsExporter);
  t.truthy(PlaywrightMetricsListener);
});
