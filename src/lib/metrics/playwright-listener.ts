import {
  FullConfig,
  TestCase as PlaywrightTestCase,
  TestResult as PlaywrightTestResult,
  TestStep as PlaywrightTestStep,
} from '@playwright/test/reporter';

import { TestEventListener } from '../event-listener';
import { formatTestTitle } from '../format-test-title';
import { getHashFromStepTitle } from '../get-hash-from-step-title';
import { TEST_ANNOTATION_SCOPE } from '../reporter';

import {
  MetricsCollector,
  StepStatus,
  TestCase,
  TestStatus,
  TestStep,
} from './types';

export class PlaywrightMetricsListener implements TestEventListener {
  private config: FullConfig;

  constructor(private collector: MetricsCollector) {}

  onBegin(config: FullConfig): void {
    this.config = config;
  }

  onTestBegin(test: PlaywrightTestCase): void {
    this.collector.recordTestStart(this.toMetricTestCase(test));
  }

  onTestEnd(test: PlaywrightTestCase, result: PlaywrightTestResult): void {
    this.collector.recordTestEnd(this.toMetricTestCase(test), {
      duration: result.duration,
      retry: result.retry,
      status: this.toMetricTestStatus(test, result),
    });
  }

  onStepBegin(
    test: PlaywrightTestCase,
    _result: PlaywrightTestResult,
    step: PlaywrightTestStep
  ): void {
    this.collector.recordStepStart(
      this.toMetricTestCase(test),
      this.toMetricStep(test, step)
    );
  }

  onStepEnd(
    test: PlaywrightTestCase,
    _result: PlaywrightTestResult,
    step: PlaywrightTestStep
  ): void {
    this.collector.recordStepEnd(
      this.toMetricTestCase(test),
      this.toMetricStep(test, step)
    );
  }

  async onEnd(): Promise<void> {
    await this.collector.shutdown();
  }

  private toMetricTestCase(test: PlaywrightTestCase): TestCase {
    const titlePath = test.titlePath();

    return {
      attributes: this.getAnnotationAttributes(test),
      id: test.id,
      title: this.config ? formatTestTitle(this.config, test) : test.title,
      projectName: titlePath[1],
      suiteName: test.parent.title,
    };
  }

  private toMetricTestStatus(
    test: PlaywrightTestCase,
    result: PlaywrightTestResult
  ): TestStatus {
    if (test.outcome() === 'flaky') {
      return 'flaky';
    }

    if (result.status === 'passed') {
      return 'passed';
    }

    if (result.status === 'skipped') {
      return 'skipped';
    }

    return 'failed';
  }

  private toMetricStep(
    test: PlaywrightTestCase,
    step: PlaywrightTestStep
  ): TestStep {
    return {
      id: getHashFromStepTitle(test, step, this.config),
      title: step.title,
      category: step.category,
      duration: step.duration,
      status: this.toMetricStepStatus(step),
    };
  }

  private toMetricStepStatus(step: PlaywrightTestStep): StepStatus {
    return step.error ? 'failed' : 'passed';
  }

  private getAnnotationAttributes(
    test: PlaywrightTestCase
  ): TestCase['attributes'] {
    return test.annotations.reduce<TestCase['attributes']>(
      (attributes, annotation) => {
        if (annotation.type.startsWith(TEST_ANNOTATION_SCOPE)) {
          return {
            ...attributes,
            [annotation.type.replace(TEST_ANNOTATION_SCOPE, '')]:
              annotation.description || '',
          };
        }

        return attributes;
      },
      {}
    );
  }
}
