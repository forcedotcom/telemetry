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

// deep imports to avoid requiring the ENTIRE package (which will also pull in jsforce) until we get ESM done
import { ConfigAggregator } from '@salesforce/core/configAggregator';
import { SfConfigProperties } from '@salesforce/core/config';

// store the result to reduce checks
let enabled: boolean | undefined;

/**
 *
 * Check ConfigAggregator once for telemetry opt-out.  Returns true unless config/env has opt-out
 * If you don't pass in a ConfigAggregator, one will be constructed for you
 * memoized: only runs once
 *
 * */
export const isEnabled = async (configAggregator?: ConfigAggregator): Promise<boolean> => {
  if (enabled === undefined) {
    const agg = configAggregator ?? (await ConfigAggregator.create({}));
    enabled = agg.getPropertyValue<string>(SfConfigProperties.DISABLE_TELEMETRY) !== 'true';
  }
  return enabled;
};
