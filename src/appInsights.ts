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
import { Logger } from '@salesforce/core/logger';
import { Env } from '@salesforce/kit';
import * as appInsights from 'applicationinsights';
import { Properties, Attributes, TelemetryOptions } from './types';
import { buildPropertiesAndMeasurements } from './utils';
import { BaseReporter } from './baseReporter';

export { TelemetryClient } from 'applicationinsights';



function isAsimovKey(key: string): boolean {
  return !!key?.startsWith('AIF-');
}

/**
 * This is a wrapper around appinsights sdk for convenience.
 *
 * NOTE: THis should not be used directly. Use TelemetryReporter which
 * will check if telemetry is disabled and do GDPR checks.
 */
export class AppInsights extends BaseReporter {
  public static GDPR_HIDDEN = '<GDPR_HIDDEN>';
  public static APP_INSIGHTS_SERVER = 'https://dc.services.visualstudio.com';
  private static ASIMOV_ENDPOINT = 'https://vortex.data.microsoft.com/collect/v1';
  public appInsightsClient!: appInsights.TelemetryClient;
  private options: TelemetryOptions;
  private logger!: Logger;
  private env!: Env;
  private gdprSensitiveKeys: string[] = [];

  public constructor(options: TelemetryOptions) {
    super(options);
    this.options = options;

    this.env = this.options.env ?? new Env();

    if (this.options.gdprSensitiveKeys) {
      this.gdprSensitiveKeys = this.options.gdprSensitiveKeys;
    } else {
      // By default, cloudRoleInstance if a gdpr sensitive property.
      const keys = new appInsights.Contracts.ContextTagKeys();
      this.gdprSensitiveKeys = [keys.cloudRoleInstance];
    }
  }

  public async init(): Promise<void> {
    this.logger = await Logger.child('AppInsights');
    this.createAppInsightsClient();
  }

  /**
   * Publishes event to app insights dashboard
   *
   * @param eventName {string} - name of the event you want published. Will be concatenated with this.options.project
   * @param attributes {Attributes} - map of properties to publish alongside the event.
   */
  public sendTelemetryEvent(eventName: string, attributes: Attributes = {}): void {
    const name = `${this.options.project}/${eventName}`;
    this.logger.debug(`Sending telemetry event: ${name}`);
    const { properties, measurements } = buildPropertiesAndMeasurements(attributes);
    this.appInsightsClient.trackEvent({ name, properties, measurements });
  }

  /**
   * Publishes exception to app insights dashboard
   *
   * @param exception {Error} - exception you want published.
   * @param attributes {Attributes} - map of measurements to publish alongside the exception.
   */
  public sendTelemetryException(exception: Error, attributes: Attributes = {}): void {
    const cleanException = this.sanitizeError(exception);
    this.logger.debug(`Sending telemetry exception: ${cleanException.message}`);
    const { properties, measurements } = buildPropertiesAndMeasurements(attributes);
    this.appInsightsClient.trackException({ exception: cleanException, properties, measurements });
  }

  /**
   * Publishes diagnostic information to app insights dashboard
   *
   * @param traceMessage {string} - trace message to sen to app insights.
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public sendTelemetryTrace(traceMessage: string, properties?: Properties): void {
    this.logger.debug(`Sending telemetry: trace ${traceMessage}`);
    this.appInsightsClient.trackTrace({ message: traceMessage, properties });
  }

  /**
   * Publishes metric to app insights dashboard
   *
   * @param metricName {string} - name of the metric you want published
   * @param value {number} - value of the metric
   * @param properties {Properties} - map of properties to publish alongside the event.
   */
  public sendTelemetryMetric(metricName: string, value: number, properties?: Properties): void {
    this.logger.debug(`Sending telemetry metric: ${metricName}`);
    this.appInsightsClient.trackMetric({ name: metricName, value, properties });
  }

  // eslint-disable-next-line class-methods-use-this
  public start(): void {
    // Start data collection services
    appInsights.start();
  }

  public stop(): void {
    this.appInsightsClient.flush();
    appInsights.dispose();
  }

  /**
   * Initiates the app insights client
   */
  private createAppInsightsClient(): void {
    this.logger.debug('creating appInsightsClient');

    appInsights.setup(this.options.key);

    this.appInsightsClient = appInsights.defaultClient;
    this.appInsightsClient.commonProperties = this.buildAppInsightsCommonProperties();
    this.appInsightsClient.context.tags = this.buildContextTags();

    if (isAsimovKey(this.options.key)) {
      this.appInsightsClient.config.endpointUrl = AppInsights.ASIMOV_ENDPOINT;
    }
    if (this.options.userId) {
      this.appInsightsClient.context.tags['ai.user.id'] = this.options.userId;
    }
    if (this.options.sessionId) {
      this.appInsightsClient.context.tags['ai.session.id'] = this.options.sessionId;
    }
  }

  /**
   * Builds the properties to send with every event
   *
   * @return {Properties} map of base properties and properties provided when class was created
   */
  private buildAppInsightsCommonProperties(): Properties {
    const baseProperties = this.buildCommonProperties();
    baseProperties['common.usertype'] = this.env.getString('SFDX_USER_TYPE') ?? 'normal';
    return Object.assign(baseProperties, this.options.commonProperties);
  }

  /**
   * Builds the context tags for appInsightsClient
   *
   * @return {Properties} map of tags to add to this.appInsightsClient.context.tags
   */
  private buildContextTags(): Properties {
    const currentTags = this.appInsightsClient ? this.appInsightsClient.context.tags : {};
    const cleanedTags = this.hideGDPRdata(currentTags);
    return Object.assign({}, cleanedTags, this.options.contextTags);
  }
  // filters out non-GDPR compliant tags
  private hideGDPRdata(tags: Properties): Properties {
    this.gdprSensitiveKeys.forEach((key) => {
      tags[key] = AppInsights.GDPR_HIDDEN;
    });
    return tags;
  }
}
