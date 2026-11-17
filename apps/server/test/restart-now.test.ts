import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_MODES } from '@moinmorni/shared';
import type { Lang } from '../src/hub/texts.js';
import type { MotorClient } from '../src/motor/client.js';
import {
  createRestartNow,
  firstStartAfterUpdate,
  planRestarts,
  type RestartHub,
  type Target,
} from '../src/network/restart-now.js';

const quiet = { warn: () => undefined, info: () => undefined } as unknown as FastifyBaseLogger;
const COUNTDOWN_SECONDS = 30;
const REMINDER_SECONDS = 10;
const SECOND_MS = 1000;
const MOVE_SETTLE_MS = 3000;
/** So oft meldet der Motor nach einem Neustart „starting“, bevor er wieder läuft. */
const STARTING_POLLS = 2;
/** Die ersten beiden Pausen: bis zum Hinweis, dann bis zum Ende des Countdowns. */
const COUNTDOWN_PAUSES = 2;

const duels: Target = { serverId: 'id-duels', member: 'duels' };
const party: Target = { serverId: 'id-party', member: 'morni-party' };
const bau: Target = { serverId: 'id-bau', member: 'bau' };
const lobby: Target = { serverId: 'id-lobby', member: 'lobby' };
const proxy: Target = { serverId: 'id-proxy', member: 'proxy' };
const wartung: Target = { serverId: 'id-wartung', member: 'wartung' };
const sleeping: Target = { serverId: 'id-adler', member: 'adlerflug' };
const waitingInQueue: Target = { serverId: 'id-wolken', member: 'wolkenkampf' };

interface Player {
  readonly uuid: string;
  readonly lang: Lang;
  server: string;
}

/** Motor zum Mitschreiben: jeder Server läuft, nach „restart“ zweimal „starting“, dann wieder „running“. */
function fakeMotor(
  stopped: readonly string[] = [],
  log: string[] = [],
): { log: string[] } & Pick<MotorClient, 'request'> {
  const polls = new Map<string, number>();
  const request = async (method: string, url: string): Promise<unknown> => {
    const id = url.split('/')[3] ?? '';
    if (method === 'POST') {
      log.push(`restart ${id}`);
      polls.set(id, STARTING_POLLS);
      return {};
    }
    if (stopped.includes(id)) return { live: { state: 'stopped' } };
    const left = polls.get(id) ?? 0;
    if (left > 0) {
      polls.set(id, left - 1);
      return { live: { state: 'starting' } };
    }
    if (polls.has(id)) {
      polls.delete(id);
      log.push(`running ${id}`);
    }
    return { live: { state: 'running' } };
  };
  return { log, request: request as MotorClient['request'] };
}

/** Wartungs-Lobby im Test: aus – oder da, mit festgehaltenen Spielern (Wartung). */
function fakeHub(
  players: Player[],
  log: string[],
  wartungLobby: { readonly open: boolean; readonly parked?: readonly string[] } = { open: false },
): RestartHub {
  return {
    playersOn: (member) => players.filter((p) => p.server === member),
    everyone: () => players,
    tell: (uuid, text) => log.push(`tell ${uuid} ${text}`),
    countdown: (uuid, text, seconds) => log.push(`bar ${uuid} ${seconds} ${text}`),
    connect: (uuid, server) => {
      const p = players.find((x) => x.uuid === uuid);
      if (p) p.server = server;
      log.push(`connect ${uuid} ${server}`);
      return true;
    },
    kick: (uuid, text) => log.push(`kick ${uuid} ${text}`),
    wartung: {
      open: () => wartungLobby.open,
      park: (uuid) => {
        const p = players.find((x) => x.uuid === uuid);
        if (!wartungLobby.open || !p) return false;
        p.server = 'wartung';
        log.push(`park ${uuid}`);
        return true;
      },
      parked: (uuid) => wartungLobby.parked?.includes(uuid) ?? false,
    },
  };
}

