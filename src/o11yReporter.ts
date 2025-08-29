/*
 * Copyright 2025, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { O11yService } from '@salesforce/o11y-reporter';
import { Attributes, Properties, TelemetryOptions } from './types';
import { buildPropertiesAndMeasurements } from './utils';
import { BaseReporter } from './baseReporter';

export class O11yReporter extends BaseReporter {
  private service: O11yService;
  private initialized: Promise<void>;
  private commonProperties: Properties;
  private extensionName = '';

  public constructor(options: TelemetryOptions) {
    super(options);
    this.extensionName = options.extensionName ?? options.project;
    this.service = O11yService.getInstance(this.extensionName);
    this.initialized = this.service.initialize(this.extensionName, options.o11yUploadEndpoint!);
    this.commonProperties = this.buildO11yCommonProperties(options.commonProperties);
  }

  public async init(): Promise<void> {
    await this.initialized;
  }

  public async sendTelemetryEvent(eventName: string, attributes: Attributes = {}): Promise<void> {
    // Wait for initialization to complete before using the service
    await this.initialized;
    
    const merged = { ...this.commonProperties, ...attributes };
    
    this.service.logEvent({ eventName: `${this.extensionName}/${eventName}`, ...merged });
    await this.service.upload();
  }

  public async flush(): Promise<void> {
    // Wait for initialization to complete before using the service
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
    // Wait for initialization to complete before using the service
    await this.initialized;
    
    const cleanException = this.sanitizeError(exception);
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
    // Wait for initialization to complete before using the service
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
    // Wait for initialization to complete before using the service
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

  private buildO11yCommonProperties(extra?: Properties): Properties {
    const baseProperties = this.buildCommonProperties(extra);
    baseProperties['common.extensionName'] = this.extensionName;
    return baseProperties;
  }
} 