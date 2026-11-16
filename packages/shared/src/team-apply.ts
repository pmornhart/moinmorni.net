/* eslint-disable ts-patterns/no-magic-numbers -- a settings catalog: defaults and limits */
import type { SettingArea, SettingDef, SettingSection, Text } from './settings.js';

/**
 * Bewerbungen ins Team („Stellen“): wer ins Team möchte, bewirbt sich auf der Webseite (Team → Bewerben) oder im
 * Discord mit /bewerben. Welche Stellen es gibt, kommt aus den Rollen des Panels: jede Rolle der Vorlage, für die es
 * hier eine Stellen-Vorgabe gibt (Text, Fragen), in der Reihenfolge der Ränge – fehlt die Rolle in der Vorlage, gibt es
 * die Stelle nicht. Offen/zu, Text und Fragen stellt man im Einstellungs-Bereich „Team-Bewerbungen“ ein. Owner und VIP
 * gibt es nie über eine Bewerbung; die Admin-Stelle öffnet nur der Owner. Entscheiden darf, wer die Rolle vergeben darf.
 */

/** Rollen-IDs mit einer Stellen-Vorgabe (Supporter kommt mit der Rolle „Supporter“ der Vorlage). */
export const TEAM_POSITIONS = ['moderator', 'supporter', 'builder', 'media', 'admin'] as const;
export type TeamPosition = (typeof TEAM_POSITIONS)[number];

/** Diese Ränge gibt es nie über eine Bewerbung (Philip, 14.11.: VIP vergibt nur er, nie ein Shop). */
export const NEVER_BY_APPLICATION: readonly string[] = ['owner', 'vip'];

export const isTeamPosition = (value: unknown): value is TeamPosition =>
  TEAM_POSITIONS.some((p) => p === value);

/** Grenzen fürs Formular (Webseite und Discord). */
export const TEAM_APPLY_LIMITS = {
  /** Fragen je Stelle und Sprache (Discord zeigt höchstens 5 pro Fenster – mehr kommen in Schritten). */
  questions: 10,
  /** Länge einer Frage (Discord: Platzhalter höchstens 100 Zeichen). */
  question: 100,
  /** Länge einer Antwort. */
  answer: 1000,
  /** Beschreibung einer Stelle. */
  text: 600,
} as const;

const t = (de: string, en: string): Text => ({ de, en });

const AGE = t('Wie alt bist du?', 'How old are you?');
const SINCE = t('Seit wann spielst du Minecraft?', 'Since when have you been playing Minecraft?');
const TEAM = t(
  'Warst du schon in einem Team? Erzähl kurz davon.',
  'Have you been part of a team before? Tell us briefly.',
);
const TIME = t('Wie viel Zeit hast du pro Woche für uns?', 'How much time per week do you have for us?');
const WHY = t('Warum gerade du?', 'Why you?');

interface PositionDefaults {
  readonly id: TeamPosition;
  readonly title: Text;
  readonly open: boolean;
  readonly text: Text;
  readonly questions: readonly Text[];
}

