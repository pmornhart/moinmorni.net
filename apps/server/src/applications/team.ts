import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  NEVER_BY_APPLICATION,
  TEAM_APPLY_LIMITS,
  isTeamPosition,
  mayAssign,
  teamPositionsOf,
  type Role,
  type TeamPosition,
  type Text,
} from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { applicationNotes, applicationVotes, applications } from '../db/schema.js';
import type { Hub } from '../hub/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import type { EventBus } from '../lib/events.js';
import { minecraftNameSchema, type Application } from '../mornicraft/applications.js';
import type { Stores } from '../panel/stores.js';

/**
 * Bewerbungen ins Team: Stellen (Moderator, Builder, Media, Admin) aus dem Einstellungs-Bereich „Team-Bewerbungen“,
 * Regeln (eine offene Bewerbung pro Person, Wartezeit nach einer Absage, verbundenes Discord-Konto), Notizen und
 * Daumen des Teams. Annehmen gibt den Rang wie /rang – mit denselben Regeln: nur wer die Rolle vergeben darf, nie über
 * dem eigenen Rang, VIP und Owner nie. Die Discord-Rolle zieht der Bot nach (Ereignis „player.changed“).
 */

export const TEAM_MODE = 'team';
const AREA = 'team-apply';
const OWNER = 'owner';
const DAY_MS = 86_400_000;
const NOTE_MAX = 1000;
const VOTE_UP = 1;
const VOTE_DOWN = -1;

export type Lang = 'de' | 'en';

export interface PositionView {
  readonly id: TeamPosition;
  readonly open: boolean;
  readonly role: {
    readonly id: string;
    readonly name: Text;
    readonly symbol: string;
    readonly colour: string;
  };
  readonly text: Text;
  readonly questions: { readonly de: readonly string[]; readonly en: readonly string[] };
}

export interface TeamApplyInput {
  readonly position: string;
  /** Antworten in der Reihenfolge der Fragen (in der Sprache `lang`). */
  readonly answers: readonly string[];
  readonly lang: Lang;
  readonly discordId: string;
  readonly discordName: string;
  /** Nur ohne verbundenes Konto (und wenn das erlaubt ist): selbst geschriebener Minecraft-Name. */
  readonly minecraftName?: string | null;
  readonly via: 'website' | 'discord';
}

export type Eligibility =
  | { readonly ok: true; readonly minecraft: { readonly name: string; readonly uuid: string } | null }
  | {
      readonly ok: false;
      readonly code:
        'team_apply_closed' | 'team_apply_pending' | 'team_apply_cooldown' | 'team_apply_link_required';
      /** Wartezeit: ab wann es wieder geht. */
      readonly until?: string;
    };

export interface VoteView {
  readonly up: number;
  readonly down: number;
  /** Meine Stimme: 1, -1 oder 0. */
  readonly mine: number;
  readonly voters: ReadonlyArray<{ readonly name: string; readonly vote: number }>;
}

export interface Decider {
  readonly name: string;
  readonly role: Role;
}

export interface TeamApplicationService {
  /** Alle Stellen, deren Rolle es in der Vorlage gibt (offen oder zu). */
  readonly positions: () => PositionView[];
  readonly position: (id: string) => PositionView | undefined;
  readonly rules: () => {
    readonly onePending: boolean;
    readonly cooldownDays: number;
    readonly linkedRequired: boolean;
  };
  /** Darf diese Discord-Person sich gerade bewerben (für diese Stelle)? */
  readonly eligibility: (discordId: string, position?: string) => Eligibility;
  readonly apply: (input: TeamApplyInput) => Application;
  readonly get: (id: number) => Application | undefined;
  /** Eigene Team-Bewerbungen (neueste zuerst). */
  readonly mine: (discordId: string) => Application[];
  /** Darf jemand mit dieser Rolle die Stelle vergeben (also annehmen oder ablehnen)? */
  readonly mayDecide: (role: Role, position: string) => boolean;
  /**
   * Annehmen oder ablehnen. `dryRun`: nur prüfen (wirft dieselben Fehler), nichts ändern – z. B. bevor ein Team-Konto
   * angelegt wird. `account`: bei der Zusage wurde auch ein Panel-Konto angelegt (steht dann in der Nachricht).
   */
  readonly decide: (
    id: number,
    accept: boolean,
    by: Decider,
    note: string,
    options?: { readonly dryRun?: boolean; readonly account?: boolean },
  ) => Application;
  readonly notes: (id: number) => Array<typeof applicationNotes.$inferSelect>;
  readonly addNote: (id: number, author: string, text: string) => typeof applicationNotes.$inferSelect;
  readonly votes: (id: number, voterId: number) => VoteView;
  readonly vote: (
    id: number,
    voter: { readonly id: number; readonly name: string },
    value: number,
  ) => VoteView;
  /** Zählt für viele Bewerbungen auf einmal (Liste im Panel). */
  readonly voteCounts: (ids: readonly number[], voterId: number) => Map<number, VoteView>;
  readonly noteCounts: (ids: readonly number[]) => Map<number, number>;
}

