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
import { AppInsights, type Attributes, type Properties, type TelemetryOptions } from './appInsights';
import { TelemetryClient } from './appInsights';
import { isEnabled } from './enabledCheck';

export { TelemetryOptions, Attributes, Properties, TelemetryClient } from './appInsights';

/**
 * Reports telemetry events to app insights. We do not send if the config 'disableTelemetry' is set.
 */
export class TelemetryReporter extends AsyncCreatable<TelemetryOptions> {
  private enabled = false;
  private options: TelemetryOptions;
  private logger!: Logger;
  private reporter!: AppInsights;

  public constructor(options: TelemetryOptions) {
    super(options);
    this.options = options;
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
    if (this.options.waitForConnection) await this.waitForConnection();
    this.reporter = await AppInsights.create(this.options);
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
   * Sends message to child process.
   *
   * @param eventName {string} - name of the event you want published.
   * @param attributes {Attributes} - map of properties to publish alongside the event.
   */
  public sendTelemetryEvent(eventName: string, attributes: Attributes = {}): void {
    if (this.isSfdxTelemetryEnabled()) {
      this.reporter.sendTelemetryEvent(eventName, attributes);
    }
  }

  /**
   * Sends exception to child process.
   *
   * @param exception {Error} - exception you want published.
   * @param attributes {Attributes} - map of measurements to publish alongside the event.
   */
  public sendTelemetryException(exception: Error, attributes: Attributes = {}): void {
    if (this.isSfdxTelemetryEnabled()) {
      // Scrub stack for GDPR
      exception.stack = exception.stack?.replace(new RegExp(os.homedir(), 'g'), AppInsights.GDPR_HIDDEN);
      this.reporter.sendTelemetryException(exception, attributes);
    }
  }

  /**
   * Publishes diagnostic information to app insights dashboard
   *
   * @param traceMessage {string} - trace message to sen to app insights.
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public sendTelemetryTrace(traceMessage: string, properties?: Properties): void {
    if (this.isSfdxTelemetryEnabled()) {
      this.reporter.sendTelemetryTrace(traceMessage, properties);
    }
  }

  /**
   * Publishes metric to app insights dashboard
   *
   * @param metricName {string} - name of the metric you want published
   * @param value {number} - value of the metric
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public sendTelemetryMetric(metricName: string, value: number, properties?: Properties): void {
    if (this.isSfdxTelemetryEnabled()) {
      this.reporter.sendTelemetryMetric(metricName, value, properties);
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
