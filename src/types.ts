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
};

export function buildPropertiesAndMeasurements(attributes: Attributes): {
  properties: Properties;
  measurements: Measurements;
} {
  const properties: Properties = {};
  const measurements: Measurements = {};
  Object.keys(attributes).forEach((key) => {
    const value = attributes[key];
    if (typeof value === 'string') {
      properties[key] = value.replace(process.env.HOME ?? '', '~');
    } else if (typeof value === 'number') {
      measurements[key] = value;
    } else if (typeof value === 'boolean') {
      properties[key] = value.toString();
    }
  });
  return { properties, measurements };
} 