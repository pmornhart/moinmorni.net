import crypto from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { friendRequests, friends } from '../db/schema.js';
import type { Actor, Command } from './commands.js';
import type { HubContext } from './context.js';
import { hasRight } from './context.js';
import { dateText, mm, text } from './texts.js';

/**
 * Freunde und Party – im ganzen Netzwerk. Freundschaften bleiben (Datenbank), Partys gibt es nur, solange jemand
 * online ist. Die Party folgt dem Leiter, wenn er den Server wechselt (abschaltbar im Panel).
 */

const MINUTE_MS = 60_000;
const INVITE_MINUTES = 5;
const ADD = new Set(['add', 'hinzufügen', 'hinzufuegen', 'anfragen']);
const ACCEPT = new Set(['annehmen', 'accept', 'ja']);
const DENY = new Set(['ablehnen', 'deny', 'nein']);
const REMOVE = new Set(['entfernen', 'remove', 'weg']);
const INVITE = new Set(['einladen', 'invite']);
const LEAVE = new Set(['verlassen', 'leave']);
const KICK = new Set(['kick', 'rauswerfen']);
const LEADER = new Set(['leiter', 'leader']);
const DISBAND = new Set(['auflösen', 'aufloesen', 'disband']);
const FRIEND_WORDS = ['add', 'annehmen', 'ablehnen', 'entfernen', 'liste'];
const PARTY_WORDS = ['einladen', 'annehmen', 'verlassen', 'kick', 'leiter', 'auflösen', 'liste'];

interface Party {
  /** Gleiche Sprachgruppe auf allen Servern. */
  readonly id: string;
  leader: string;
  readonly members: Set<string>;
  /** Eingeladen → bis wann (ms). */
  readonly invites: Map<string, number>;
}

