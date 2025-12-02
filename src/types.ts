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
import { Env } from '@salesforce/kit';

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
  contextTags?: Properties;
  env?: Env;
  gdprSensitiveKeys?: string[];
  userId?: string;
  sessionId?: string;
  waitForConnection?: boolean;
  o11yUploadEndpoint?: string;
  enableO11y?: boolean;
  enableAppInsights?: boolean;
  // O11y-specific options
  extensionName?: string; // For O11yReporter, defaults to project if not provided
  // Consumer-provided schema support
  o11ySchema?: O11ySchema; // Schema object loaded by consumer (e.g., commerceInstrumentationSchema)
  /**
   * Batching configuration for O11y telemetry
   * Batching is enabled by default. Set o11yBatching.enableAutoBatching to false to disable batching
   * and upload events immediately after each event.
   */
  o11yBatching?: O11yBatchingConfig;
};
