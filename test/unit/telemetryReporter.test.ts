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
import { ConfigAggregator, Logger } from '@salesforce/core';
import { O11yService } from '@salesforce/o11y-reporter';
import got from 'got';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AppInsights } from '../../src/appInsights';
import { O11yReporter } from '../../src/o11yReporter';
import { TelemetryReporter } from '../../src/telemetryReporter';
import type { PdpEvent, TelemetryOptions } from '../../src/types';
import * as enabledStubs from '../../src/enabledCheck';

describe('TelemetryReporter', () => {
  const key = 'foo-bar-123';
  const project = 'force-com-toolbelt';

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (TelemetryReporter as any)['config'];
  });

  it('should send a telemetry event', async () => {
    const options = { project, key };
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackEvent').callsFake(() => {});

    reporter.sendTelemetryEvent('testName');
    expect(sendStub.calledOnce).to.be.true;
  });

  it('should send PDPEvent', async () => {
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');

    const mockO11yService = {
      initialize: sandbox.stub().resolves(),
      logEvent: sandbox.stub(),
      logEventWithSchema: sandbox.stub(),
      forceFlush: sandbox.stub().resolves(),
      enableAutoBatching: sandbox.stub().returns(() => {}),
    };
    sandbox.stub(O11yService, 'getInstance').returns(mockO11yService as unknown as O11yService);

    const sendPdpEventStub = sandbox.stub(O11yReporter.prototype, 'sendPdpEvent').resolves();

    const reporter = await TelemetryReporter.create({
      project: 'salesforce-cli',
      key: 'not-used',
      userId: 'test-user-id-for-pft-testing',
      waitForConnection: true,
      enableO11y: true,
      enableAppInsights: false,
      o11yUploadEndpoint: 'https://794testsite.my.site.com/byolwr/webruntime/log/metrics',
    });

    const pdpEvent: PdpEvent = {
      eventName: 'salesforceCli.executed',
      productFeatureId: 'aJCEE0000000mHP4AY',
      componentId: '@salesforce/plugin-auth.org:web:login',
      contextName: 'orgId::devhubId',
      contextValue: '00Ded000000VsTxEAK::00D460000019MkyEAE',
    };
    reporter.sendPdpEvent(pdpEvent);

    expect(sendPdpEventStub.calledOnce).to.be.true;
    expect(sendPdpEventStub.firstCall.args[0]).to.deep.equal(pdpEvent);
  });

  it('when options include getConnectionFn and enableO11y, O11yReporter is constructed with getConnectionFn in options', async () => {
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');

    const mockO11yService = {
      initialize: sandbox.stub().resolves(),
      logEvent: sandbox.stub(),
      logEventWithSchema: sandbox.stub(),
      forceFlush: sandbox.stub().resolves(),
      enableAutoBatching: sandbox.stub().returns(() => {}),
    };
    sandbox.stub(O11yService, 'getInstance').returns(mockO11yService as unknown as O11yService);

    const getConnectionFn = (async () => ({})) as TelemetryOptions['getConnectionFn'];

    await TelemetryReporter.create({
      project: 'salesforce-cli',
      key: 'not-used',
      waitForConnection: true,
      enableO11y: true,
      enableAppInsights: false,
      o11yUploadEndpoint: 'https://example.com/upload',
      getConnectionFn,
    });

    expect(mockO11yService.initialize.calledOnce).to.be.true;
    expect(mockO11yService.initialize.firstCall.args[2]).to.equal(getConnectionFn);
  });

  it('when options omit getConnectionFn, O11yReporter is still initialized', async () => {
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');

    const mockO11yService = {
      initialize: sandbox.stub().resolves(),
      logEvent: sandbox.stub(),
      logEventWithSchema: sandbox.stub(),
      forceFlush: sandbox.stub().resolves(),
      enableAutoBatching: sandbox.stub().returns(() => {}),
    };
    sandbox.stub(O11yService, 'getInstance').returns(mockO11yService as unknown as O11yService);

    await TelemetryReporter.create({
      project: 'salesforce-cli',
      key: 'not-used',
      waitForConnection: true,
      enableO11y: true,
      enableAppInsights: false,
      o11yUploadEndpoint: 'https://example.com/upload',
    });

    expect(mockO11yService.initialize.calledOnce).to.be.true;
    expect(mockO11yService.initialize.firstCall.args[2]).to.be.undefined;
  });

  it('should send a telemetry exception', async () => {
    const options = { project, key };
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackException').callsFake(() => {});

    reporter.sendTelemetryException(new Error('testException'));
    expect(sendStub.calledOnce).to.be.true;

    // homedir on windows for gha is homedir is C:\Users\runneradmin
    // but exception stack comes from D:\a\telemetry\telemetry\test\unit\telemetryReporter.test.ts:47:37)
    if (os.platform() !== 'win32') {
      expect(sendStub.firstCall.args[0].exception.stack).to.contain(AppInsights.GDPR_HIDDEN);
    }
  });

  it('should send a telemetry trace', async () => {
    const options = { project, key };
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackTrace').callsFake(() => {});

    reporter.sendTelemetryTrace('testTrace');
    expect(sendStub.calledOnce).to.be.true;
  });

  it('should send a telemetry metric', async () => {
    const options = { project, key };
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackMetric').callsFake(() => {});

    reporter.sendTelemetryMetric('testMetric', 0);
    expect(sendStub.calledOnce).to.be.true;
  });

  it('should not send a telemetry event when disabled', async () => {
    sandbox.stub(enabledStubs, 'isEnabled').resolves(false);
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackEvent').callsFake(() => {});

    reporter.sendTelemetryEvent('testName');
    expect(sendStub.calledOnce).to.be.false;
  });

  it('should not send a telemetry exception when disabled', async () => {
    sandbox.stub(enabledStubs, 'isEnabled').resolves(false);
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackException').callsFake(() => {});

    reporter.sendTelemetryException(new Error('testException'));
    expect(sendStub.calledOnce).to.be.false;
  });

  it('should not send a telemetry trace when disabled', async () => {
    sandbox.stub(enabledStubs, 'isEnabled').resolves(false);
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackTrace').callsFake(() => {});

    reporter.sendTelemetryTrace('testTrace');
    expect(sendStub.calledOnce).to.be.false;
  });

  it('should not send a telemetry metric when disabled', async () => {
    sandbox.stub(enabledStubs, 'isEnabled').resolves(false);
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);
    const sendStub = sandbox.stub(reporter.getTelemetryClient(), 'trackMetric').callsFake(() => {});

    reporter.sendTelemetryMetric('testMetric', 0);
    expect(sendStub.calledOnce).to.be.false;
  });

  it('should log to enable telemetry metric when disabled', async () => {
    sandbox.stub(enabledStubs, 'isEnabled').resolves(false);
    const warn = sandbox.stub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    sandbox.stub(Logger, 'child').resolves({ warn, debug: sandbox.stub() } as any);
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);

    reporter.logTelemetryStatus();
    expect(warn.calledOnce).to.be.true;
    expect(warn.firstCall.args[0]).to.contain('=false');
  });

  it('should log to disable telemetry metric when enabled', async () => {
    const warn = sandbox.stub();
    sandbox.stub(ConfigAggregator.prototype, 'getPropertyValue').returns('false');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    sandbox.stub(Logger, 'child').resolves({ warn, debug: sandbox.stub() } as any);
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);

    reporter.logTelemetryStatus();
    expect(warn.calledOnce).to.be.true;
    expect(warn.firstCall.args[0]).to.contain('=true');
  });

  it('should cache config aggregator', async () => {
    const stub = sandbox.stub(ConfigAggregator, 'create');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    stub.resolves({ getPropertyValue: () => false } as any);
    expect(await TelemetryReporter.determineSfdxTelemetryEnabled()).to.be.true;

    stub.reset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    stub.resolves({ getPropertyValue: () => true } as any);
    expect(await TelemetryReporter.determineSfdxTelemetryEnabled()).to.be.true;
  });

  it('should test connection to app insights if waitForConnection is true', async () => {
    const testConnection = sandbox.stub(TelemetryReporter.prototype, 'testConnection').callsFake(async () => true);
    const options = { project, key, waitForConnection: true };
    await TelemetryReporter.create(options);
    expect(testConnection.calledOnce).to.be.true;
  });

  it('should throw an error if it cannot connect to app insights', async () => {
    sandbox.stub(got, 'get').throws(() => ({ code: 'TIMEOUT!' }));
    const options = { project, key, waitForConnection: true };
    try {
      await TelemetryReporter.create(options);
    } catch (err: unknown) {
      const e = err as Error;
      expect(e.message).to.equal('Unable to connect to app insights.');
    }
  });

  it('should get the appInsightsClient', async () => {
    const options = { project, key };
    const reporter = await TelemetryReporter.create(options);
    reporter.start();
    const client = reporter.getTelemetryClient();
    expect(client).to.not.be.undefined;
    reporter.stop();
  });
});
