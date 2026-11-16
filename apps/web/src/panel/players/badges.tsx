import {
  Ban,
  DoorOpen,
  Lock,
  MessageSquareOff,
  MicOff,
  Smartphone,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import type { PlayerView, PunishKind } from './model';

export const KIND_TONE: Readonly<Record<PunishKind, PillTone>> = {
  ban: 'danger',
  mute: 'warning',
  voice: 'warning',
  warn: 'gold',
  kick: 'neutral',
  jail: 'blue',
};

/** Chat mute: a crossed-out speech bubble; voice chat mute: a crossed-out microphone. */
export const KIND_ICON: Readonly<Record<PunishKind, LucideIcon>> = {
  ban: Ban,
  mute: MessageSquareOff,
  voice: MicOff,
  warn: TriangleAlert,
  kick: DoorOpen,
  jail: Lock,
};

/** "Bann", "Stumm", … as a coloured badge with icon. */
export function KindBadge({
  kind,
  className,
}: {
  readonly kind: PunishKind;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const Icon = KIND_ICON[kind];
  return (
    <Pill tone={KIND_TONE[kind]} className={cn('gap-1', className)}>
      <Icon className="size-3" aria-hidden />
      {t(`punish.kinds.${kind}`)}
    </Pill>
  );
}

/** Bedrock, banned and muted as small badges next to a player's name. */
export function PlayerFlags({ player }: { readonly player: PlayerView }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  if (!player.bedrock && !player.banned && !player.muted && !player.jailed && !player.voiceMuted) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {player.bedrock ? (
        <span title={t('players.bedrockHelp')}>
          <Pill tone="blue" className="gap-1">
            <Smartphone className="size-3" aria-hidden />
            {t('players.bedrock')}
          </Pill>
        </span>
      ) : null}
      {player.banned ? (
        <Pill tone="danger" className="gap-1">
          <Ban className="size-3" aria-hidden />
          {t('players.banned')}
        </Pill>
      ) : null}
      {player.muted ? (
        <Pill tone="warning" className="gap-1">
          <MessageSquareOff className="size-3" aria-hidden />
          {t('players.muted')}
        </Pill>
      ) : null}
      {player.voiceMuted ? (
        <Pill tone="warning" className="gap-1">
          <MicOff className="size-3" aria-hidden />
          {t('players.voiceMuted')}
        </Pill>
      ) : null}
      {player.jailed ? (
        <Pill tone="blue" className="gap-1">
          <Lock className="size-3" aria-hidden />
          {t('players.jailed')}
        </Pill>
      ) : null}
    </span>
  );
}

/** Green dot with the server, or "zuletzt da vor …". */
export function PresenceText({
  player,
  relative,
}: {
  readonly player: PlayerView;
  readonly relative: (iso: string) => string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  if (player.online) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
        <span className="size-2 rounded-full bg-success" aria-hidden />
        {player.online.server
          ? t('players.onlineOn', { server: player.online.server })
          : t('players.onlineNoServer')}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">
      {t('players.lastSeen', { when: relative(player.lastSeen) })}
    </span>
  );
}
