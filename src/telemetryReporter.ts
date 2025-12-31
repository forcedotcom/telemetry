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
import * as os from 'node:os';
import { Logger, SfConfigProperties } from '@salesforce/core';
import { AsyncCreatable, env } from '@salesforce/kit';

import type { BatchingOptions } from '@salesforce/o11y-reporter';
import got from 'got';
import { ProxyAgent } from 'proxy-agent';
import { AppInsights, TelemetryClient } from './appInsights';
import { isEnabled } from './enabledCheck';
import { O11yReporter } from './o11yReporter';
import { Attributes, Properties, TelemetryOptions } from './types';

/**
 * This is the main telemetry reporter that should be used by consumers.
 * It will check if telemetry is disabled and do GDPR checks.
 */
export class TelemetryReporter extends AsyncCreatable<TelemetryOptions> {
  private enabled = false;
  private options: TelemetryOptions;
  private logger!: Logger;
  private reporter?: AppInsights;
  private enableO11y: boolean;
  private enableAppInsights: boolean;
  private o11yReporter?: O11yReporter;

  public constructor(options: TelemetryOptions) {
    super(options);
    this.options = options;
    this.enableO11y = options.enableO11y ?? false; // default to false for backward compatibility
    this.enableAppInsights = options.enableAppInsights ?? true; // default to true for backward compatibility
  }

  /**
   * @deprecated Use the standalone function isEnabled() instead.
   * Determine if the telemetry event should be logged.
   * Setting the disableTelemetry config var to true will disable insights for errors and diagnostics.
   */
  public static async determineSfdxTelemetryEnabled(): Promise<boolean> {
    return isEnabled();
  }

  public async init(): Promise<void> {
    this.enabled = await isEnabled();
    this.logger = await Logger.child('TelemetryReporter');

    // Initialize AppInsights only if enabled and we have a valid key
    if (this.enableAppInsights && this.options.key && this.options.key.trim() !== '') {
      if (this.options.waitForConnection) await this.waitForConnection();
      this.reporter = await AppInsights.create(this.options);
    } else if (this.enableAppInsights && (!this.options.key || this.options.key.trim() === '')) {
      // If AppInsights is enabled but no key provided, log a warning and skip initialization
      this.logger.warn('AppInsights is enabled but no valid key provided. Skipping AppInsights initialization.');
    }
    // If AppInsights is disabled, this.reporter remains undefined

    // Only initialize O11yReporter if telemetry is enabled, enableO11y is true AND o11yUploadEndpoint is provided
    if (this.isSfdxTelemetryEnabled() && this.enableO11y) {
      if (this.options.o11yUploadEndpoint) {
        try {
          this.o11yReporter = new O11yReporter(this.options);
          await this.o11yReporter.init();

          // Configure batching - enabled by default unless explicitly disabled
          const batchingConfig = this.options.o11yBatching;
          // Batching is enabled by default. Only disable if explicitly set to false
          const enableAutoBatching = batchingConfig?.enableAutoBatching !== false;

          if (enableAutoBatching) {
            // Enable auto-batching with provided options or defaults
            const batchingOptions = {
              flushInterval: batchingConfig?.flushInterval ?? 30_000, // 30 seconds default
              thresholdBytes: batchingConfig?.thresholdBytes,
              checkInterval: batchingConfig?.checkInterval,
              enableShutdownHook: batchingConfig?.enableShutdownHook ?? true,
              enableBeforeExitHook: batchingConfig?.enableBeforeExitHook,
            } as BatchingOptions;
            this.o11yReporter.enableAutoBatching(batchingOptions);
            this.logger.debug('O11y reporter initialized with auto-batching enabled (default)');
          } else {
            // Batching explicitly disabled - events will be uploaded immediately after each event
            this.logger.debug('O11y reporter initialized with auto-batching disabled (immediate uploads)');
          }
        } catch (error) {
          this.logger.warn('Failed to initialize O11y reporter:', error);
          this.o11yReporter = undefined;
        }
      } else {
        this.logger.warn('O11y reporter not initialized: o11yUploadEndpoint is missing.');
      }
    }
  }