export interface TeamApplicationDeps {
  readonly db: Db;
  readonly stores: Stores;
  readonly hub: Pick<Hub, 'players' | 'refreshProfile'>;
  readonly events: EventBus;
  readonly now?: () => number;
}

/** Fragen sind die Schlüssel der Antworten; gleiche Fragen bekommen eine Nummer dahinter. */
function answersOf(questions: readonly string[], answers: readonly string[]): Record<string, string> {
  return questions.reduce<Record<string, string>>((acc, q, i) => {
    const key = Object.hasOwn(acc, q) ? `${q} (${i + 1})` : q;
    return { ...acc, [key]: (answers[i] ?? '').trim() };
  }, {});
}

export function createTeamApplications(deps: TeamApplicationDeps): TeamApplicationService {
  const { db, stores, hub, events } = deps;
  const now = deps.now ?? Date.now;
  const settings = (): Record<string, unknown> => stores.settings(AREA);

  /** Die Stellen kommen aus den Rollen des Panels (Reihenfolge der Ränge) – nur Rollen mit einer Stellen-Vorgabe. */
  const positions = (): PositionView[] => {
    const presets = teamPositionsOf(settings());
    return [...stores.roles()]
      .sort((a, b) => a.position - b.position)
      .flatMap((role) => {
        const p = presets.find((x) => x.id === role.id);
        if (!p || role.fallback || NEVER_BY_APPLICATION.includes(role.id)) return [];
        return [
          {
            id: p.id,
            open: p.open,
            role: { id: role.id, name: role.name, symbol: role.symbol, colour: role.colour },
            text: p.text,
            questions: p.questions,
          },
        ];
      });
  };
  const position = (id: string): PositionView | undefined => positions().find((p) => p.id === id);
  const rules = () => {
    const s = settings();
    return {
      onePending: s['onePending'] !== false,
      cooldownDays: Number(s['cooldownDays'] ?? 0),
      linkedRequired: s['linkedRequired'] !== false,
    };
  };

  const get = (id: number): Application | undefined =>
    db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.mode, TEAM_MODE)))
      .get();
  const mine = (discordId: string): Application[] =>
    db
      .select()
      .from(applications)
      .where(and(eq(applications.mode, TEAM_MODE), eq(applications.discordId, discordId)))
      .orderBy(desc(applications.id))
      .all();

  /** Bewerbungen derselben Person: gleiches Discord-Konto oder gleiches Minecraft-Konto. */
  const ofPerson = (discordId: string, uuid: string | null): Application[] =>
    db
      .select()
      .from(applications)
      .where(eq(applications.mode, TEAM_MODE))
      .orderBy(desc(applications.id))
      .all()
      .filter((a) => a.discordId === discordId || (uuid !== null && a.minecraftUuid === uuid));

  const eligibility = (discordId: string, wanted?: string): Eligibility => {
    const r = rules();
    if (wanted !== undefined && !position(wanted)?.open) return { ok: false, code: 'team_apply_closed' };
    const linked = hub.players.byDiscord(discordId) ?? null;
    if (r.linkedRequired && !linked) return { ok: false, code: 'team_apply_link_required' };
    const before = ofPerson(discordId, linked?.uuid ?? null);
    const pending = before.filter((a) => a.status === 'pending');
    if (pending.some((a) => r.onePending || a.position === wanted))
      return { ok: false, code: 'team_apply_pending' };
    const lastNo = before.find((a) => a.status === 'rejected' && a.decidedAt);
    const until = lastNo?.decidedAt ? Date.parse(lastNo.decidedAt) + r.cooldownDays * DAY_MS : 0;
    if (until > now())
      return { ok: false, code: 'team_apply_cooldown', until: new Date(until).toISOString() };
    return { ok: true, minecraft: linked ? { name: linked.name, uuid: linked.uuid } : null };
  };

  const mayDecide = (role: Role, wanted: string): boolean => {
    if (!isTeamPosition(wanted) || NEVER_BY_APPLICATION.includes(wanted)) return false;
    const right = role.id === OWNER || role.game.includes('ranks');
    return right && mayAssign(stores.roles(), role.id, wanted);
  };

  const voteRows = (ids: readonly number[]) =>
    ids.length
      ? db
          .select()
          .from(applicationVotes)
          .where(inArray(applicationVotes.applicationId, [...ids]))
          .all()
      : [];
  const voteView = (rows: ReturnType<typeof voteRows>, voterId: number): VoteView => ({
    up: rows.filter((v) => v.vote === VOTE_UP).length,
    down: rows.filter((v) => v.vote === VOTE_DOWN).length,
    mine: rows.find((v) => v.voterId === voterId)?.vote ?? 0,
    voters: rows.map((v) => ({ name: v.voterName, vote: v.vote })),
  });

  return {
    positions,
    position,
    rules,
    eligibility,
    apply: (input) => {
      const pos = position(input.position);
      if (!pos) throw badRequest('team_position_unknown');
      const ok = eligibility(input.discordId, pos.id);
      if (!ok.ok) throw conflict(ok.code);
      const questions = input.lang === 'en' ? pos.questions.en : pos.questions.de;
      if (input.answers.length !== questions.length) throw badRequest('team_apply_answers');
      const tooLong = input.answers.some((a) => !a.trim() || a.trim().length > TEAM_APPLY_LIMITS.answer);
      if (tooLong) throw badRequest('team_apply_answers');
      // Mit Verbindung zählt das verbundene Konto; ohne (falls erlaubt) der selbst geschriebene Name.
      const typed = ok.minecraft ? null : minecraftNameSchema.safeParse(input.minecraftName ?? '');
      if (typed && !typed.success) throw badRequest('team_apply_minecraft_name');
      const name = ok.minecraft?.name ?? (typed?.success ? typed.data : '');
      const uuid = ok.minecraft?.uuid ?? hub.players.byName(name)?.uuid ?? null;
      const row = db
        .insert(applications)
        .values({
          mode: TEAM_MODE,
          position: pos.id,
          minecraftName: name,
          minecraftUuid: uuid,
          discordId: input.discordId,
          discordName: input.discordName,
          answers: answersOf(questions, input.answers),
          via: input.via,
          lang: input.lang,
        })
        .returning()
        .get();
      events.emit('application.created', { id: row.id });
      return row;
    },
    get,
    mine,
    mayDecide,
    decide: (id, accept, by, note, options = {}) => {
      const app = get(id);
      if (!app) throw notFound('application_unknown');
      if (app.status !== 'pending') throw conflict('application_decided');
      const wanted = app.position ?? '';
      if (!mayDecide(by.role, wanted)) throw forbidden('application_no_right');
      const role = stores.role(wanted);
      const uuid = app.minecraftUuid ?? hub.players.byName(app.minecraftName)?.uuid ?? null;
      if (accept) {
        if (!role) throw badRequest('team_position_unknown');
        if (!uuid) throw conflict('application_player_unknown');
        const current = hub.players.roleOf(uuid);
        // Wie /rang: niemand ändert jemanden mit gleichem oder höherem Rang – außer dem Owner.
        if (by.role.id !== OWNER && current.position <= by.role.position) throw forbidden('player_higher');
        // Schon gleich hoch oder höher: Annehmen wäre eine Herabstufung.
        if (!current.fallback && current.position <= role.position)
          throw conflict('application_rank_not_higher');
        if (options.dryRun) return app;
        hub.players.setRole(uuid, role.id);
        hub.refreshProfile(uuid);
      }
      if (options.dryRun) return app;
      db.update(applications)
        .set({
          status: accept ? 'accepted' : 'rejected',
          decidedBy: by.name,
          decidedAt: new Date(now()).toISOString(),
          note: note.trim() || null,
          minecraftUuid: uuid,
        })
        .where(eq(applications.id, id))
        .run();
      events.emit('application.decided', { id, account: options.account === true });
      return get(id) ?? app;
    },
    notes: (id) =>
      db
        .select()
        .from(applicationNotes)
        .where(eq(applicationNotes.applicationId, id))
        .orderBy(applicationNotes.id)
        .all(),
    addNote: (id, author, text) => {
      const clean = text.trim();
      if (!clean || clean.length > NOTE_MAX) throw badRequest('note_invalid');
      return db.insert(applicationNotes).values({ applicationId: id, author, text: clean }).returning().get();
    },
    votes: (id, voterId) => voteView(voteRows([id]), voterId),
    vote: (id, voter, value) => {
      if (value === 0)
        db.delete(applicationVotes)
          .where(and(eq(applicationVotes.applicationId, id), eq(applicationVotes.voterId, voter.id)))
          .run();
      else
        db.insert(applicationVotes)
          .values({ applicationId: id, voterId: voter.id, voterName: voter.name, vote: Math.sign(value) })
          .onConflictDoUpdate({
            target: [applicationVotes.applicationId, applicationVotes.voterId],
            set: { vote: Math.sign(value), voterName: voter.name, updatedAt: new Date(now()).toISOString() },
          })
          .run();
      return voteView(voteRows([id]), voter.id);
    },
    voteCounts: (ids, voterId) => {
      const rows = voteRows(ids);
      return new Map(
        ids.map((id) => [
          id,
          voteView(
            rows.filter((r) => r.applicationId === id),
            voterId,
          ),
        ]),
      );
    },
    noteCounts: (ids) => {
      const rows = ids.length
        ? db
            .select({ applicationId: applicationNotes.applicationId })
            .from(applicationNotes)
            .where(inArray(applicationNotes.applicationId, [...ids]))
            .all()
        : [];
      return new Map(ids.map((id) => [id, rows.filter((r) => r.applicationId === id).length]));
    },
  };
}
