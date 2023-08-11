/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// deep imports to avoid requiring the ENTIRE package (which will also pull in jsforce) until we get ESM done
import { ConfigAggregator } from '@salesforce/core/lib/config/configAggregator';
import { SfConfigProperties } from '@salesforce/core/lib/config/config';

// store the result to reduce checks
let enabled: boolean | undefined;

/**
 *
 * Check ConfigAggregator once for telemetry opt-out.  Returns true unless config/env has opt-out
 * If you don't pass in a ConfigAggregator, one will be constructed for you
 * memoized: only runs once
 *
 * */
export const isEnabled = async (configAggregator?: ConfigAggregator) => {
  if (enabled === undefined) {
    const agg = configAggregator ?? (await ConfigAggregator.create({}));
    enabled = agg.getPropertyValue<string>(SfConfigProperties.DISABLE_TELEMETRY) !== 'true';
  }
  return enabled;
};
