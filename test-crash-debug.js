// Debug script to test crash detection
const { DebugSession } = require('./src/lib/debug-session');
const path = require('path');

async function test() {
  const testScript = path.join(__dirname, 'test-fixtures/crash-test.js');

  const session = new DebugSession('test-id', {
    command: 'node',
    args: [testScript],
  });

  let crashDetected = false;

  session.onCrash((error) => {
    console.log('CRASH DETECTED:', error.message);
    crashDetected = true;
  });

  try {
    await session.start();
    console.log('Session started, state:', session.getState());

    await session.resume();
    console.log('Session resumed, state:', session.getState());

    // Wait for crash
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('After wait:');
    console.log('- Crash detected:', crashDetected);
    console.log('- Has crashed:', session.hasCrashed());
    console.log('- Is active:', session.isActive());
    console.log('- State:', session.getState());

    const process = session.getProcess();
    if (process) {
      console.log('- Process killed:', process.killed);
      console.log('- Process exit code:', process.exitCode);
    }
  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

test();
