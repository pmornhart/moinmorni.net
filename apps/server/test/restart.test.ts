/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import type { FastifyBaseLogger } from 'fastify';
import { expect, test } from 'vitest';
import { createRestartQueue } from '../src/network/restart.js';

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;

test('Neustart nach dem Update erst, wenn niemand mehr drauf ist; gestoppte Server fallen raus', async () => {
  const live: Record<string, { state: string; playersOnline: number }> = {
    lobby: { state: 'running', playersOnline: 2 },
    bau: { state: 'running', playersOnline: 0 },
    duels: { state: 'stopped', playersOnline: 0 },
  };
  const restarted: string[] = [];
  const motor = {
    request: async <T>(method: string, path: string): Promise<T> => {
      const id = path.split('/')[3] ?? '';
      if (method === 'POST') restarted.push(id);
      return { live: live[id] } as T;
    },
  };
  const queue = createRestartQueue(motor as never, quiet, 60_000);
  queue.add([
    { serverId: 'lobby', member: 'lobby' },
    { serverId: 'bau', member: 'bau' },
    { serverId: 'duels', member: 'duels' },
  ]);
  await queue.check();
  expect(restarted).toEqual(['bau']);
  expect(queue.pending()).toEqual(['lobby']);
  live['lobby'] = { state: 'running', playersOnline: 0 };
  await queue.check();
  expect(restarted).toEqual(['bau', 'lobby']);
  expect(queue.pending()).toEqual([]);
  queue.stop();
});
