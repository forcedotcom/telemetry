/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
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
};

 