  /**
   * Starts data collection services. This is for long running processes. Short lived
   * processes can call send*Event directly then finish it by TelemetryReporter.stop().
   */
  public start(): void {
    this.reporter?.start();
  }

  /**
   * Immediately flush and dispose of the reporter. This can usually take 1-3 seconds
   * not counting timeouts.
   */
  public stop(): void {
    this.reporter?.stop();
    void this.o11yReporter?.flush();
  }

  public async waitForConnection(): Promise<void> {
    const canConnect = await this.testConnection();
    if (!canConnect) {
      throw new Error('Unable to connect to app insights.');
    }
  }

  public async testConnection(): Promise<boolean> {
    const timeout = parseInt(env.getString('SFDX_TELEMETRY_TIMEOUT', '1000'), 10);
    this.logger.debug(`Testing connection to ${AppInsights.APP_INSIGHTS_SERVER} with timeout of ${timeout} ms`);

    try {
      const resp = await got.get(AppInsights.APP_INSIGHTS_SERVER, {
        throwHttpErrors: false,
        agent: { https: new ProxyAgent() },
        retry: {
          methods: ['GET'],
          errorCodes: ['ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'EPIPE'],
        },
        timeout: {
          lookup: 100,
          send: 10_000,
          response: 1000,
        },
      });
      if (resp.statusCode < 500) {
        this.logger.debug(`Successfully made a connection to ${AppInsights.APP_INSIGHTS_SERVER}`);
        return true;
      }
      this.logger.error(`${AppInsights.APP_INSIGHTS_SERVER} responded with ${resp.statusCode}`);
      throw new Error(resp.statusCode.toString());
    } catch (err) {
      this.logger.warn(`Connection to ${AppInsights.APP_INSIGHTS_SERVER} timed out after ${timeout} ms`);
      return false;
    }
  }

  /**
   * Sends message to both AppInsights and O11y (if enabled).
   *
   * @param eventName {string} - name of the event you want published.
   * @param attributes {Attributes} - map of properties to publish alongside the event.
   */
  public sendTelemetryEvent(eventName: string, attributes: Attributes = {}): void {
    // Send to AppInsights only if SFDX telemetry is enabled and AppInsights is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableAppInsights && this.reporter) {
      this.reporter.sendTelemetryEvent(eventName, attributes);
    }

    // Send to O11y if telemetry is enabled and O11y is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableO11y && this.o11yReporter) {
      void this.o11yReporter.sendTelemetryEvent(eventName, attributes).catch((error) => {
        this.logger.debug('Failed to send event to O11y:', error);
      });
    }
  }

  /**
   * Sends exception to both AppInsights and O11y (if enabled).
   *
   * @param exception {Error} - exception you want published.
   * @param attributes {Attributes} - map of measurements to publish alongside the exception.
   */
  public sendTelemetryException(exception: Error, attributes: Attributes = {}): void {
    // Send to AppInsights only if SFDX telemetry is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableAppInsights && this.reporter) {
      // Scrub stack for GDPR
      const sanitizedException = new Error(exception.message);
      sanitizedException.name = exception.name;
      sanitizedException.stack = exception.stack?.replace(new RegExp(os.homedir(), 'g'), AppInsights.GDPR_HIDDEN);

      // Send to AppInsights
      this.reporter?.sendTelemetryException(sanitizedException, attributes);
    }

    // Send to O11y if telemetry is enabled and O11y is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableO11y && this.o11yReporter) {
      void this.o11yReporter.sendTelemetryException(exception, attributes).catch((error) => {
        this.logger.debug('Failed to send exception to O11y:', error);
      });
    }
  }

  /**
   * Publishes diagnostic information to both AppInsights and O11y (if enabled).
   *
   * @param traceMessage {string} - trace message to send to app insights.
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public sendTelemetryTrace(traceMessage: string, properties?: Properties): void {
    // Send to AppInsights only if SFDX telemetry is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableAppInsights && this.reporter) {
      // Send to AppInsights
      this.reporter.sendTelemetryTrace(traceMessage, properties);
    }

    // Send to O11y if telemetry is enabled and O11y is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableO11y && this.o11yReporter) {
      void this.o11yReporter.sendTelemetryTrace(traceMessage, properties).catch((error) => {
        this.logger.debug('Failed to send trace to O11y:', error);
      });
    }
  }

  /**
   * Publishes metric to both AppInsights and O11y (if enabled).
   *
   * @param metricName {string} - name of the metric you want published
   * @param value {number} - value of the metric
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public sendTelemetryMetric(metricName: string, value: number, properties?: Properties): void {
    // Send to AppInsights only if SFDX telemetry is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableAppInsights && this.reporter) {
      // Send to AppInsights
      this.reporter.sendTelemetryMetric(metricName, value, properties);
    }

    // Send to O11y if telemetry is enabled and O11y is enabled
    if (this.isSfdxTelemetryEnabled() && this.enableO11y && this.o11yReporter) {
      void this.o11yReporter.sendTelemetryMetric(metricName, value, properties).catch((error) => {
        this.logger.debug('Failed to send metric to O11y:', error);
      });
    }
  }

  /**
   * Determine if the telemetry event should be logged.
   * Setting the disableTelemetry config var to true will disable insights for errors and diagnostics.
   */
  public isSfdxTelemetryEnabled(): boolean {
    return this.enabled;
  }

  public logTelemetryStatus(): void {
    if (this.enabled) {
      this.logger.warn(
        `Telemetry is enabled. This can be disabled by running sfdx force:config:set ${SfConfigProperties.DISABLE_TELEMETRY}=true`
      );
    } else {
      this.logger.warn(
        `Telemetry is disabled. This can be enabled by running sfdx force:config:set ${SfConfigProperties.DISABLE_TELEMETRY}=false`
      );
    }
  }

  /**
   * Gets the underline telemetry client. This should only be used to set
   * additional options that are not exposed in the init options. This should
   * NOT be used to send events as it will by pass disabled checks.
   */
  public getTelemetryClient(): TelemetryClient {
    if (!this.reporter) {
      throw new Error(
        'AppInsights is not initialized. Check if enableAppInsights is true and a valid key is provided.'
      );
    }
    return this.reporter.appInsightsClient;
  }

  /**
   * Enable automatic batching for O11y telemetry events.
   *
   * This method allows consumers to configure batching options for O11y telemetry.
   * If batching is not enabled, events will be buffered but not automatically uploaded.
   * Use flush() to manually upload events when batching is disabled.
   *
   * Note: Auto-batching is enabled by default with 30-second flush interval during init().
   * Calling this method will override the default batching configuration.
   *
   * @param options - Batching configuration options
   * @returns Cleanup function to stop batching and remove hooks, or undefined if O11y is not enabled
   *
   * @example
   * ```typescript
   * const cleanup = reporter.enableAutoBatching({
   *   flushInterval: 60_000, // 60 seconds
   *   enableShutdownHook: true,
   * });
   * ```
   */
  public enableAutoBatching(options?: BatchingOptions): (() => void) | undefined {
    if (!this.o11yReporter) {
      this.logger.debug('O11y reporter is not initialized. enableAutoBatching() has no effect.');
      return undefined;
    }
    return this.o11yReporter.enableAutoBatching(options);
  }

  /**
   * Force an immediate flush of buffered O11y telemetry events.
   *
   * This method triggers an immediate upload of all currently buffered telemetry events.
   * It's useful for ensuring critical events are sent immediately, or for
   * flushing remaining events before an application exits.
   *
   * @returns Promise that resolves when the upload completes, or undefined if O11y is not enabled
   *
   * @example
   * ```typescript
   * // Flush events before critical operation
   * await reporter.flush();
   * ```
   */
  public async flush(): Promise<void> {
    if (!this.o11yReporter) {
      this.logger.debug('O11y reporter is not initialized. flush() has no effect.');
      return;
    }
    await this.o11yReporter.flush();
  }
}
