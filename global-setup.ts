import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
// import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { FullConfig } from '@playwright/test';

import { name as PKG_NAME, version as PKG_VERSION } from './src/lib/version';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: PKG_NAME,
    [ATTR_SERVICE_VERSION]: PKG_VERSION,
  }),
  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
        'http://localhost:4318/v1/metrics',
    }),
  }),
});

export default async function globalSetup(_config: FullConfig) {
  sdk.start();

  return async () => {
    await sdk.shutdown();
  };
}
