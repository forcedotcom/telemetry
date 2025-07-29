/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'node:os';
import { Logger, SfConfigProperties } from '@salesforce/core';
import { AsyncCreatable, env } from '@salesforce/kit';

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
  private reporter!: AppInsights;
  private enableO11y: boolean;
  private o11yReporter?: O11yReporter;

  public constructor(options: TelemetryOptions) {
    super(options);
    this.options = options;
    this.enableO11y = options.enableO11y ?? false; // default to false for backward compatibility
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

    // Provide a default invalid key for backward compatibility when key is empty or undefined
    // This allows O11y-only telemetry to work without requiring consumers to provide a valid AppInsights key
    if (!this.options.key || this.options.key.trim() === '') {
      this.options.key = 'InstrumentationKey=invalid-key-for-o11y-only-mode'; // Default invalid connection string
    }

    if (this.options.waitForConnection) await this.waitForConnection();
    this.reporter = await AppInsights.create(this.options);

    // Only initialize O11yReporter if telemetry is enabled, enableO11y is true AND o11yUploadEndpoint is provided
    if (this.isSfdxTelemetryEnabled() && this.enableO11y) {
      if (this.options.o11yUploadEndpoint) {
        try {
          this.o11yReporter = new O11yReporter(this.options);
          this.logger.debug('O11y reporter initialized successfully');
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
    this.reporter.start();
  }

  /**
   * Immediately flush and dispose of the reporter. This can usually take 1-3 seconds
   * not counting timeouts.
   */
  public stop(): void {
    this.reporter.stop();
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
    // Send to AppInsights only if SFDX telemetry is enabled
    if (this.isSfdxTelemetryEnabled()) {
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
    if (this.isSfdxTelemetryEnabled()) {
      // Scrub stack for GDPR
      const sanitizedException = new Error(exception.message);
      sanitizedException.name = exception.name;
      sanitizedException.stack = exception.stack?.replace(new RegExp(os.homedir(), 'g'), AppInsights.GDPR_HIDDEN);

      // Send to AppInsights
      this.reporter.sendTelemetryException(sanitizedException, attributes);
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
    if (this.isSfdxTelemetryEnabled()) {
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
    if (this.isSfdxTelemetryEnabled()) {
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
    return this.reporter.appInsightsClient;
  }
}
