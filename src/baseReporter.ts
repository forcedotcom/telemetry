/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'node:os';
import { AsyncCreatable } from '@salesforce/kit';
import { Properties, TelemetryOptions } from './types';

export abstract class BaseReporter extends AsyncCreatable<TelemetryOptions> {
  // eslint-disable-next-line class-methods-use-this
  protected getPlatformVersion(): string {
    return (os.release() || '').replace(/^(\d+)(\.\d+)?(\.\d+)?(.*)/, '$1$2$3');
  }

  // eslint-disable-next-line class-methods-use-this
  protected getCpus(): string {
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      return `${cpus[0].model}(${cpus.length} x ${cpus[0].speed})`;
    } else {
      return '';
    }
  }

  // eslint-disable-next-line class-methods-use-this
  protected getSystemMemory(): string {
    return `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // eslint-disable-next-line class-methods-use-this
  protected sanitizeError(err: Error): Error {
    const homeDir = os.homedir();
    const sanitizedErr = new Error(err.message);
    sanitizedErr.name = err.name;
    if (sanitizedErr.name) {
      sanitizedErr.name = sanitizedErr.name.replace(homeDir, '~');
    }
    if (sanitizedErr.message) {
      sanitizedErr.message = sanitizedErr.message.replace(homeDir, '~');
    }
    if (err.stack) {
      // there might be lots of this one
      sanitizedErr.stack = err.stack.replace(new RegExp(`\b${homeDir}\b`, 'gi'), '~');
    }
    return sanitizedErr;
  }

  protected buildCommonProperties(extra?: Properties): Properties {
    const baseProperties: Properties = {
      'common.cpus': this.getCpus(),
      'common.os': os.platform(),
      'common.platformversion': this.getPlatformVersion(),
      'common.systemmemory': this.getSystemMemory(),
    };
    return Object.assign(baseProperties, extra);
  }
} 