# sfdx-telemetry

This package serves an interface for [Microsoft's Application Insights npm module](https://www.npmjs.com/package/applicationinsights) and supports O11y (Observability) telemetry.

## Install

`yarn add @salesforce/telemetry --save`

## Usage

### For long running process

```javascript
import TelemetryReporter from '@salesforce/telemetry';

const reporter = await TelemetryReporter.create({ project: 'my-project-name', key: 'my-instrumentation-key' });
reporter.start();

// Now you can send events and the reporter will batch and send.
reporter.sendTelemetryEvent('event-name', { foo: 'bar', executionTime: 0.5912 });
```

By default, some common properties are hidden for GDPR. This is to protect client side tools that send telemetry. If the owner of the long running process controls the machines too, you can redefine the GDPR sensitive fields.

```javascript
const reporter = await TelemetryReporter.create({
  project: 'my-project-name',
  key: 'my-instrumentation-key',
  gdprSensitiveKeys: [],
});
```

### For short lived processes

```javascript
import TelemetryReporter from '@salesforce/telemetry';

const reporter = await TelemetryReporter.create({ project: 'my-project-name', key: 'my-instrumentation-key' });

// Send events.
reporter.sendTelemetryEvent('event-name', { foo: 'bar', executionTime: 0.5912 });

// When all finished sending events, stop the reporter or the process may hang.
reporter.stop();
```

**Note:** For short lived processes, the telemetry can take 0-3 seconds to send all events to the server on stop, and even longer if there is a timeout. It is recommended to send telemetry in a detached spawned process. i.e. `spawn(..., { stdio: 'ignore'}).unref();`

### O11y (Observability) Telemetry

The telemetry reporter also supports O11y telemetry alongside Application Insights. To enable O11y telemetry, provide the `enableO11y` and `o11yUploadEndpoint` options:

```javascript
const reporter = await TelemetryReporter.create({
  project: 'my-project-name',
  key: 'my-instrumentation-key', // Required for Application Insights
  enableO11y: true,
  o11yUploadEndpoint: 'https://your-o11y-endpoint.com/upload',
  extensionName: 'my-extension' // Optional, defaults to project name
});
```

#### O11y-Only Mode

For O11y-only telemetry (without Application Insights), you can disable AppInsights explicitly:

```javascript
const reporter = await TelemetryReporter.create({
  project: 'my-project-name',
  enableO11y: true,
  enableAppInsights: false, // Disable AppInsights
  o11yUploadEndpoint: 'https://your-o11y-endpoint.com/upload',
  extensionName: 'my-extension' // Optional, defaults to project name
});
```

**Note:** O11y telemetry respects the same telemetry enablement settings as Application Insights. If telemetry is disabled via `SF_DISABLE_TELEMETRY` or other configuration, O11y events will not be sent.

#### Custom Schema Support

The telemetry reporter supports consumer-provided O11y schemas. This allows consumers to use custom schemas from the `o11y_schema` package instead of the default `sf_a4dInstrumentation` schema.

**Step 1: Add `o11y_schema` to your `package.json`:**

```json
{
  "dependencies": {
    "o11y_schema": "^256.154.0"
  }
}
```

**Step 2: Import and pass the schema to the telemetry reporter:**

```javascript
import TelemetryReporter from '@salesforce/telemetry';
// Import the schema object from o11y_schema
import { a4dInstrumentationSchema } from 'o11y_schema/sf_a4dInstrumentation';

const reporter = await TelemetryReporter.create({
  project: 'my-project-name',
  enableO11y: true,
  o11yUploadEndpoint: 'https://your-o11y-endpoint.com/upload',
  o11ySchema: a4dInstrumentationSchema, // Pass the schema object
  extensionName: 'my-extension'
});

reporter.start();
reporter.sendTelemetryEvent('event-name', { foo: 'bar' });
```

**Note:** When `o11ySchema` is provided, the reporter will use `logEventWithSchema()` to log events with your custom schema. If `o11ySchema` is not provided, it falls back to the default `sf_a4dInstrumentation` schema.

**Note:** The `o11y_schema` package doesn't provide TypeScript declarations. If your TypeScript configuration doesn't include `skipLibCheck: true`, you may need to add type declarations or use `@ts-expect-error` comments. However, with proper TypeScript configuration, the import should work without additional annotations.

## Env Variables

`SF_DISABLE_TELEMETRY`: Set to `true` if you want to disable telemetry.
