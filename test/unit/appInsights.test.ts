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
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as applicationinsights from 'applicationinsights';
import { AppInsights } from '../../src/appInsights';
import { buildPropertiesAndMeasurements } from '../../src/utils';

describe('AppInsights', () => {
  const key = '00000000-0000-4000-8000-000000000001';
  const project = 'force-com-toolbelt';

  let sandbox: sinon.SinonSandbox;
  let trackStub: sinon.SinonStub;
  let flushStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    applicationinsights.dispose();
    sandbox.restore();
  });

  it('should connect to app insights dashboard', async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    expect(reporter.appInsightsClient).to.not.be.undefined;
    expect(reporter.appInsightsClient.config.connectionString).to.equal(`InstrumentationKey=${key}`);
  });

  it('should build base properties', async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    const actualBaseProps = reporter.appInsightsClient ? reporter.appInsightsClient.commonProperties : {};
    const expectedBaseProps = [
      'common.cpus',
      'common.os',
      'common.platformversion',
      'common.systemmemory',
      'common.usertype',
    ];
    expect(Object.keys(actualBaseProps)).to.deep.equal(expectedBaseProps);
  });

  it('should add common properties', async () => {
    const commonProperties = { foo: 'bar', hello: 'world' };
    const options = { project, key, commonProperties };
    const reporter = await AppInsights.create(options);
    const actualProps = reporter.appInsightsClient ? reporter.appInsightsClient.commonProperties : {};
    expect(actualProps).to.contain(commonProperties);

    const actualPropsCount = Object.keys(actualProps).length;
    const providedPropsCount = Object.keys(commonProperties).length;
    expect(actualPropsCount).to.be.greaterThan(providedPropsCount);
  });

  it('should add context tags', async () => {
    const contextTags = { foo: 'bar', hello: 'world' };
    const options = { project, key, contextTags };
    const reporter = await AppInsights.create(options);
    const actualTags = reporter.appInsightsClient ? reporter.appInsightsClient.context.tags : {};
    expect(actualTags).to.contain(contextTags);

    const actualTagsCount = Object.keys(actualTags).length;
    const providedTagsCount = Object.keys(contextTags).length;
    expect(actualTagsCount).to.be.greaterThan(providedTagsCount);
  });

  it(`should replace GDPR sensitive value with ${AppInsights.GDPR_HIDDEN} for roleInstance by default`, async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    const actualTags = reporter.appInsightsClient ? reporter.appInsightsClient.context.tags : {};

    expect(actualTags['ai.cloud.roleInstance']).to.equal(AppInsights.GDPR_HIDDEN);
  });

  it(`should replace GDPR sensitive value with ${AppInsights.GDPR_HIDDEN} for provided keys`, async () => {
    const options = { project, key, gdprSensitiveKeys: ['hello'] };
    const reporter = await AppInsights.create(options);
    const actualTags = reporter.appInsightsClient ? reporter.appInsightsClient.context.tags : {};
    expect(actualTags['hello']).to.equal(AppInsights.GDPR_HIDDEN);
  });

  it('should setup app insights client with ai.user.id and ai.session.id tag from options', async () => {
    const options = { project, key, userId: 'test-user-id', sessionId: 'test-session-id' };
    const reporter = await AppInsights.create(options);
    const actualTags = reporter?.appInsightsClient?.context?.tags;
    expect(actualTags?.['ai.user.id']).to.equal('test-user-id');
    expect(actualTags?.['ai.session.id']).to.equal('test-session-id');
  });

  it('should change url when using Asimov key', async () => {
    const options = { project, key: 'AIF-12345' };
    const reporter = await AppInsights.create(options);
    const url = reporter.appInsightsClient ? reporter.appInsightsClient.config.endpointUrl : {};
    expect(url).to.equal('https://vortex.data.microsoft.com/collect/v1');
  });

  it('should separate string attributes from numeric attributes', () => {
    const attributes = { foo: 'xyz123', baz: 5, key: true };
    const { properties, measurements } = buildPropertiesAndMeasurements(attributes);

    // Check that string and boolean values go to properties
    expect(properties.foo).to.be.a('string');
    expect(properties.key).to.equal('true');

    // Check that numeric values go to measurements
    expect(measurements.baz).to.equal(5);

    // Verify the structure is correct (without checking exact string values due to home dir sanitization)
    expect(Object.keys(properties)).to.include('foo');
    expect(Object.keys(properties)).to.include('key');
    expect(Object.keys(measurements)).to.include('baz');
  });

  it('should send telemetry event', async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    if (reporter.appInsightsClient) {
      trackStub = sandbox.stub(reporter.appInsightsClient, 'trackEvent').callsFake(() => {});
      flushStub = sandbox.stub(reporter.appInsightsClient, 'flush').resolves();
    }
    reporter.sendTelemetryEvent('testEvent');
    expect(trackStub.calledOnce).to.be.true;
    expect(flushStub.calledOnce).to.be.false;
  });

  it('should await flush before shutdown', async () => {
    const reporter = await AppInsights.create({ project, key });
    const order: string[] = [];
    sandbox.stub(reporter.appInsightsClient, 'flush').callsFake(async () => {
      await Promise.resolve();
      order.push('flush');
    });
    sandbox.stub(reporter.appInsightsClient, 'shutdown').callsFake(async () => {
      order.push('shutdown');
    });
    await reporter.stopAsync();
    expect(order).to.deep.equal(['flush', 'shutdown']);
  });

  it('should shut down even when flush fails', async () => {
    const reporter = await AppInsights.create({ project, key });
    const failure = new Error('flush failed');
    sandbox.stub(reporter.appInsightsClient, 'flush').rejects(failure);
    const shutdown = sandbox.stub(reporter.appInsightsClient, 'shutdown').resolves();
    let caught: unknown;
    try {
      await reporter.stopAsync();
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
    expect(shutdown.calledOnce).to.be.true;
  });

  it('should accept a connection string without rewriting it', async () => {
    const connectionString = `InstrumentationKey=${key};IngestionEndpoint=https://example.com/`;
    const reporter = await AppInsights.create({ project, key: connectionString });
    expect(reporter.appInsightsClient.config.connectionString).to.equal(connectionString);
  });

  it('should send telemetry exception', async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    if (reporter.appInsightsClient) {
      trackStub = sandbox.stub(reporter.appInsightsClient, 'trackException').callsFake(() => {});
      flushStub = sandbox.stub(reporter.appInsightsClient, 'flush').resolves();
    }
    reporter.sendTelemetryException(new Error('testException'));
    expect(trackStub.calledOnce).to.be.true;
    expect(flushStub.calledOnce).to.be.false;
  });

  it('should send telemetry trace', async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    if (reporter.appInsightsClient) {
      trackStub = sandbox.stub(reporter.appInsightsClient, 'trackTrace').callsFake(() => {});
      flushStub = sandbox.stub(reporter.appInsightsClient, 'flush').resolves();
    }
    reporter.sendTelemetryTrace('testTrace');
    expect(trackStub.calledOnce).to.be.true;
    expect(flushStub.calledOnce).to.be.false;
  });

  it('should send telemetry metric', async () => {
    const options = { project, key };
    const reporter = await AppInsights.create(options);
    if (reporter.appInsightsClient) {
      trackStub = sandbox.stub(reporter.appInsightsClient, 'trackMetric').callsFake(() => {});
      flushStub = sandbox.stub(reporter.appInsightsClient, 'flush').resolves();
    }
    reporter.sendTelemetryMetric('testMetric', 0);
    expect(trackStub.calledOnce).to.be.true;
    expect(flushStub.calledOnce).to.be.false;
  });
});
