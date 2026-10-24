const { spawn } = require('child_process');
const path = require('path');

console.log('Testing Electron application boot & initialization...');

const electronExe = path.join(__dirname, '../../node_modules/electron/dist/electron.exe');
const appRoot = path.join(__dirname, '../../');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.ELECTRON_ENABLE_LOGGING = '1';
env.NODE_ENV = 'production';

const child = spawn(electronExe, ['.'], {
  cwd: appRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (d) => {
  stdout += d.toString();
});

child.stderr.on('data', (d) => {
  stderr += d.toString();
});

const timer = setTimeout(() => {
  console.log('App stayed running successfully for 4 seconds without crashing. Terminating test process...');
  child.kill();
  process.exit(0);
}, 4000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (signal === 'SIGTERM') {
    console.log('Electron boot test PASSED: Process started and ran stably.');
    process.exit(0);
  } else {
    console.log(`Process exited with code ${code}. Stderr: ${stderr}, Stdout: ${stdout}`);
    if (code === 0) {
      console.log('Electron boot test PASSED with clean exit.');
      process.exit(0);
    } else {
      console.error('Electron boot failed unexpectedly.');
      process.exit(code || 1);
    }
  }
});

