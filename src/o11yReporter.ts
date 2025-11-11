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
import { Attributes, O11ySchema, Properties, TelemetryOptions } from './types';
import { BaseReporter } from './baseReporter';
import { buildPropertiesAndMeasurements } from './utils';

export class O11yReporter extends BaseReporter {
  private service: O11yService;
  private initialized: Promise<void>;
  private commonProperties: Properties;
  private extensionName = '';
  private customSchema: O11ySchema | null = null; // Schema object provided by consumer

  public constructor(options: TelemetryOptions) {
    super(options);
    this.extensionName = options.extensionName ?? options.project;
    this.service = O11yService.getInstance(this.extensionName);

    // Store the schema object provided by consumer (if any)
    this.customSchema = options.o11ySchema ?? null;

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

    // Create event data
    const eventData: { [key: string]: unknown } = {
      eventName: `${this.extensionName}/${eventName}`,
      ...merged,
    };

    // Use logEventWithSchema if custom schema is loaded, otherwise use default logEvent
    if (this.customSchema) {
      this.service.logEventWithSchema(eventData, this.customSchema);
    } else {
      this.service.logEvent(eventData);
    }

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
      eventName: `${this.extensionName}/exception`,
      exceptionName: cleanException.name,
      exceptionMessage: cleanException.message,
      exceptionStack: cleanException.stack,
      ...properties,
      ...measurements,
    };

    // Use custom schema if available
    if (this.customSchema) {
      this.service.logEventWithSchema(exceptionEvent, this.customSchema);
    } else {
      this.service.logEvent(exceptionEvent);
    }

    await this.service.upload();
  }

  /**
   * Publishes diagnostic information to O11y service
   *
   * @param traceMessage {string} - trace message to send to O11y.
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public async sendTelemetryTrace(traceMessage: string, properties: Properties = {}): Promise<void> {
    await this.initialized;
    const merged = { ...this.commonProperties, ...properties };

    const eventData = {
      eventName: `${this.extensionName}/trace`,
      message: traceMessage,
      ...merged,
    };

    if (this.customSchema) {
      this.service.logEventWithSchema(eventData, this.customSchema);
    } else {
      this.service.logEvent(eventData);
    }

    await this.service.upload();
  }

  /**
   * Publishes metric to O11y service
   *
   * @param metricName {string} - name of the metric you want published
   * @param value {number} - value of the metric
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public async sendTelemetryMetric(metricName: string, value: number, properties: Properties = {}): Promise<void> {
    await this.initialized;
    const merged = { ...this.commonProperties, ...properties };

    const eventData = {
      eventName: `${this.extensionName}/metric`,
      metricName,
      value,
      ...merged,
    };

    if (this.customSchema) {
      this.service.logEventWithSchema(eventData, this.customSchema);
    } else {
      this.service.logEvent(eventData);
    }

    await this.service.upload();
  }

  /**
   * Gets the currently loaded schema object
   */
  public getCurrentSchema(): O11ySchema | null {
    return this.customSchema;
  }

  /**
   * Checks if a custom schema is being used
   */
  public hasCustomSchema(): boolean {
    return this.customSchema !== null;
  }

  private buildO11yCommonProperties(extra?: Properties): Properties {
    const baseProperties = this.buildCommonProperties(extra);
    baseProperties['common.extensionName'] = this.extensionName;
    return baseProperties;
  }
}
