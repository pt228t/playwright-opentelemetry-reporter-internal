import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import { Span, Tracer } from '@opentelemetry/api';
import {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

import { TestEventListener } from './event-listener';
import { formatTestTitle } from './format-test-title';
import { getHashFromStepTitle } from './get-hash-from-step-title';
import { MetricsCollector } from './metrics/collector';
import { OpenTelemetryMetricsExporter } from './metrics/exporters/opentelemetry';
import { PlaywrightMetricsListener } from './metrics/playwright-listener';
import { MetricsConfig, TraceAttributes } from './metrics/types';
import { name as PKG_NAME, version as PKG_VERSION } from './version';

const ATTR_CODE_COLUMN = 'code.column';
const ATTR_CODE_FILEPATH = 'code.filepath';
const ATTR_CODE_LINENO = 'code.lineno';
const ATTR_TEST_CASE_NAME = 'test.case.name';
const ATTR_TEST_CASE_RESULT_STATUS = 'test.case.result.status';
const ATTR_TEST_SUITE_NAME = 'test.suite.name';

export interface OpenTelemetryReporterOptions {
  listeners?: TestEventListener[];
  traces?: false | TracesConfig;
  metrics?: false | MetricsConfig;
}

export interface TracesConfig {
  attributes?: TraceAttributes;
  enabled?: boolean;
}

export class OpenTelemetryReporter implements Reporter {
  private config: FullConfig;
  private listeners: TestEventListener[];

  private testSpans: { [key in string]: Span } = {};
  private stepSapns: { [key in string]: Span } = {};
  private tracer: Tracer;
  private traceAttributes: TraceAttributes = {};
  private tracesEnabled = true;

  constructor(options: OpenTelemetryReporterOptions = {}) {
    this.listeners = options.listeners || [];
    this.configureTraces(options.traces);
    this.configureMetrics(options.metrics);
    this.tracer = opentelemetry.trace.getTracer(PKG_NAME, PKG_VERSION);
  }

  private configureTraces(tracesConfig: false | TracesConfig = {}): void {
    if (tracesConfig === false || tracesConfig.enabled === false) {
      this.tracesEnabled = false;
      return;
    }

    this.traceAttributes = tracesConfig.attributes || {};
  }

  private configureMetrics(metricsConfig: false | MetricsConfig = {}): void {
    if (metricsConfig === false || metricsConfig.enabled === false) {
      return;
    }

    const exporter =
      metricsConfig.exporter || new OpenTelemetryMetricsExporter();
    const collector = new MetricsCollector(
      exporter,
      undefined,
      undefined,
      metricsConfig.attributes
    );

    this.subscribe(new PlaywrightMetricsListener(collector));
  }

  subscribe(listener: TestEventListener): void {
    this.listeners.push(listener);
  }

  unsubscribe(listener: TestEventListener): void {
    this.listeners = this.listeners.filter(
      (currentListener) => currentListener !== listener
    );
  }

  onBegin(config: FullConfig, suite?: Suite): void {
    this.config = config;
    this.listeners.forEach((listener) => listener.onBegin?.(config, suite));
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.listeners.forEach((listener) => listener.onTestBegin?.(test, result));

    if (!this.tracesEnabled) {
      return;
    }

    const testSpan = this.tracer.startSpan(formatTestTitle(this.config, test), {
      startTime: result.startTime,
    });
    this.testSpans[test.id] = testSpan;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.listeners.forEach((listener) => listener.onTestEnd?.(test, result));

    if (!this.tracesEnabled) {
      return;
    }

    const testSpan = this.testSpans[test.id];
    if (testSpan) {
      // Tests which are skipped or whose result status matches the expected
      // status are considered passing.
      const isPassing =
        result.status === 'skipped' || result.status === test.expectedStatus;

      testSpan.setAttributes({
        ...this.traceAttributes,
        [ATTR_TEST_CASE_NAME]: formatTestTitle(this.config, test),
        [ATTR_TEST_CASE_RESULT_STATUS]: isPassing ? 'pass' : 'fail',
        [ATTR_TEST_SUITE_NAME]: test.parent.title,
        [ATTR_CODE_FILEPATH]: test.location.file,
        [ATTR_CODE_LINENO]: test.location.line,
        [ATTR_CODE_COLUMN]: test.location.column,
      });

      test.annotations.forEach((annotation) => {
        if (annotation.type.startsWith(TEST_ANNOTATION_SCOPE)) {
          const attrLabel = annotation.type.replace(TEST_ANNOTATION_SCOPE, '');
          testSpan.setAttribute(attrLabel, annotation.description);
        }
      });

      if (!isPassing) {
        testSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error?.message || '',
        });
      }
      testSpan.end(result.startTime.getTime() + result.duration);
    }
  }

  onStepBegin(test: TestCase, _result: TestResult, step: TestStep): void {
    this.listeners.forEach((listener) =>
      listener.onStepBegin?.(test, _result, step)
    );

    if (!this.tracesEnabled) {
      return;
    }

    const parent =
      step.parent === undefined
        ? this.testSpans[test.id]
        : this.stepSapns[getHashFromStepTitle(test, step.parent, this.config)];

    const stepHash = getHashFromStepTitle(test, step, this.config);

    const ctx = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      parent
    );

    const stepSpan = this.tracer.startSpan(
      `Step: ${step.title}`,
      {
        startTime: step.startTime,
      },
      ctx
    );

    this.stepSapns[stepHash] = stepSpan;
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void {
    this.listeners.forEach((listener) =>
      listener.onStepEnd?.(test, _result, step)
    );

    if (!this.tracesEnabled) {
      return;
    }

    const stepSpan =
      this.stepSapns[getHashFromStepTitle(test, step, this.config)];
    if (stepSpan) {
      stepSpan.setAttributes({
        ...this.traceAttributes,
        'test.step.category': step.category,
        'test.step.name': step.title,
      });
      if (step.location) {
        stepSpan.setAttributes({
          [ATTR_CODE_FILEPATH]: step.location.file,
          [ATTR_CODE_LINENO]: step.location.line,
          [ATTR_CODE_COLUMN]: step.location.column,
        });
      }
      if (step.error) {
        stepSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: step.error?.message || '',
        });
      }
      stepSpan.end(step.startTime.getTime() + step.duration);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    await Promise.all(
      this.listeners.map((listener) => listener.onEnd?.(result))
    );
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default OpenTelemetryReporter;

/**
 * Prefix required for any annotation to be converted into a span attribute.
 */
export const TEST_ANNOTATION_SCOPE = 'pw_otel_reporter.';

/**
 * Utility function to generate an annotation label which this reporter will
 * use to tag spans.
 *
 * @param label {string} the label to use
 * @returns {string} the label with the required prefix added
 */
export function annotationLabel(label: string): string {
  return `${TEST_ANNOTATION_SCOPE}${label}`;
}
