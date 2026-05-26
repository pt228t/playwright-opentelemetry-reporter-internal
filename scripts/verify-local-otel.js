const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require('@opentelemetry/semantic-conventions');

const {
  default: OpenTelemetryReporter,
  name: packageName,
  version: packageVersion,
} = require('../build/main');

const traceEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  'http://localhost:4318/v1/traces';
const metricEndpoint =
  process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
  'http://localhost:4318/v1/metrics';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: packageName,
    [ATTR_SERVICE_VERSION]: packageVersion,
  }),
  traceExporter: new OTLPTraceExporter({
    url: traceEndpoint,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exportIntervalMillis: 500,
    exporter: new OTLPMetricExporter({
      url: metricEndpoint,
    }),
  }),
});

function makeTest() {
  return {
    annotations: [],
    expectedStatus: 'passed',
    id: 'verify-local-otel-test',
    location: {
      column: 1,
      file: `${process.cwd()}/test/e2e/example.spec.ts`,
      line: 1,
    },
    outcome: () => 'expected',
    parent: {
      title: 'local verification',
    },
    tags: ['@otel-smoke'],
    title: 'exports metrics and traces',
    titlePath: () => [
      '',
      'verification',
      'test/e2e/example.spec.ts',
      'local verification',
      'exports metrics and traces',
    ],
  };
}

function makeStep() {
  return {
    category: 'verify',
    duration: 25,
    error: undefined,
    location: {
      column: 1,
      file: `${process.cwd()}/test/e2e/example.spec.ts`,
      line: 2,
    },
    parent: undefined,
    startTime: new Date(Date.now() - 25),
    title: 'emit synthetic reporter telemetry',
    titlePath: () => ['emit synthetic reporter telemetry'],
  };
}

async function main() {
  sdk.start();

  const reporter = new OpenTelemetryReporter();
  const config = {
    rootDir: process.cwd(),
  };
  const test = makeTest();
  const step = makeStep();
  const result = {
    duration: 50,
    retry: 0,
    startTime: new Date(Date.now() - 50),
    status: 'passed',
  };

  reporter.onBegin(config, undefined);
  reporter.onTestBegin(test, result);
  reporter.onStepBegin(test, result, step);
  reporter.onStepEnd(test, result, step);
  reporter.onTestEnd(test, result);
  await reporter.onEnd({ status: 'passed' });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await sdk.shutdown();

  console.log(`Sent reporter telemetry to ${traceEndpoint} and ${metricEndpoint}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
