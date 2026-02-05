/*
 * Copyright 2026, Salesforce, Inc.
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
import { O11yService, type BatchingOptions } from '@salesforce/o11y-reporter';
import { pdpEventSchema } from 'o11y_schema/sf_pdp';
import { Attributes, O11ySchema, PdpEvent, Properties, TelemetryOptions } from './types';
import { BaseReporter } from './baseReporter';
import { buildPropertiesAndMeasurements } from './utils';

export class O11yReporter extends BaseReporter {
  private service: O11yService;
  private initialized: Promise<void>;
  private commonProperties: Properties;
  private extensionName = '';
  private _batchingCleanup: (() => void) | null = null; // Cleanup function for auto-batching
  private _batchingEnabled: boolean = false; // Track if batching is enabled

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

  /**
   * Enable automatic batching with periodic flush and shutdown hooks
   *
   * Consumers can call this method to enable batching with custom options.
   * If batching is not enabled, events will be buffered but not automatically uploaded.
   * Use flush() to manually upload events when batching is disabled.
   *
   * @param options - Batching configuration options
   * @returns Cleanup function to stop batching and remove hooks
   *
   * @example
   * ```typescript
   * await reporter.init();
   * const cleanup = reporter.enableAutoBatching({
   *   flushInterval: 30_000, // 30 seconds
   *   enableShutdownHook: true,
   * });
   * ```
   */
  public enableAutoBatching(options?: BatchingOptions): () => void {
    this._batchingEnabled = true;
    this._batchingCleanup = this.service.enableAutoBatching(options);
    return this._batchingCleanup;
  }

  /**
   * Check if auto-batching is currently enabled
   */
  public isBatchingEnabled(): boolean {
    return this._batchingEnabled;
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

    this.service.logEvent(eventData);

    // If batching is not enabled, upload immediately for backward compatibility
    if (!this._batchingEnabled) {
      await this.service.forceFlush();
    }
    // If batching is enabled, events will be automatically uploaded based on
    // threshold (50KB) or periodic flush interval.
  }

  /**
   * Sends a telemetry event with a specific O11y schema.
   * Use this method when you need to send events that conform to a particular schema
   * (e.g. PFT/pdpEventSchema). Only the events you send via this method use the given schema;
   * all other events use the default schema via sendTelemetryEvent.
   *
   * @param eventName - Name of the event
   * @param attributes - Properties and measurements to publish alongside the event
   * @param schema - O11y schema object (e.g. from o11y_schema package)
   */
  public async sendTelemetryEventWithSchema(
    eventName: string,
    attributes: Attributes,
    schema: O11ySchema
  ): Promise<void> {
    await this.initialized;

    const merged = { ...this.commonProperties, ...attributes };

    const eventData: { [key: string]: unknown } = {
      eventName: `${this.extensionName}/${eventName}`,
      ...merged,
    };

    this.service.logEventWithSchema(eventData, schema);

    if (!this._batchingEnabled) {
      await this.service.forceFlush();
    }
  }

  /**
   * Sends a PDP event via O11y service.
   *
   * @param event - PDP event to send.
   */
  public async sendPdpEvent(event: PdpEvent): Promise<void> {
    await this.initialized;

    this.service.logEventWithSchema(event, pdpEventSchema);

    if (!this._batchingEnabled) {
      await this.service.forceFlush();
    }
  }

  public async flush(): Promise<void> {
    // Wait for initialization to complete before using the service
    await this.initialized;
    // Use forceFlush for explicit manual flush
    await this.service.forceFlush();
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

    this.service.logEvent(exceptionEvent);

    // If batching is not enabled, upload immediately for backward compatibility
    if (!this._batchingEnabled) {
      await this.service.forceFlush();
    }
    // If batching is enabled, events will be automatically uploaded based on
    // threshold (50KB) or periodic flush interval.
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

    const traceEvent = {
      eventName: `${this.extensionName}/trace`,
      message: traceMessage,
      ...merged,
    };

    this.service.logEvent(traceEvent);

    // If batching is not enabled, upload immediately for backward compatibility
    if (!this._batchingEnabled) {
      await this.service.forceFlush();
    }
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

    const metricEvent = {
      eventName: `${this.extensionName}/metric`,
      metricName,
      value,
      ...merged,
    };

    this.service.logEvent(metricEvent);

    // If batching is not enabled, upload immediately for backward compatibility
    if (!this._batchingEnabled) {
      await this.service.forceFlush();
    }
  }

  private buildO11yCommonProperties(extra?: Properties): Properties {
    const baseProperties = this.buildCommonProperties(extra);
    baseProperties['common.extensionName'] = this.extensionName;
    return baseProperties;
  }
}
