import {
  MetricRecorder as IMetricRecorder,
  Metric,
  MetricAttributes,
  MetricKind,
  MetricsExporter,
} from './types';

export class MetricRecorder implements IMetricRecorder {
  constructor(
    private exporter: MetricsExporter,
    private clock: () => number = Date.now
  ) {}

  recordDuration(
    name: string,
    duration: number,
    attributes: MetricAttributes = {}
  ): void {
    this.record('duration', name, duration, attributes);
  }

  recordCounter(
    name: string,
    value = 1,
    attributes: MetricAttributes = {}
  ): void {
    this.record('counter', name, value, attributes);
  }

  recordGauge(
    name: string,
    value: number,
    attributes: MetricAttributes = {}
  ): void {
    this.record('gauge', name, value, attributes);
  }

  private record(
    kind: MetricKind,
    name: string,
    value: number,
    attributes: MetricAttributes
  ): void {
    const metric: Metric = {
      name,
      kind,
      value,
      attributes,
      timestamp: this.clock(),
    };

    this.exporter.send(metric);
  }
}