export interface Social {
  readonly commands: Command[];
  /** Partys als Sprachgruppen (für die Sprachchat-Brücke). */
  readonly voiceGroups: () => Array<{ id: string; name: string; members: string[] }>;
  readonly joined: (uuid: string) => void;
  readonly left: (uuid: string) => void;
  readonly switched: (uuid: string, server: string) => void;
  /** Party eines Spielers (für Spielmodi: zusammen in eine Runde) – null ohne Party. */
  readonly partyOf: (uuid: string) => { leader: string; members: string[] } | null;
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export function createSocial(
  ctx: HubContext,
  db: Db,
  now: () => number,
  onParty: () => void = () => undefined,
): Social {
  const social = (): Record<string, unknown> => ctx.stores.settings('social');
  const say = (uuid: string, line: string): void => ctx.msg(uuid, line);
  const langOf = (uuid: string): 'de' | 'en' => ctx.presence.get(uuid)?.lang ?? 'de';
  const nameOf = (uuid: string): string => ctx.presence.get(uuid)?.name ?? ctx.players.get(uuid)?.name ?? '?';
  const known = (name: string | undefined): { uuid: string; name: string } | null => {
    if (!name) return null;
    const p = ctx.presence.byName(name) ?? ctx.players.byName(name);
    return p ? { uuid: p.uuid, name: p.name } : null;
  };

  // ---------- Freunde ----------

  const friendsOf = (uuid: string): string[] =>
    db
      .select()
      .from(friends)
      .where(or(eq(friends.a, uuid), eq(friends.b, uuid)))
      .all()
      .map((f) => (f.a === uuid ? f.b : f.a));
  const areFriends = (x: string, y: string): boolean => {
    const [a, b] = pair(x, y);
    return Boolean(
      db
        .select()
        .from(friends)
        .where(and(eq(friends.a, a), eq(friends.b, b)))
        .get(),
    );
  };
  const request = (from: string, to: string) =>
    db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.from, from), eq(friendRequests.to, to)))
      .get();
  const dropRequest = (from: string, to: string): void => {
    db.delete(friendRequests)
      .where(and(eq(friendRequests.from, from), eq(friendRequests.to, to)))
      .run();
  };
  const befriend = (x: string, y: string): void => {
    const [a, b] = pair(x, y);
    db.insert(friends).values({ a, b }).onConflictDoNothing().run();
    dropRequest(x, y);
    dropRequest(y, x);
  };
  const full = (uuid: string): boolean => friendsOf(uuid).length >= Number(social()['maxFriends']);

  const friendList = (actor: Actor): void => {
    const list = friendsOf(actor.uuid);
    const incoming = db.select().from(friendRequests).where(eq(friendRequests.to, actor.uuid)).all();
    if (!list.length && !incoming.length) {
      say(actor.uuid, text(actor.lang, 'friend.none'));
      return;
    }
    const online = list.filter((f) => ctx.presence.get(f));
    say(actor.uuid, text(actor.lang, 'friend.head', { online: online.length, total: list.length }));
    [...list]
      .sort((x, y) => Number(Boolean(ctx.presence.get(y))) - Number(Boolean(ctx.presence.get(x))))
      .forEach((f) => {
        const p = ctx.presence.get(f);
        const row = ctx.players.get(f);
        say(
          actor.uuid,
          p
            ? text(actor.lang, 'friend.line_online', { name: mm(p.name), server: mm(p.server ?? '…') })
            : text(actor.lang, 'friend.line_offline', {
                name: mm(row?.name ?? '?'),
                date: row ? dateText(actor.lang, row.lastSeen, ctx.timeZone) : '?',
              }),
        );
      });
    if (incoming.length)
      say(
        actor.uuid,
        text(actor.lang, 'friend.requests', { names: mm(incoming.map((r) => nameOf(r.from)).join(', ')) }),
      );
  };

  const addFriend = (actor: Actor, name: string | undefined): void => {
    const t = known(name);
    if (!t) {
      say(actor.uuid, text(actor.lang, 'cmd.unknown_player', { name: mm(name ?? '') }));
      return;
    }
    if (t.uuid === actor.uuid) {
      say(actor.uuid, text(actor.lang, 'cmd.self'));
      return;
    }
    if (areFriends(actor.uuid, t.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.already'));
      return;
    }
    if (full(actor.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.full', { max: Number(social()['maxFriends']) }));
      return;
    }
    // Hat die andere Seite schon gefragt, ist es ein Ja.
    if (request(t.uuid, actor.uuid)) {
      acceptFriend(actor, t.name);
      return;
    }
    if (request(actor.uuid, t.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.pending', { name: mm(t.name) }));
      return;
    }
    db.insert(friendRequests).values({ from: actor.uuid, to: t.uuid }).run();
    say(actor.uuid, text(actor.lang, 'friend.request_sent', { name: mm(t.name) }));
    if (ctx.presence.get(t.uuid))
      say(t.uuid, text(langOf(t.uuid), 'friend.request_got', { name: mm(actor.name) }));
  };

  function acceptFriend(actor: Actor, name: string | undefined): void {
    const t = known(name);
    if (!t || !request(t.uuid, actor.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.no_request', { name: mm(name ?? '') }));
      return;
    }
    if (full(actor.uuid) || full(t.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.full', { max: Number(social()['maxFriends']) }));
      return;
    }
    befriend(actor.uuid, t.uuid);
    say(actor.uuid, text(actor.lang, 'friend.now', { name: mm(t.name) }));
    if (ctx.presence.get(t.uuid)) say(t.uuid, text(langOf(t.uuid), 'friend.now', { name: mm(actor.name) }));
  }

  const denyFriend = (actor: Actor, name: string | undefined): void => {
    const t = known(name);
    if (!t || !request(t.uuid, actor.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.no_request', { name: mm(name ?? '') }));
      return;
    }
    dropRequest(t.uuid, actor.uuid);
    say(actor.uuid, text(actor.lang, 'friend.denied', { name: mm(t.name) }));
  };

  const removeFriend = (actor: Actor, name: string | undefined): void => {
    const t = known(name);
    if (!t || !areFriends(actor.uuid, t.uuid)) {
      say(actor.uuid, text(actor.lang, 'friend.not_friends', { name: mm(name ?? '') }));
      return;
    }
    const [a, b] = pair(actor.uuid, t.uuid);
    db.delete(friends)
      .where(and(eq(friends.a, a), eq(friends.b, b)))
      .run();
    say(actor.uuid, text(actor.lang, 'friend.removed', { name: mm(t.name) }));
  };

  // ---------- Party ----------

  const parties = new Set<Party>();
  const partyOf = (uuid: string): Party | undefined => [...parties].find((p) => p.members.has(uuid));
  const maxSize = (leader: string): number =>
    Number(social()[hasRight(ctx.players.roleOf(leader), 'bigger-party') ? 'partySizeVip' : 'partySize']);
  const tell = (party: Party, build: (lang: 'de' | 'en') => string): void =>
    [...party.members].filter((m) => ctx.presence.get(m)).forEach((m) => say(m, build(langOf(m))));
  const leave = (party: Party, uuid: string, key: 'party.left' | 'party.kicked'): void => {
    const name = nameOf(uuid);
    tell(party, (lang) => text(lang, key, { name: mm(name) }));
    party.members.delete(uuid);
    onParty();
    if (party.members.size < 2) {
      tell(party, (lang) => text(lang, 'party.disbanded'));
      parties.delete(party);
      onParty();
      return;
    }
    if (party.leader === uuid) {
      const next = [...party.members][0] ?? '';
      party.leader = next;
      tell(party, (lang) => text(lang, 'party.leader', { name: mm(nameOf(next)) }));
    }
  };

  const invite = (actor: Actor, name: string | undefined): void => {
    const t = ctx.presence.byName(name ?? '');
    if (!t) {
      say(actor.uuid, text(actor.lang, 'cmd.offline', { name: mm(name ?? '') }));
      return;
    }
    if (t.uuid === actor.uuid) {
      say(actor.uuid, text(actor.lang, 'cmd.self'));
      return;
    }
    const mine = partyOf(actor.uuid);
    if (mine && mine.leader !== actor.uuid) {
      say(actor.uuid, text(actor.lang, 'party.not_leader'));
      return;
    }
    if (partyOf(t.uuid)) {
      say(actor.uuid, text(actor.lang, 'party.in_other', { name: mm(t.name) }));
      return;
    }
    const party: Party = mine ?? {
      id: crypto.randomUUID(),
      leader: actor.uuid,
      members: new Set([actor.uuid]),
      invites: new Map<string, number>(),
    };
    if (party.members.size >= maxSize(party.leader)) {
      say(actor.uuid, text(actor.lang, 'party.full', { max: maxSize(party.leader) }));
      return;
    }
    parties.add(party);
    party.invites.set(t.uuid, now() + INVITE_MINUTES * MINUTE_MS);
    say(actor.uuid, text(actor.lang, 'party.invited', { name: mm(t.name) }));
    say(t.uuid, text(t.lang, 'party.invite_got', { name: mm(actor.name) }));
  };

  const accept = (actor: Actor, name: string | undefined): void => {
    const host = ctx.presence.byName(name ?? '');
    const party = host ? partyOf(host.uuid) : undefined;
    const until = party?.invites.get(actor.uuid) ?? 0;
    if (!party || until < now()) {
      say(actor.uuid, text(actor.lang, 'party.no_invite', { name: mm(name ?? '') }));
      return;
    }
    const old = partyOf(actor.uuid);
    if (old) leave(old, actor.uuid, 'party.left');
    if (party.members.size >= maxSize(party.leader)) {
      say(actor.uuid, text(actor.lang, 'party.full', { max: maxSize(party.leader) }));
      return;
    }
    party.invites.delete(actor.uuid);
    party.members.add(actor.uuid);
    tell(party, (lang) => text(lang, 'party.joined', { name: mm(actor.name) }));
    onParty();
  };

  const partyList = (actor: Actor, party: Party): void => {
    say(
      actor.uuid,
      text(actor.lang, 'party.head', { count: party.members.size, max: maxSize(party.leader) }),
    );
    [...party.members].forEach((m) => {
      const p = ctx.presence.get(m);
      say(
        actor.uuid,
        text(actor.lang, 'party.line', {
          lead: m === party.leader ? text(actor.lang, 'party.lead_mark') : '',
          name: mm(nameOf(m)),
          where: p ? mm(p.server ?? '') : text(actor.lang, 'party.offline'),
        }),
      );
    });
  };

  const leaderOnly = (actor: Actor, party: Party | undefined): party is Party => {
    if (!party) say(actor.uuid, text(actor.lang, 'party.none'));
    else if (party.leader !== actor.uuid) say(actor.uuid, text(actor.lang, 'party.not_leader'));
    return Boolean(party && party.leader === actor.uuid);
  };

  const words = (list: readonly string[], args: readonly string[]): string[] =>
    args.length <= 1 ? list.filter((w) => w.startsWith(args[0] ?? '')) : [];
  const onlineNames = (prefix: string): string[] =>
    ctx.presence
      .all()
      .map((p) => p.name)
      .filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));

  const commands: Command[] = [
    {
      name: 'freunde',
      aliases: ['friends', 'f', 'freund'],
      usage: {
        de: '/freunde [add|annehmen|ablehnen|entfernen] <name>',
        en: '/friends [add|accept|deny|remove] <name>',
      },
      run: (actor, args) => {
        const word = args[0]?.toLowerCase() ?? '';
        if (ADD.has(word)) addFriend(actor, args[1]);
        else if (ACCEPT.has(word)) acceptFriend(actor, args[1]);
        else if (DENY.has(word)) denyFriend(actor, args[1]);
        else if (REMOVE.has(word)) removeFriend(actor, args[1]);
        else if (word && !['liste', 'list'].includes(word)) addFriend(actor, args[0]);
        else friendList(actor);
      },
      complete: (actor, args) => {
        if (args.length <= 1) return [...words(FRIEND_WORDS, args), ...onlineNames(args[0] ?? '')];
        const word = args[0]?.toLowerCase() ?? '';
        const prefix = args[1] ?? '';
        if (ACCEPT.has(word) || DENY.has(word))
          return db
            .select()
            .from(friendRequests)
            .where(eq(friendRequests.to, actor.uuid))
            .all()
            .map((r) => nameOf(r.from))
            .filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
        if (REMOVE.has(word))
          return friendsOf(actor.uuid)
            .map(nameOf)
            .filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
        return onlineNames(prefix);
      },
    },
    {
      name: 'party',
      aliases: ['p'],
      usage: {
        de: '/party [einladen|annehmen|verlassen|kick|leiter|auflösen] <name>',
        en: '/party [invite|accept|leave|kick|leader|disband] <name>',
      },
      run: (actor, args) => {
        const word = args[0]?.toLowerCase() ?? '';
        const party = partyOf(actor.uuid);
        if (INVITE.has(word)) invite(actor, args[1]);
        else if (ACCEPT.has(word)) accept(actor, args[1]);
        else if (LEAVE.has(word)) {
          if (party) leave(party, actor.uuid, 'party.left');
          else say(actor.uuid, text(actor.lang, 'party.none'));
        } else if (KICK.has(word)) {
          const t = known(args[1]);
          if (leaderOnly(actor, party) && t && party.members.has(t.uuid) && t.uuid !== actor.uuid)
            leave(party, t.uuid, 'party.kicked');
        } else if (LEADER.has(word)) {
          const t = known(args[1]);
          if (leaderOnly(actor, party) && t && party.members.has(t.uuid)) {
            party.leader = t.uuid;
            tell(party, (lang) => text(lang, 'party.leader', { name: mm(t.name) }));
          }
        } else if (DISBAND.has(word)) {
          if (leaderOnly(actor, party)) {
            tell(party, (lang) => text(lang, 'party.disbanded'));
            parties.delete(party);
            onParty();
          }
        } else if (word && !['liste', 'list'].includes(word)) invite(actor, args[0]);
        else if (party) partyList(actor, party);
        else say(actor.uuid, text(actor.lang, 'party.none'));
      },
      complete: (actor, args) => {
        if (args.length <= 1) return [...words(PARTY_WORDS, args), ...onlineNames(args[0] ?? '')];
        const party = partyOf(actor.uuid);
        const prefix = (args[1] ?? '').toLowerCase();
        const members = party ? [...party.members].map(nameOf) : [];
        const word = args[0]?.toLowerCase() ?? '';
        const pool = KICK.has(word) || LEADER.has(word) ? members : onlineNames('');
        return pool.filter((n) => n.toLowerCase().startsWith(prefix));
      },
    },
    {
      name: 'pc',
      aliases: ['partychat'],
      usage: { de: '/pc <nachricht>', en: '/pc <message>' },
      run: (actor, args) => {
        const party = partyOf(actor.uuid);
        const message = args.join(' ').trim();
        if (!party) {
          say(actor.uuid, text(actor.lang, 'party.none'));
          return;
        }
        if (!message) return;
        const mute = ctx.punish.active(actor.uuid, 'mute');
        if (mute) {
          say(actor.uuid, text(actor.lang, 'msg.muted', { until: '', reason: mm(mute.reason) }));
          return;
        }
        tell(party, (lang) => text(lang, 'party.chat', { name: mm(actor.name), text: mm(message) }));
      },
    },
  ];

  return {
    commands,
    partyOf: (uuid) => {
      const party = partyOf(uuid);
      return party ? { leader: party.leader, members: [...party.members] } : null;
    },
    voiceGroups: () =>
      [...parties]
        .filter((p) => p.members.size > 1)
        .map((p) => ({ id: p.id, name: `Party ${nameOf(p.leader)}`.slice(0, 24), members: [...p.members] })),
    joined: (uuid) => {
      const name = nameOf(uuid);
      friendsOf(uuid)
        .filter((f) => ctx.presence.get(f))
        .forEach((f) => say(f, text(langOf(f), 'friend.joined', { name: mm(name) })));
      const waiting = db.select().from(friendRequests).where(eq(friendRequests.to, uuid)).all();
      waiting.forEach((r) =>
        say(uuid, text(langOf(uuid), 'friend.request_got', { name: mm(nameOf(r.from)) })),
      );
    },
    left: (uuid) => {
      const name = nameOf(uuid);
      friendsOf(uuid)
        .filter((f) => f !== uuid && ctx.presence.get(f))
        .forEach((f) => say(f, text(langOf(f), 'friend.left', { name: mm(name) })));
      const party = partyOf(uuid);
      if (party) leave(party, uuid, 'party.left');
    },
    switched: (uuid, server) => {
      const party = partyOf(uuid);
      if (!party || party.leader !== uuid || social()['partyFollow'] !== true) return;
      [...party.members]
        .filter((m) => m !== uuid && ctx.presence.get(m)?.server && ctx.presence.get(m)?.server !== server)
        .forEach((m) => {
          if (ctx.connect(m, server)) say(m, text(langOf(m), 'party.follow', { server: mm(server) }));
        });
    },
  };
}
