import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig(process.env, here);
const built = await buildApp({ config });

const stop = async (): Promise<void> => {
  await built.close();
  process.exit(0);
};
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

await built.app.listen({ host: config.host, port: config.port });
built.app.log.info({ motor: config.motorUrl, domain: config.domain }, 'MoinMorni läuft');
