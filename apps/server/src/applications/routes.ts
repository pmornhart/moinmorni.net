import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { TEAM_APPLY_LIMITS, TEAM_POSITIONS } from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { applications } from '../db/schema.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';
import {
  APPLY_MODE,
  decideSchema,
  type Application,
  type ApplicationService,
} from '../mornicraft/applications.js';
import type { PanelAuth, PanelUser } from '../panel/auth.js';
import type { TeamAccess } from '../panel/team-routes.js';
import type { ApplyLoginKit } from './login.js';
import { TEAM_MODE, type TeamApplicationService } from './team.js';

/**
 * Bewerbungen im Panel (Seite „Bewerbungen“): Team und MorniCraft zusammen, mit Filter nach Stelle und Stand,
 * Antworten, internen Notizen und Daumen des Teams. Entscheiden: MorniCraft wie bisher (Whitelist), Team mit den
 * Regeln von /rang – auf Wunsch gleich mit Team-Konto fürs Panel (Startpasswort, Pflicht-Wechsel).
 * Dazu die Webseite „Team → Bewerben“ (Anmeldung mit Discord wie bei MorniCraft).
 */

const NOTE_MAX = 1000;
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const EMAIL_MAX = 254;
const NAME_MAX = 17;
const MINE_MAX = 5;
const KINDS = ['all', 'team', 'mornicraft'] as const;
// Benutzername wie im Motor: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich – z. B. "lena.mod".
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-zA-Z0-9._-%5D%2B%24&testString=lena.mod
const USERNAME = /^[a-zA-Z0-9._-]+$/;
// Zeichen, die in einem Benutzernamen des Motors nicht gehen: "Lena Baut!" → "LenaBaut".
// https://regex101.com/?flavor=javascript&regex=%5B%5Ea-zA-Z0-9._-%5D&flags=g&testString=Lena%20Baut!
const NOT_USERNAME = /[^a-zA-Z0-9._-]/g;

const listQuery = z.object({
  kind: z.enum(KINDS).default('all'),
  status: z.enum(['pending', 'accepted', 'rejected']).optional(),
  position: z.enum([...TEAM_POSITIONS, 'mornicraft']).optional(),
});
const idParams = z.object({ id: z.coerce.number().int().positive() });
const teamDecideSchema = decideSchema.extend({
  account: z
    .object({
      username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME),
      email: z.string().trim().email().max(EMAIL_MAX).optional(),
    })
    .optional(),
});
const noteBody = z.object({ text: z.string().trim().min(1).max(NOTE_MAX) });
const voteBody = z.object({ vote: z.union([z.literal(1), z.literal(0), z.literal(-1)]) });
const teamApplyBody = z.object({
  position: z.enum(TEAM_POSITIONS),
  answers: z.array(z.string().max(TEAM_APPLY_LIMITS.answer)).max(TEAM_APPLY_LIMITS.questions),
  lang: z.enum(['de', 'en']).default('de'),
  minecraftName: z.string().trim().max(NAME_MAX).optional(),
});

export interface ApplicationRouteDeps {
  readonly db: Db;
  readonly auth: PanelAuth;
  readonly mornicraft: ApplicationService;
  readonly team: TeamApplicationService;
  readonly teamAccess: () => TeamAccess;
  readonly login: ApplyLoginKit;
  readonly hub: { readonly players: { readonly byDiscord: (id: string) => { name: string } | undefined } };
  /** „Mit Discord anmelden“ möglich (Bot + Client-Secret)? */
  readonly discordLogin: () => Promise<boolean>;
}

