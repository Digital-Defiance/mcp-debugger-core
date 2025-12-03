const { HangDetector } = require('./dist/lib/hang-detector');
const { SessionManager } = require('./dist/lib/session-manager');
const path = require('path');

async function test() {
  const sessionManager = new SessionManager();
  const hangDetector = new HangDetector(sessionManager);

  console.log('Testing normal completion...');
  const normalScript = path.join(
    __dirname,
    'test-fixtures/normal-completion.js',
  );

  try {
    const result = await hangDetector.detectHang({
      command: 'node',
      args: [normalScript],
      timeout: 5000,
    });

    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sessionManager.cleanupAll();
  }
}

test();
