import { createApp, DEMO_USER } from './app.js';
import { loadConfig } from './config.js';

try {
  process.loadEnvFile(); // loads ./.env when present (Node >= 20.12)
} catch {
  // no .env file: rely on the real environment
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`\nConfiguration error: ${err.message}\n`);
  process.exit(1);
}

const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`\nArkose travel demo server listening on http://localhost:${config.port}`);
  console.log(`  Arkose mode : ${config.arkose.mode}${config.arkose.mode === 'mock' ? '  (no Arkose account needed; tokens are mock.<scenario>.<nonce>)' : `  (verify: ${config.arkose.verifyUrl})`}`);
  console.log(`  Demo debug  : ${config.demoDebug ? 'ON (raw Verify responses are returned to the app)' : 'off'}`);
  if (config.arkose.mode === 'mock') console.log(`  Demo login  : ${DEMO_USER.email} / ${DEMO_USER.password}   step-up code: ${config.stepUpCode}`);
  if (config.authSecretIsEphemeral) console.log('  Note        : AUTH_SECRET not set, using a random secret (sessions reset on restart)');
  console.log('');
});