/** Gute Vorgaben je Stelle – im Panel änderbar. */
export const TEAM_POSITION_DEFAULTS: readonly PositionDefaults[] = [
  {
    id: 'moderator',
    title: t('Stelle: Moderator', 'Position: Moderator'),
    open: true,
    text: t(
      'Du sorgst dafür, dass sich alle wohlfühlen: Fragen beantworten, Streit schlichten und auf die Regeln achten – im Spiel und im Discord.',
      'You make sure everyone feels at home: answer questions, settle arguments and look after the rules – in game and on Discord.',
    ),
    questions: [AGE, SINCE, TEAM, TIME, WHY],
  },
  {
    id: 'supporter',
    title: t('Stelle: Supporter', 'Position: Supporter'),
    open: true,
    text: t(
      'Du hilfst Spielern weiter: Fragen beantworten, Tickets im Discord, bei Streit freundlich dazwischengehen – die beste Stelle für den Einstieg ins Team.',
      'You help players along: answer questions, handle tickets on Discord, step in kindly when there is trouble – the best position to start in the team.',
    ),
    questions: [
      AGE,
      SINCE,
      TEAM,
      TIME,
      t(
        'Ein neuer Spieler findet sich nicht zurecht – wie hilfst du ihm?',
        'A new player is lost – how do you help them?',
      ),
      WHY,
    ],
  },
  {
    id: 'builder',
    title: t('Stelle: Builder', 'Position: Builder'),
    open: true,
    text: t(
      'Du baust mit an der Lobby, an Karten und Kulissen der Spielmodi – auf unserem Bau-Server mit WorldEdit.',
      'You help build the lobby, maps and scenery for the game modes – on our build server with WorldEdit.',
    ),
    questions: [
      AGE,
      SINCE,
      TEAM,
      TIME,
      t(
        'Zeig uns deine Bauten: Links oder Bilder (z. B. Imgur, YouTube).',
        'Show us your builds: links or pictures (e.g. Imgur, YouTube).',
      ),
      WHY,
    ],
  },
  {
    id: 'media',
    title: t('Stelle: Media', 'Position: Media'),
    open: true,
    text: t(
      'Du zeigst MoinMorni in Videos, Streams oder Clips – mit eigenem Rang, eigenem Bereich im Discord und Streamer-Werkzeugen im Spiel.',
      'You show MoinMorni in videos, streams or clips – with your own rank, your own area on Discord and streamer tools in game.',
    ),
    questions: [
      AGE,
      SINCE,
      t(
        'Link zu deinem Kanal (YouTube, Twitch, TikTok …)',
        'Link to your channel (YouTube, Twitch, TikTok …)',
      ),
      t('Wie oft lädst du hoch oder streamst du?', 'How often do you upload or stream?'),
      TIME,
      WHY,
    ],
  },
  {
    id: 'admin',
    title: t('Stelle: Admin', 'Position: Admin'),
    open: false,
    text: t(
      'Du hältst das Netzwerk mit am Laufen: das Team begleiten, Einstellungen im Panel und Entscheidungen zusammen mit dem Owner.',
      'You help keep the network running: guide the team, look after the panel settings and decide things together with the owner.',
    ),
    questions: [
      AGE,
      SINCE,
      t(
        'In welchen Teams warst du schon, und was hast du dort gemacht?',
        'Which teams have you been part of, and what did you do there?',
      ),
      TIME,
      t('Was würdest du an MoinMorni verbessern?', 'What would you improve about MoinMorni?'),
      WHY,
    ],
  },
];

/** Schlüssel im Katalog, z. B. „moderatorOpen“, „builderQuestionsDe“. */
export const positionKeys = (id: TeamPosition) =>
  ({
    open: `${id}Open`,
    textDe: `${id}TextDe`,
    textEn: `${id}TextEn`,
    questionsDe: `${id}QuestionsDe`,
    questionsEn: `${id}QuestionsEn`,
  }) as const;

function positionSection(p: PositionDefaults): SettingSection {
  const keys = positionKeys(p.id);
  const ownerOnly = p.id === 'admin';
  const settings: SettingDef[] = [
    {
      key: keys.open,
      type: 'boolean',
      default: p.open,
      ownerOnly,
      label: t('Bewerbungen offen', 'Applications open'),
      help: ownerOnly
        ? t(
            'Nur der Owner öffnet die Admin-Stelle. Aus: sie steht nirgends, niemand kann sich bewerben.',
            'Only the owner opens the admin position. Off: it is shown nowhere and nobody can apply.',
          )
        : t(
            'An: Die Stelle steht auf der Webseite unter Team → Bewerben, im Discord bei /bewerben und im Kanal „bewerbungen“.',
            'On: the position is listed on the website under Team → Apply, on Discord with /bewerben and in the “bewerbungen” channel.',
          ),
      command: `/teamsuche ${p.id} an|aus`,
    },
    {
      key: keys.textDe,
      type: 'text',
      default: p.text.de,
      maxLength: TEAM_APPLY_LIMITS.text,
      multiline: true,
      label: t('Beschreibung (Deutsch)', 'Description (German)'),
      help: t(
        'Was jemand in dieser Stelle macht – steht über dem Formular.',
        'What someone in this position does – shown above the form.',
      ),
    },
    {
      key: keys.textEn,
      type: 'text',
      default: p.text.en,
      maxLength: TEAM_APPLY_LIMITS.text,
      multiline: true,
      label: t('Beschreibung (Englisch)', 'Description (English)'),
      help: t('Für Bewerber mit englischer Sprache.', 'For applicants using English.'),
    },
    {
      key: keys.questionsDe,
      type: 'list',
      default: p.questions.map((q) => q.de),
      maxItems: TEAM_APPLY_LIMITS.questions,
      maxLength: TEAM_APPLY_LIMITS.question,
      label: t('Fragen (Deutsch)', 'Questions (German)'),
      help: t(
        'In dieser Reihenfolge. Den Minecraft-Namen fragt das Formular selbst (aus dem verbundenen Konto). Im Discord kommen höchstens 5 Fragen auf einmal, der Rest im nächsten Schritt.',
        'In this order. The form asks for the Minecraft name by itself (from the linked account). On Discord at most 5 questions come at once, the rest in a next step.',
      ),
    },
    {
      key: keys.questionsEn,
      type: 'list',
      default: p.questions.map((q) => q.en),
      maxItems: TEAM_APPLY_LIMITS.questions,
      maxLength: TEAM_APPLY_LIMITS.question,
      label: t('Fragen (Englisch)', 'Questions (English)'),
      help: t(
        'Für Bewerber mit englischer Sprache. Leer = die deutschen Fragen.',
        'For applicants using English. Empty = the German questions.',
      ),
    },
  ];
  return { id: p.id, title: p.title, role: p.id, settings };
}

