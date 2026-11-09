import { fileURLToPath } from 'node:url';
import { ConsoleLogger } from '@nestjs/common';
import { createApp } from './app.factory.js';
import { type Env, loadEnvFile, parseEnv } from './common/env.js';

loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); // repo-root .env (dist/ or src/ → apps/api → root)

let env: Env;
try {
  env = parseEnv(process.env);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const app = await createApp({ logger: new ConsoleLogger({ json: true }) }, env.TRUST_PROXY);
await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
