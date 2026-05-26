export type MetricAttributeValue = string | number | boolean;

export type MetricAttributes = Record<string, MetricAttributeValue>;

export type TraceAttributes = Record<string, MetricAttributeValue>;

export type MetricKind = 'counter' | 'duration' | 'gauge';

export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

export type StepStatus = 'passed' | 'failed' | 'skipped';

export interface Metric {
  name: string;
  kind: MetricKind;
  value: number;
  attributes: MetricAttributes;
  timestamp: number;
}

export interface MetricsExporter {
  send(metric: Metric): void | Promise<void>;
  shutdown?(): void | Promise<void>;
}

export interface MetricRecorder {
  recordDuration(
    name: string,
    duration: number,
    attributes?: MetricAttributes
  ): void;
  recordCounter(
    name: string,
    value?: number,
    attributes?: MetricAttributes
  ): void;
  recordGauge(name: string, value: number, attributes?: MetricAttributes): void;
}

export interface MetricsCollector {
  recordTestStart(test: TestCase): void;
  recordTestEnd(test: TestCase, result: TestResult): void;
  recordStepStart(test: TestCase, step: TestStep): void;
  recordStepEnd(test: TestCase, step: TestStep): void;
  getMetrics(): RunMetrics;
  getTestMetric(testId: string): TestMetrics | undefined;
  shutdown(): Promise<void>;
}

export interface MetricsConfig {
  attributes?: MetricAttributes;
  enabled?: boolean;
  exportOnTestEnd?: boolean;
  exporter?: MetricsExporter;
}

export interface TestCase {
  attributes?: MetricAttributes;
  id: string;
  title: string;
  projectName?: string;
  suiteName?: string;
}

export interface TestResult {
  status: TestStatus;
  duration: number;
  retry?: number;
}

export interface TestStep {
  id?: string;
  title: string;
  category?: string;
  duration?: number;
  parentId?: string;
  status?: StepStatus;
}

export interface StepMetrics {
  stepId: string;
  stepName: string;
  category?: string;
  duration: number;
  status: StepStatus;
}

export interface TestMetrics {
  testId: string;
  testName: string;
  projectName?: string;
  suiteName?: string;
  duration: number;
  status: TestStatus;
  retryCount: number;
  stepMetrics: StepMetrics[];
}

export interface DurationPercentiles {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  max: number;
}

export interface RunMetrics {
  startTime: number;
  endTime?: number;
  totalDuration: number;
  testCount: number;
  passedCount: number;
  failedCount: number;
  flakyCount: number;
  skippedCount: number;
  testDurationPercentiles: DurationPercentiles;
  testMetrics: TestMetrics[];
}
