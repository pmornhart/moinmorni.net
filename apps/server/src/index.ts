import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = (() => {
  try {
    return loadConfig(process.env, here);
  } catch (err) {
    // Fehlt etwas in der .env, steht hier was – statt eines langen Stacktraces.
    const missing =
      err instanceof ZodError ? err.issues.map((i) => i.path.join('.')).join(', ') : String(err);
    process.stderr.write(`MoinMorni kann nicht starten – in der .env fehlt oder stimmt nicht: ${missing}\n`);
    process.stderr.write('Tipp: install.sh legt alles an (auch den Schlüssel für den Motor).\n');
    return process.exit(1);
  }
})();
const built = await buildApp({ config });

const stop = async (): Promise<void> => {
  await built.close();
  process.exit(0);
};
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

await built.app.listen({ host: config.host, port: config.port });
built.app.log.info({ motor: config.motorUrl, domain: config.domain }, 'MoinMorni läuft');
built
  .start()
  .catch((err: unknown) => built.app.log.error({ err }, 'Motor nicht erreichbar – Einrichtung wartet'));
