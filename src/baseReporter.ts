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