export function registerApplicationRoutes(app: Api, deps: ApplicationRouteDeps): void {
  const { db, team, mornicraft } = deps;

  const kindOf = (a: Application): 'team' | 'mornicraft' => (a.mode === TEAM_MODE ? 'team' : 'mornicraft');
  /** Darf diese Person die Bewerbung entscheiden? Team: wer die Rolle vergeben darf; MorniCraft: Bereich „Spieler“. */
  const canDecide = (user: PanelUser, a: Application): boolean =>
    a.status === 'pending' && (kindOf(a) === 'team' ? team.mayDecide(user.role, a.position ?? '') : true);
  const row = (id: number): Application => {
    const a = db.select().from(applications).where(eq(applications.id, id)).get();
    if (!a || (a.mode !== TEAM_MODE && a.mode !== APPLY_MODE)) throw notFound('application_unknown');
    return a;
  };
  const summary = (
    a: Application,
    user: PanelUser,
    votes: ReturnType<TeamApplicationService['votes']>,
    notes: number,
  ) => ({
    id: a.id,
    kind: kindOf(a),
    position: a.position,
    status: a.status,
    minecraftName: a.minecraftName,
    minecraftUuid: a.minecraftUuid,
    discordName: a.discordName,
    via: a.via,
    lang: a.lang,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt,
    decidedBy: a.decidedBy,
    note: a.note,
    votes: { up: votes.up, down: votes.down, mine: votes.mine },
    notes,
    canDecide: canDecide(user, a),
  });

  app.get('/api/panel/applications/all', { schema: { querystring: listQuery } }, async (request) => {
    const user = await deps.auth.require(request, 'players');
    const { kind, status, position } = request.query;
    const rows = db
      .select()
      .from(applications)
      .orderBy(desc(applications.id))
      .all()
      .filter((a) => a.mode === TEAM_MODE || a.mode === APPLY_MODE)
      .filter((a) => kind === 'all' || kindOf(a) === kind)
      .filter((a) => !status || a.status === status)
      .filter(
        (a) => !position || (position === APPLY_MODE ? a.mode === APPLY_MODE : a.position === position),
      );
    const ids = rows.map((a) => a.id);
    const votes = team.voteCounts(ids, user.motorUserId);
    const notes = team.noteCounts(ids);
    const counts = db
      .select({ status: applications.status, mode: applications.mode })
      .from(applications)
      .all()
      .filter((a) => a.status === 'pending');
    return {
      applications: rows.map((a) =>
        summary(a, user, votes.get(a.id) ?? team.votes(a.id, user.motorUserId), notes.get(a.id) ?? 0),
      ),
      pending: {
        team: counts.filter((c) => c.mode === TEAM_MODE).length,
        mornicraft: counts.filter((c) => c.mode === APPLY_MODE).length,
      },
      positions: team.positions(),
    };
  });

  app.get('/api/panel/applications/:id', { schema: { params: idParams } }, async (request) => {
    const user = await deps.auth.require(request, 'players');
    const a = row(request.params.id);
    const votes = team.votes(a.id, user.motorUserId);
    const notes = team.notes(a.id);
    const access = deps.teamAccess();
    const accountPossible =
      kindOf(a) === 'team' && canDecide(user, a) && access.mayCreate(user, a.position ?? '');
    return {
      ...summary(a, user, votes, notes.length),
      answers: a.answers,
      discordId: a.discordId,
      voters: votes.voters,
      notesList: notes,
      accountPossible,
      suggestedUsername: a.minecraftName.replace(NOT_USERNAME, '').toLowerCase().slice(0, USERNAME_MAX),
    };
  });

  app.post(
    '/api/panel/applications/:id/notes',
    { schema: { params: idParams, body: noteBody } },
    async (request) => {
      const user = await deps.auth.require(request, 'players');
      const a = row(request.params.id);
      return team.addNote(a.id, user.username, request.body.text);
    },
  );

  app.put(
    '/api/panel/applications/:id/vote',
    { schema: { params: idParams, body: voteBody } },
    async (request) => {
      const user = await deps.auth.require(request, 'players');
      const a = row(request.params.id);
      return team.vote(a.id, { id: user.motorUserId, name: user.username }, request.body.vote);
    },
  );

  app.post(
    '/api/panel/applications/:id/decide',
    { schema: { params: idParams, body: teamDecideSchema } },
    async (request) => {
      const user = await deps.auth.require(request, 'players');
      const a = row(request.params.id);
      const { accept, note, account } = request.body;
      if (kindOf(a) === APPLY_MODE) {
        const decided = mornicraft.decide(a.id, accept, user.username, note);
        return { ...decided, application: decided, account: null };
      }
      const by = { name: user.username, role: user.role };
      const wantsAccount = accept && account !== undefined;
      // Erst alles prüfen, dann das Konto anlegen, dann entscheiden – so bleibt kein halbes Ergebnis zurück.
      team.decide(a.id, accept, by, note, { dryRun: true });
      if (wantsAccount && !deps.teamAccess().mayCreate(user, a.position ?? ''))
        throw forbidden('team_account_no_right');
      const created = wantsAccount
        ? await deps.teamAccess().create(user, {
            username: account.username,
            email: account.email,
            roleId: a.position ?? '',
            locale: a.lang === 'en' ? 'en' : 'de',
          })
        : null;
      const decided = team.decide(a.id, accept, by, note, { account: created !== null });
      return { ...decided, application: decided, account: created };
    },
  );

  // ---------- Webseite: Team → Bewerben ----------
  const publicPosition = (p: ReturnType<TeamApplicationService['positions']>[number]) => ({
    id: p.id,
    role: p.role,
    text: p.text,
    questions: p.questions,
  });

  app.get('/api/public/team-apply', async (request) => {
    const login = deps.login.open(request.headers.cookie);
    const linked = login ? deps.hub.players.byDiscord(login.id) : undefined;
    const check = login ? team.eligibility(login.id) : null;
    const rules = team.rules();
    return {
      positions: team
        .positions()
        .filter((p) => p.open)
        .map(publicPosition),
      discordLogin: await deps.discordLogin(),
      rules: {
        cooldownDays: rules.cooldownDays,
        linkedRequired: rules.linkedRequired,
        onePending: rules.onePending,
      },
      me: login ? { name: login.name, minecraft: linked ? { name: linked.name } : null } : null,
      blocked: check && !check.ok ? { code: check.code, until: check.until ?? null } : null,
      applications: login
        ? team
            .mine(login.id)
            .slice(0, MINE_MAX)
            .map((a) => ({
              id: a.id,
              position: a.position,
              status: a.status,
              minecraftName: a.minecraftName,
              createdAt: a.createdAt,
              decidedAt: a.decidedAt,
              note: a.status === 'pending' ? null : a.note,
            }))
        : [],
    };
  });

  app.post('/api/public/team-apply', { schema: { body: teamApplyBody } }, async (request) => {
    const login = deps.login.open(request.headers.cookie);
    if (!login) throw unauthorized('apply_login_required');
    const a = team.apply({
      position: request.body.position,
      answers: request.body.answers,
      lang: request.body.lang,
      discordId: login.id,
      discordName: login.name,
      minecraftName: request.body.minecraftName ?? null,
      via: 'website',
    });
    return {
      id: a.id,
      position: a.position,
      status: a.status,
      minecraftName: a.minecraftName,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
      note: null,
    };
  });
}
