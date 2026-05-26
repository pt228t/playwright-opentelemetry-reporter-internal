import { MetricRecorder } from './recorder';
import {
  ATTR_TEST_CASE_NAME,
  ATTR_TEST_RESULT_STATUS,
  ATTR_TEST_RETRY_COUNT,
  ATTR_TEST_STEP_CATEGORY,
  ATTR_TEST_STEP_NAME,
  ATTR_TEST_SUITE_NAME,
  METRIC_TEST_COUNT,
  METRIC_TEST_DURATION,
  METRIC_TEST_STEP_DURATION,
} from './semantic-conventions';
import {
  MetricRecorder as IMetricRecorder,
  MetricsCollector as IMetricsCollector,
  MetricsExporter,
  RunMetrics,
  StepMetrics,
  TestCase,
  TestMetrics,
  TestResult,
  TestStep,
} from './types';
import { calculateDurationPercentiles } from './utils/percentile';

interface ActiveStep {
  startedAt: number;
}

const emptyRunMetrics = (startTime: number): RunMetrics => ({
  startTime,
  totalDuration: 0,
  testCount: 0,
  passedCount: 0,
  failedCount: 0,
  flakyCount: 0,
  skippedCount: 0,
  testDurationPercentiles: calculateDurationPercentiles([]),
  testMetrics: [],
});

export class MetricsCollector implements IMetricsCollector {
  private runMetrics: RunMetrics;
  private startedTests = new Map<string, number>();
  private activeSteps = new Map<string, ActiveStep>();
  private stepMetrics = new Map<string, StepMetrics[]>();

  constructor(
    private exporter: MetricsExporter,
    private recorder: IMetricRecorder = new MetricRecorder(exporter),
    private clock: () => number = Date.now,
    private attributes: TestCase['attributes'] = {}
  ) {
    this.runMetrics = emptyRunMetrics(this.clock());
  }

  recordTestStart(test: TestCase): void {
    this.startedTests.set(test.id, this.clock());
  }

  recordTestEnd(test: TestCase, result: TestResult): void {
    const duration = this.getDuration(test.id, result.duration);
    const testMetrics: TestMetrics = {
      testId: test.id,
      testName: test.title,
      projectName: test.projectName,
      suiteName: test.suiteName,
      duration,
      status: result.status,
      retryCount: result.retry || 0,
      stepMetrics: this.stepMetrics.get(test.id) || [],
    };

    this.runMetrics.testMetrics.push(testMetrics);
    this.runMetrics.testCount += 1;
    this.runMetrics.endTime = this.clock();
    this.runMetrics.totalDuration =
      this.runMetrics.endTime - this.runMetrics.startTime;
    this.incrementStatusCount(result.status);
    this.runMetrics.testDurationPercentiles = calculateDurationPercentiles(
      this.runMetrics.testMetrics.map((metrics) => metrics.duration)
    );

    const testAttributes = this.withTestAttributes(test, {
      [ATTR_TEST_CASE_NAME]: test.title,
      [ATTR_TEST_RESULT_STATUS]: result.status,
      [ATTR_TEST_RETRY_COUNT]: result.retry || 0,
    });

    this.recorder.recordDuration(
      METRIC_TEST_DURATION,
      duration,
      testAttributes
    );
    this.recorder.recordCounter(METRIC_TEST_COUNT, 1, testAttributes);

    this.startedTests.delete(test.id);
    this.stepMetrics.delete(test.id);
  }

  recordStepStart(test: TestCase, step: TestStep): void {
    this.activeSteps.set(this.getStepKey(test.id, step), {
      startedAt: this.clock(),
    });
  }

  recordStepEnd(test: TestCase, step: TestStep): void {
    const stepKey = this.getStepKey(test.id, step);
    const activeStep = this.activeSteps.get(stepKey);
    const duration =
      step.duration === undefined
        ? this.clock() - (activeStep?.startedAt || this.clock())
        : step.duration;
    const metrics: StepMetrics = {
      stepId: step.id || step.title,
      stepName: step.title,
      category: step.category,
      duration,
      status: step.status || 'passed',
    };
    const testSteps = this.stepMetrics.get(test.id) || [];

    testSteps.push(metrics);
    this.stepMetrics.set(test.id, testSteps);
    this.activeSteps.delete(stepKey);

    this.recorder.recordDuration(
      METRIC_TEST_STEP_DURATION,
      duration,
      this.withTestAttributes(test, {
        [ATTR_TEST_CASE_NAME]: test.title,
        [ATTR_TEST_STEP_NAME]: step.title,
        [ATTR_TEST_STEP_CATEGORY]: step.category || 'unknown',
      })
    );
  }

  getMetrics(): RunMetrics {
    return {
      ...this.runMetrics,
      testDurationPercentiles: { ...this.runMetrics.testDurationPercentiles },
      testMetrics: this.runMetrics.testMetrics.map((metrics) => ({
        ...metrics,
        stepMetrics: [...metrics.stepMetrics],
      })),
    };
  }

  getTestMetric(testId: string): TestMetrics | undefined {
    return this.getMetrics().testMetrics.find(
      (metrics) => metrics.testId === testId
    );
  }

  async shutdown(): Promise<void> {
    await this.exporter.shutdown?.();
  }

  private getDuration(testId: string, resultDuration: number): number {
    if (resultDuration > 0) {
      return resultDuration;
    }

    const startedAt = this.startedTests.get(testId);

    return startedAt === undefined ? 0 : this.clock() - startedAt;
  }

  private getStepKey(testId: string, step: TestStep): string {
    return `${testId}:${step.id || step.title}`;
  }

  private withAttributes(
    test: TestCase,
    attributes: TestCase['attributes']
  ): TestCase['attributes'] {
    return {
      ...this.attributes,
      ...test.attributes,
      ...attributes,
    };
  }

  private withTestAttributes(
    test: TestCase,
    attributes: TestCase['attributes']
  ): TestCase['attributes'] {
    return this.withAttributes(test, {
      ...attributes,
      ...(test.suiteName ? { [ATTR_TEST_SUITE_NAME]: test.suiteName } : {}),
    });
  }

  private incrementStatusCount(status: TestResult['status']): void {
    if (status === 'passed') {
      this.runMetrics.passedCount += 1;
    } else if (status === 'failed') {
      this.runMetrics.failedCount += 1;
    } else if (status === 'flaky') {
      this.runMetrics.flakyCount += 1;
    } else {
      this.runMetrics.skippedCount += 1;
    }
  }
}
