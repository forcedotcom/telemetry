/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'node:os';
import { O11yService } from '@salesforce/o11y-reporter';
import { Attributes, Properties, buildPropertiesAndMeasurements } from './types';

export type O11yReporterOptions = {
  extensionName: string;
  uploadEndpoint: string;
  commonProperties?: Properties;
};

function getPlatformVersion(): string {
  return (os.release() || '').replace(/^(\d+)(\.\d+)?(\.\d+)?(.*)/, '$1$2$3');
}

function getCpus(): string {
  const cpus = os.cpus();
  if (cpus && cpus.length > 0) {
    return `${cpus[0].model}(${cpus.length} x ${cpus[0].speed})`;
  } else {
    return '';
  }
}

function getSystemMemory(): string {
  return `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const homeDir = os.homedir();

const sanitizeError = (err: Error): Error => {
  const sanitizedErr = new Error(err.message);
  sanitizedErr.name = err.name;
  if (sanitizedErr.name) {
    sanitizedErr.name = sanitizedErr.name.replace(homeDir, '~');
  }
  if (sanitizedErr.message) {
    sanitizedErr.message = sanitizedErr.message.replace(homeDir, '~');
  }
  if (err.stack) {
    // there might be lots of this one
    sanitizedErr.stack = err.stack.replace(new RegExp(`\b${homeDir}\b`, 'gi'), '~');
  }
  return sanitizedErr;
};

export class O11yReporter {
  private service: O11yService;
  private initialized: Promise<void>;
  private commonProperties: Properties;
  private extensionName = '';

  public constructor(options: O11yReporterOptions) {
    this.extensionName = options.extensionName;
    this.service = O11yService.getInstance(options.extensionName);
    this.initialized = this.service.initialize(options.extensionName, options.uploadEndpoint);
    this.commonProperties = this.buildCommonProperties(options.commonProperties);
  }

  public async sendTelemetryEvent(eventName: string, attributes: Attributes = {}): Promise<void> {
    await this.initialized;
    const merged = { ...this.commonProperties, ...attributes };
    
    this.service.logEvent({ eventName: `${this.extensionName}/${eventName}`, ...merged });
    await this.service.upload();
  }

  public async flush(): Promise<void> {
    await this.initialized;
    await this.service.upload();
  }

  /**
   * Publishes exception to O11y service
   *
   * @param exception {Error} - exception you want published.
   * @param attributes {Attributes} - map of measurements to publish alongside the exception.
   */
  public async sendTelemetryException(exception: Error, attributes: Attributes = {}): Promise<void> {
    await this.initialized;
    
    const cleanException = sanitizeError(exception);
    const { properties, measurements } = buildPropertiesAndMeasurements(attributes);
    
    // Create exception event with sanitized error information
    const exceptionEvent = {
      eventName: 'exception',
      exceptionName: cleanException.name,
      exceptionMessage: cleanException.message,
      exceptionStack: cleanException.stack,
      ...properties,
      ...measurements,
    };
    
    this.service.logEvent(exceptionEvent);
    await this.service.upload();
  }

  /**
   * Publishes diagnostic information to O11y service
   *
   * @param traceMessage {string} - trace message to send to O11y.
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public async sendTelemetryTrace(traceMessage: string, properties?: Properties): Promise<void> {
    await this.initialized;
    
    const traceEvent = {
      eventName: 'trace',
      message: traceMessage,
      ...properties,
    };
    
    this.service.logEvent(traceEvent);
    await this.service.upload();
  }

  /**
   * Publishes metric to O11y service
   *
   * @param metricName {string} - name of the metric you want published
   * @param value {number} - value of the metric
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public async sendTelemetryMetric(metricName: string, value: number, properties?: Properties): Promise<void> {
    await this.initialized;
    
    const metricEvent = {
      eventName: 'metric',
      metricName,
      value,
      ...properties,
    };
    
    this.service.logEvent(metricEvent);
    await this.service.upload();
  }

  private buildCommonProperties(extra?: Properties): Properties {
    // Use 'this' to satisfy class-methods-use-this
    const baseProperties: Properties = {
      'common.cpus': getCpus(),
      'common.os': os.platform(),
      'common.platformversion': getPlatformVersion(),
      'common.systemmemory': getSystemMemory(),
      // Reference this to satisfy linter
      'common.extensionName': this.extensionName,
    };
    return Object.assign(baseProperties, extra);
  }
} 