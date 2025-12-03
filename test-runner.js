// Simple test runner to verify our implementation works
const { spawnWithInspector } = require('./src/lib/process-spawner.ts');
const { InspectorClient } = require('./src/lib/inspector-client.ts');
const path = require('path');

async function runTest() {
  console.log('Testing Inspector Client...');

  try {
    const testScript = path.join(__dirname, 'test-fixtures/simple-script.js');
    console.log('Spawning process with inspector...');

    const { process: proc, wsUrl } = await spawnWithInspector('node', [
      testScript,
    ]);
    console.log('✓ Process spawned with inspector URL:', wsUrl);

    const client = new InspectorClient(wsUrl);
    console.log('Connecting to inspector...');

    await client.connect();
    console.log('✓ Connected to inspector');

    console.log('Enabling debugger...');
    await client.send('Debugger.enable');
    console.log('✓ Debugger enabled');

    console.log('Enabling runtime...');
    await client.send('Runtime.enable');
    console.log('✓ Runtime enabled');

    console.log('Disconnecting...');
    await client.disconnect();
    console.log('✓ Disconnected');

    proc.kill();
    console.log('✓ Process killed');

    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