describe('Gleich neu starten (nach einem Update)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-restart-now-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('Was gleich und was später neu startet', () => {
    const restart = [duels, party, lobby, proxy];
    expect(
      planRestarts({ fresh: true, afterUpdate: true, modesNow: false, restart, modesInstalled: [] }),
    ).toEqual({
      now: restart,
      why: 'update',
      later: [],
    });
    // Schalter aus: wie bisher, sobald niemand drauf ist.
    expect(
      planRestarts({ fresh: true, afterUpdate: false, modesNow: false, restart, modesInstalled: [] }).now,
    ).toEqual([]);
    // Zwischen Updates: nur neue Fassungen von Spielmodi gleich – und nur mit Schalter.
    expect(
      planRestarts({ fresh: false, afterUpdate: true, modesNow: true, restart, modesInstalled: ['duels'] }),
    ).toEqual({ now: [duels], why: 'release', later: [party, lobby, proxy] });
    expect(
      planRestarts({ fresh: false, afterUpdate: true, modesNow: false, restart, modesInstalled: ['duels'] })
        .now,
    ).toEqual([]);
  });

  test('Erster Start nach einem Update – frische Installation zählt nicht', () => {
    // Frisch installiert: kein Merker, kein Update-Status.
    expect(firstStartAfterUpdate(dir, 'v0.1.0-0-gaaaaaaa')).toBe(false);
    expect(firstStartAfterUpdate(dir, 'v0.1.0-0-gaaaaaaa')).toBe(false);
    expect(firstStartAfterUpdate(dir, 'v0.1.1-0-gbbbbbbb')).toBe(true);
    expect(firstStartAfterUpdate(dir, 'v0.1.1-0-gbbbbbbb')).toBe(false);
    // Das Update, das diese Funktion bringt: noch kein Merker, aber update.sh aktualisiert gerade auf diese Fassung.
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-restart-now-'));
    fs.mkdirSync(path.join(other, 'update'));
    fs.writeFileSync(
      path.join(other, 'update/status.json'),
      '{"state":"running","step":"restart","at":"2026-11-16T21:00:00+01:00","from":"v0.1.0-0-gaaaaaaa","to":"v0.1.1-0-gbbbbbbb"}',
    );
    expect(firstStartAfterUpdate(other, 'v0.1.1-0-gbbbbbbb')).toBe(true);
    fs.rmSync(other, { recursive: true, force: true });
  });

  test('Countdown, Spieler in die Lobby, Modi nacheinander, Lobby und Proxy zuletzt – zusammen', async () => {
    const log: string[] = [];
    const motor = fakeMotor([sleeping.serverId], log);
    const players: Player[] = [
      { uuid: 'anna', lang: 'de', server: 'duels' },
      { uuid: 'bob', lang: 'en', server: 'morni-party' },
      { uuid: 'carl', lang: 'de', server: 'lobby' },
    ];
    const removed: string[] = [];
    const pauses: number[] = [];
    const restartNow = createRestartNow({
      motor,
      hub: fakeHub(players, log),
      queue: { entries: () => [waitingInQueue], remove: (id) => removed.push(id) },
      modes: () => [
        ...DEFAULT_MODES,
        {
          ...DEFAULT_MODES[0]!,
          id: 'party-test',
          server: 'morni-party',
          name: { de: 'Morni Party', en: 'Morni Party' },
        },
      ],
      countdown: () => COUNTDOWN_SECONDS,
      log: quiet,
      pause: async (ms) => {
        pauses.push(ms);
        log.push(`pause ${ms}`);
      },
    });
    await restartNow.run([duels, party, bau, lobby, proxy, sleeping], 'update');

    // Countdown für die Spieler in den Modi, je in ihrer Sprache, mit Leiste.
    expect(log).toContain(
      `bar anna ${COUNTDOWN_SECONDS} <gold>Update eingespielt</gold> <gray>–</gray> <white>Duels</white> <gray>startet in</gray> <yellow>{s} s</yellow> <gray>neu</gray>`,
    );
    expect(log.find((l) => l.startsWith('tell bob'))).toContain('restarts in <yellow>30 seconds</yellow>');
    expect(log.find((l) => l.startsWith('tell bob'))).toContain('Morni Party');
    // Erst 20 s, dann der Hinweis „noch 10 Sekunden“, dann 10 s.
    expect(pauses.slice(0, COUNTDOWN_PAUSES)).toEqual([
      (COUNTDOWN_SECONDS - REMINDER_SECONDS) * SECOND_MS,
      REMINDER_SECONDS * SECOND_MS,
    ]);
    // Vor dem ersten Neustart sind alle aus den Modi in der Lobby.
    const firstRestart = log.indexOf('restart id-duels');
    expect(log.indexOf('connect anna lobby')).toBeLessThan(firstRestart);
    expect(log.indexOf('connect bob lobby')).toBeLessThan(firstRestart);
    expect(log.indexOf(`pause ${MOVE_SETTLE_MS}`)).toBeLessThan(firstRestart);
    // Nacheinander: der nächste erst, wenn der vorige wieder läuft. Der schlafende Modus wird nicht geweckt; was in der
    // Warteschlange stand (z. B. neue Einstellungen), kommt nach einem Update gleich mit.
    const order = motor.log.filter((l) => l.startsWith('restart'));
    expect(order).toEqual([
      'restart id-duels',
      'restart id-party',
      'restart id-bau',
      'restart id-wolken',
      'restart id-lobby',
      'restart id-proxy',
    ]);
    expect(motor.log.indexOf('running id-duels')).toBeLessThan(motor.log.indexOf('restart id-party'));
    expect(motor.log.indexOf('running id-wolken')).toBeLessThan(motor.log.indexOf('restart id-lobby'));
    // Lobby und Proxy zusammen: ein Countdown für alle, dann ein freundlicher Rauswurf mit „gleich wieder da“.
    const network = log.filter((l) => l.startsWith('tell') && l.includes('das Netzwerk startet'));
    expect(network.map((l) => l.split(' ')[1])).toEqual(['anna', 'carl']);
    expect(log.filter((l) => l.startsWith('kick')).map((l) => l.split(' ')[1])).toEqual([
      'anna',
      'bob',
      'carl',
    ]);
    expect(log.find((l) => l.startsWith('kick bob'))).toContain('you can join again in about a minute');
    expect(removed).toEqual(
      expect.arrayContaining(['id-duels', 'id-party', 'id-bau', 'id-wolken', 'id-lobby', 'id-proxy']),
    );
    expect(removed).not.toContain(sleeping.serverId);
    expect(restartNow.busy()).toBe(false);
  });

  test('Neue Fassung eines Modus: nur dieser, eigener Text; nur die Lobby: Hinweis und Rauswurf nur dort', async () => {
    const log: string[] = [];
    const motor = fakeMotor();
    const players: Player[] = [
      { uuid: 'anna', lang: 'de', server: 'duels' },
      { uuid: 'carl', lang: 'en', server: 'lobby' },
    ];
    const restartNow = createRestartNow({
      motor,
      hub: fakeHub(players, log),
      queue: { entries: () => [waitingInQueue], remove: () => undefined },
      modes: () => DEFAULT_MODES,
      countdown: () => COUNTDOWN_SECONDS,
      log: quiet,
      pause: async () => undefined,
    });
    await restartNow.run([duels], 'release');
    expect(log.find((l) => l.startsWith('tell anna'))).toContain('Neue Fassung von Duels');
    // Keine Neustarts aus der Warteschlange: das gibt es nur nach einem Update.
    expect(motor.log.filter((l) => l.startsWith('restart'))).toEqual(['restart id-duels']);

    log.length = 0;
    await restartNow.run([lobby], 'update');
    expect(log.find((l) => l.startsWith('tell carl'))).toContain('the lobby restarts in');
    // Anna ist seit dem Neustart von Duels in der Lobby – auch sie bekommt den Hinweis.
    expect(log.filter((l) => l.startsWith('kick')).map((l) => l.split(' ')[1])).toEqual(['anna', 'carl']);
    expect(log.find((l) => l.startsWith('kick carl'))).toContain('The lobby is restarting');
  });

  test('Wartungs-Lobby nie als Erste: nach den Modi, vor der Lobby – und nimmt deren Spieler auf', async () => {
    const log: string[] = [];
    const motor = fakeMotor([], log);
    const players: Player[] = [
      { uuid: 'anna', lang: 'de', server: 'duels' },
      { uuid: 'carl', lang: 'de', server: 'lobby' },
      { uuid: 'dora', lang: 'en', server: 'wartung' },
      { uuid: 'eva', lang: 'de', server: 'wartung' },
    ];
    const restartNow = createRestartNow({
      motor,
      hub: fakeHub(players, log, { open: true, parked: ['eva'] }),
      queue: { entries: () => [], remove: () => undefined },
      modes: () => DEFAULT_MODES,
      countdown: () => COUNTDOWN_SECONDS,
      log: quiet,
      pause: async () => undefined,
    });
    // Auch wenn die Wartungs-Lobby vorne in der Liste steht.
    await restartNow.run([wartung, lobby, duels], 'update');
    expect(motor.log.filter((l) => l.startsWith('restart'))).toEqual([
      'restart id-duels',
      'restart id-wartung',
      'restart id-lobby',
    ]);
    // Sie läuft wieder, bevor die Lobby neu startet.
    expect(motor.log.indexOf('running id-wartung')).toBeLessThan(motor.log.indexOf('restart id-lobby'));
    // Vor ihrem Neustart: wer darf, in die Lobby; wen die Wartung festhält, der muss kurz raus.
    const restartWartung = log.indexOf('restart id-wartung');
    expect(log.find((l) => l.startsWith('tell dora'))).toContain('maintenance lobby');
    expect(log.indexOf('connect dora lobby')).toBeLessThan(restartWartung);
    expect(log.find((l) => l.startsWith('tell eva'))).toContain('In etwa einer Minute kannst du wieder rein');
    expect(
      log.findIndex((l) => l.startsWith('kick eva') && l.includes('Wartungs-Lobby startet neu')),
    ).toBeLessThan(restartWartung);
    // Die Lobby startet allein neu: ihre Spieler warten in der Wartungs-Lobby statt rauszufliegen.
    const restartLobby = log.indexOf('restart id-lobby');
    expect(log.filter((l) => l.startsWith('tell carl')).join('\n')).toContain(
      'So lange wartest du in der Wartungs-Lobby',
    );
    expect(log.indexOf('park carl')).toBeLessThan(restartLobby);
    expect(log.indexOf('park anna')).toBeLessThan(restartLobby);
    expect(log.some((l) => l.startsWith('kick carl') || l.startsWith('kick anna'))).toBe(false);
    expect(players.find((p) => p.uuid === 'carl')?.server).toBe('wartung');
  });

  test('Neues Netzwerk-Plugin: Wartungs-Lobby startet mit Lobby und Proxy zusammen – zuletzt', async () => {
    const log: string[] = [];
    const motor = fakeMotor([], log);
    const players: Player[] = [{ uuid: 'dora', lang: 'de', server: 'wartung' }];
    const restartNow = createRestartNow({
      motor,
      hub: fakeHub(players, log, { open: true }),
      queue: { entries: () => [], remove: () => undefined },
      modes: () => DEFAULT_MODES,
      countdown: () => COUNTDOWN_SECONDS,
      log: quiet,
      pause: async () => undefined,
    });
    await restartNow.run([wartung, proxy, lobby, duels], 'update');
    expect(motor.log.filter((l) => l.startsWith('restart'))).toEqual([
      'restart id-duels',
      'restart id-lobby',
      'restart id-proxy',
      'restart id-wartung',
    ]);
    // Ein Countdown fürs ganze Netzwerk, einmal neu verbinden – kein eigener Umzug aus der Wartungs-Lobby.
    expect(log.find((l) => l.startsWith('tell dora'))).toContain('das Netzwerk startet');
    expect(log.filter((l) => l.startsWith('kick dora'))).toHaveLength(1);
    expect(log.some((l) => l.startsWith('connect dora') || l.startsWith('park dora'))).toBe(false);
  });

  test('Wer während des Wartens wieder in einen Modus geht, kommt vor dessen Neustart noch einmal in die Lobby', async () => {
    const log: string[] = [];
    const motor = fakeMotor([], log);
    const players: Player[] = [{ uuid: 'anna', lang: 'de', server: 'duels' }];
    const hub = fakeHub(players, log);
    const restartNow = createRestartNow({
      motor,
      hub,
      queue: { entries: () => [], remove: () => undefined },
      modes: () => DEFAULT_MODES,
      countdown: () => COUNTDOWN_SECONDS,
      log: quiet,
      pause: async () => {
        // Anna geht zurück in Morni Party, sobald Duels neu startet.
        if (log.includes('restart id-duels') && !log.includes('back')) {
          log.push('back');
          const anna = players[0];
          if (anna) anna.server = 'morni-party';
        }
      },
    });
    await restartNow.run([duels, party], 'update');
    const restartParty = log.indexOf('restart id-party');
    const movedAgain = log.lastIndexOf('connect anna lobby');
    expect(log.indexOf('back')).toBeLessThan(movedAgain);
    expect(movedAgain).toBeLessThan(restartParty);
    expect(players[0]?.server).toBe('lobby');
  });

  test('Niemand online: kein Warten, trotzdem nacheinander; was während einer Runde dazukommt, folgt danach', async () => {
    const motor = fakeMotor();
    const pauses: number[] = [];
    const restartNow = createRestartNow({
      motor,
      hub: fakeHub([], []),
      queue: { entries: () => [], remove: () => undefined },
      modes: () => DEFAULT_MODES,
      countdown: () => COUNTDOWN_SECONDS,
      log: quiet,
      pause: async (ms) => {
        pauses.push(ms);
      },
    });
    const first = restartNow.run([duels], 'release');
    const second = restartNow.run([party], 'release');
    await Promise.all([first, second]);
    expect(motor.log.filter((l) => l.startsWith('restart'))).toEqual([
      'restart id-duels',
      'restart id-party',
    ]);
    expect(pauses.every((ms) => ms < COUNTDOWN_SECONDS * SECOND_MS)).toBe(true);
  });
});