export const TEAM_APPLY_AREA: SettingArea = {
  id: 'team-apply',
  title: t('Team-Bewerbungen', 'Team applications'),
  text: t(
    'Wer ins Team möchte, bewirbt sich auf der Webseite (Team → Bewerben) oder im Discord mit /bewerben. Hier legst du fest, welche Stellen offen sind, was dort steht und welche Fragen kommen. Annehmen darf nur, wer die Rolle auch vergeben darf; die Admin-Stelle öffnet nur der Owner. VIP und Owner gibt es nie über eine Bewerbung.',
    'Whoever wants to join the team applies on the website (Team → Apply) or on Discord with /bewerben. Here you decide which positions are open, what they say and which questions are asked. Only those who may give the role can accept; only the owner opens the admin position. VIP and owner are never given through an application.',
  ),
  icon: 'ClipboardList',
  panel: 'roles',
  sections: [
    {
      id: 'rules',
      title: t('Regeln', 'Rules'),
      settings: [
        {
          key: 'onePending',
          type: 'boolean',
          default: true,
          label: t('Eine offene Bewerbung pro Person', 'One open application per person'),
          help: t(
            'Solange eine Bewerbung beim Team liegt, kann dieselbe Person keine zweite schicken (auch nicht für eine andere Stelle).',
            'While an application is with the team, the same person cannot send a second one (not even for another position).',
          ),
          command: '/teamsuche eine an|aus',
        },
        {
          key: 'cooldownDays',
          type: 'number',
          default: 14,
          min: 0,
          max: 90,
          unit: t('Tage', 'days'),
          label: t('Wartezeit nach einer Absage', 'Waiting time after a rejection'),
          help: t(
            'So lange nach einer Absage kann sich die Person nicht neu bewerben. 0 = sofort wieder.',
            'How long after a rejection the person cannot apply again. 0 = right away.',
          ),
          command: '/teamsuche wartezeit <tage>',
        },
        {
          key: 'linkedRequired',
          type: 'boolean',
          default: true,
          label: t('Nur mit verbundenem Discord-Konto', 'Only with a linked Discord account'),
          help: t(
            'An: Bewerben geht nur, wenn das Minecraft-Konto mit Discord verbunden ist (/discord im Spiel, dann /verbinden). So gehört der Minecraft-Name sicher der Person, und der Bot gibt bei einer Zusage gleich die Rolle in Discord. Aus: wer nicht verbunden ist, schreibt seinen Minecraft-Namen selbst – das Team prüft ihn.',
            'On: applying only works when the Minecraft account is linked with Discord (/discord in game, then /verbinden). That way the Minecraft name surely belongs to the person, and on acceptance the bot gives the Discord role right away. Off: whoever is not linked types their Minecraft name – the team checks it.',
          ),
          command: '/teamsuche verbunden an|aus',
        },
      ],
    },
    ...TEAM_POSITION_DEFAULTS.map(positionSection),
  ],
};

/** Eine Stelle, wie sie im Katalog steht. */
export interface TeamPositionConfig {
  readonly id: TeamPosition;
  readonly open: boolean;
  readonly text: Text;
  /** Fragen je Sprache; Englisch leer = die deutschen. */
  readonly questions: { readonly de: readonly string[]; readonly en: readonly string[] };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];

/** Die Stellen aus den Werten des Bereichs „team-apply“ (Panel → Einstellungen). */
export function teamPositionsOf(values: Readonly<Record<string, unknown>>): TeamPositionConfig[] {
  return TEAM_POSITIONS.map((id) => {
    const keys = positionKeys(id);
    const de = strings(values[keys.questionsDe]);
    const en = strings(values[keys.questionsEn]);
    return {
      id,
      open: values[keys.open] === true,
      text: { de: String(values[keys.textDe] ?? ''), en: String(values[keys.textEn] ?? '') },
      questions: { de, en: en.length ? en : de },
    };
  });
}
