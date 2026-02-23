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
import { Env } from '@salesforce/kit';
import { Connection as O11yConnection } from '@salesforce/o11y-reporter';

export type Properties = {
  [key: string]: string;
};

export type Measurements = {
  [key: string]: number;
};

export type Attributes = {
  [key: string]: string | number | boolean | null | undefined;
};

/**
 * Basic type for O11y schema objects.
 * Schemas from o11y_schema package are objects that define the structure
 * for telemetry events. This type enforces that a schema must be an object
 * (not a primitive, null, or undefined).
 */
export type O11ySchema = Record<string, unknown>;

/**
 * PDP Product Feature Taxonomy (PFT) event sent via O11y.
 */
export type PdpEvent = {
  /**
   * Unique identifier for the event. Follows this naming convention:
   *     <object>.<action>
   *
   * object = Specific object within the Product Feature that give us context around the action in lowerCamelCase format.
   *          Note: The object name can include context around the Product Feature (eg. slackforceMessage).
   *          Examples: calculatedInsightsRecord,checkoutPaymentmethod, slackforceMessage, promptBuilderTemplate
   *
   * action = Action the user takes in past tense. This should only be ONE word, in lower case
   *          Examples: processed, selected, sent, saved
   */
  eventName: `${string}.${string}`;
  /**
   * Product Feature ID from GUS.
   *
   * Examples:
   *   Salesforce CLI = aJCEE0000000mHP4AY
   *   Salesforce Extensions for VS Code = aJCEE0000000mLm4AI
   */
  productFeatureId: `aJC${string}`;
  /**
   * Populate this if there is a unique component with your Event for which a distinct count would be a relevant metric
   * E.g., CLI plugin command name (<pluginName.commandName>) or ext command name.
   */
  componentId?: string;
  /**
   * Populate this if there is a unique quantity with your Event for which a sum would be a relevant metric for your
   * Product Feature. E.g., rowsProcessed → total Rows processed for Data Streams.
   */
  eventVolume?: number;
  /**
   * Use this field to specify the name of your flexible attribute (eg. experimentId, buttonColor).
   */
  contextName?: string;
  /**
   * Use this field to specify the value of your flexible attribute (eg. exp_123, green).
   */
  contextValue?: string;
};

/**
 * Batching configuration for O11y telemetry
 *
 * Batching is enabled by default. Set enableAutoBatching to false to disable batching
 * and upload events immediately after each event.
 */
export type O11yBatchingConfig = {
  /**
   * Enable automatic batching of events (default: true)
   * Set to false to disable batching and upload events immediately after each event.
   * If not specified, batching is enabled by default.
   */
  enableAutoBatching?: boolean;
  /**
   * Periodic flush interval in milliseconds (default: 30000)
   */
  flushInterval?: number;
  /**
   * Buffer size threshold in bytes before triggering upload (default: 50000 = 50KB)
   */
  thresholdBytes?: number;
  /**
   * Threshold check interval in milliseconds (default: 2000 = 2s). Lower values catch threshold violations faster but use more CPU
   */
  checkInterval?: number;
  /**
   * Enable shutdown hooks (default: true)
   */
  enableShutdownHook?: boolean;
  /**
   * Enable beforeExit hook (default: true). Note: beforeExit won't fire for STDIO servers where stdin stays open
   */
  enableBeforeExitHook?: boolean;
};

export type TelemetryOptions = {
  project: string;
  key: string;
  commonProperties?: Properties;
  /**
   * Optional getConnection function used at upload time to resolve endpoint and token from the current org.
   * If getConnection is missing or fails, uploads use the static o11yUploadEndpoint (no auth).
   * E.g.,
   * ```
   * Connection.create({
   *   authInfo: await AuthInfo.create({ username: 'myAdminUsername' })
   * })
   * ```
   * or
   * ```
   * WorkspaceContextUtil.getInstance().getConnection()
   * ```
   */
  getConnectionFn?: () => Promise<O11yConnection>;
  contextTags?: Properties;
  env?: Env;
  gdprSensitiveKeys?: string[];
  userId?: string;
  sessionId?: string;
  waitForConnection?: boolean;
  o11yUploadEndpoint?: string;
  /**
   * Optional path appended to the org instance URL for the dynamic endpoint.
   * Default: /services/data/v65.0/connect/proxy/ui-telemetry.
   */
  dynamicO11yUploadEndpoint?: string;
  enableO11y?: boolean;
  enableAppInsights?: boolean;
  // O11y-specific options
  extensionName?: string; // For O11yReporter, defaults to project if not provided
  /**
   * Batching configuration for O11y telemetry
   * Batching is enabled by default. Set o11yBatching.enableAutoBatching to false to disable batching
   * and upload events immediately after each event.
   */
  o11yBatching?: O11yBatchingConfig;
};
