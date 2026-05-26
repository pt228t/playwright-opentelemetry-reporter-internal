import opentelemetry from '@opentelemetry/api';
import { Counter, Gauge, Histogram, Meter } from '@opentelemetry/api';

import { name as PKG_NAME, version as PKG_VERSION } from '../../version';
import { Metric, MetricsExporter } from '../types';

export class OpenTelemetryMetricsExporter implements MetricsExporter {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  constructor(private meter?: Meter) {}

  send(metric: Metric): void {
    if (metric.kind === 'duration') {
      this.getHistogram(metric.name).record(metric.value, metric.attributes);
    } else if (metric.kind === 'counter') {
      this.getCounter(metric.name).add(metric.value, metric.attributes);
    } else {
      this.getGauge(metric.name).record(metric.value, metric.attributes);
    }
  }

  private getCounter(name: string): Counter {
    const counter = this.counters.get(name);

    if (counter) {
      return counter;
    }

    const createdCounter = this.getMeter().createCounter(name);
    this.counters.set(name, createdCounter);

    return createdCounter;
  }

  private getGauge(name: string): Gauge {
    const gauge = this.gauges.get(name);

    if (gauge) {
      return gauge;
    }

    const createdGauge = this.getMeter().createGauge(name);
    this.gauges.set(name, createdGauge);

    return createdGauge;
  }

  private getHistogram(name: string): Histogram {
    const histogram = this.histograms.get(name);

    if (histogram) {
      return histogram;
    }

    const createdHistogram = this.getMeter().createHistogram(name, {
      unit: 'ms',
    });
    this.histograms.set(name, createdHistogram);

    return createdHistogram;
  }

  private getMeter(): Meter {
    if (!this.meter) {
      this.meter = opentelemetry.metrics.getMeter(PKG_NAME, PKG_VERSION);
    }

    return this.meter;
  }
}
