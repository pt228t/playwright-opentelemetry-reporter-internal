import {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

export interface TestEventListener {
  onBegin?(config: FullConfig, suite?: Suite): void;
  onEnd?(result: FullResult): void | Promise<void>;
  onTestBegin?(test: TestCase, result: TestResult): void;
  onTestEnd?(test: TestCase, result: TestResult): void;
  onStepBegin?(test: TestCase, result: TestResult, step: TestStep): void;
  onStepEnd?(test: TestCase, result: TestResult, step: TestStep): void;
}
