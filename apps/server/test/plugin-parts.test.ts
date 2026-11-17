import { describe, expect, test } from 'vitest';
import { zipOf } from '@moinmorni/builder';
import { proxyFingerprint } from '../src/network/plugin-parts.js';

/** Eine Jar wie das Netzwerk-Plugin: Velocity-, gemeinsame und Paper-Teile. */
const jar = (parts: Readonly<Record<string, string>>): Buffer =>
  zipOf(Object.entries(parts).map(([name, text]) => ({ name, data: Buffer.from(text) })));

const BASE = {
  'velocity-plugin.json': '{"id":"moinmorni"}',
  'plugin.yml': 'name: MoinMorni',
  'META-INF/maven/de.moinmorni/moinmorni-network/pom.properties': 'version=1',
  'de/moinmorni/network/velocity/VelocityPlugin.class': 'velocity-1',
  'de/moinmorni/network/common/HubClient.class': 'common-1',
  'de/moinmorni/network/paper/LobbyNpcs.class': 'paper-1',
  'de/moinmorni/api/MoinMorni.class': 'api-1',
};

describe('Fingerabdruck der Velocity-Teile des Netzwerk-Plugins', () => {
  test('Nur Paper-Teile neu → gleicher Fingerabdruck (der Proxy muss nicht neu starten)', () => {
    const before = proxyFingerprint(jar(BASE));
    expect(before).toMatch(/^[0-9a-f]{64}$/);
    expect(
      proxyFingerprint(
        jar({
          ...BASE,
          'de/moinmorni/network/paper/LobbyNpcs.class': 'paper-2',
          'de/moinmorni/network/paper/LobbyMusic.class': 'neu',
          'de/moinmorni/api/MoinMorni.class': 'api-2',
          'plugin.yml': 'name: MoinMorni\nversion: 2',
          'META-INF/maven/de.moinmorni/moinmorni-network/pom.properties': 'version=2',
        }),
      ),
    ).toBe(before);
  });

  test('Velocity- oder gemeinsame Teile neu → anderer Fingerabdruck', () => {
    const before = proxyFingerprint(jar(BASE));
    expect(
      proxyFingerprint(jar({ ...BASE, 'de/moinmorni/network/velocity/VelocityPlugin.class': 'velocity-2' })),
    ).not.toBe(before);
    expect(
      proxyFingerprint(jar({ ...BASE, 'de/moinmorni/network/common/HubClient.class': 'common-2' })),
    ).not.toBe(before);
    expect(proxyFingerprint(jar({ ...BASE, 'de/moinmorni/network/velocity/Neu.class': 'x' }))).not.toBe(
      before,
    );
  });

  test('Keine ZIP-Datei → unbekannt (dann lieber neu starten)', () => {
    expect(proxyFingerprint(Buffer.from('plugin-v1'))).toBeNull();
    expect(proxyFingerprint(Buffer.alloc(0))).toBeNull();
  });
});
