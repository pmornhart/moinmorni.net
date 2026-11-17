import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Gamepad2, Link2Off, MessageCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MinecraftHead } from '~/components/minecraft-head';
import { Button, Card, Pill } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { mmApi } from '~/lib/mm-api';
import { refreshPanelMe } from '../session';

/** Shapes of `GET /api/panel/account/links` (apps/server/src/panel/account-links.ts). */
interface Links {
  readonly minecraft: { readonly uuid: string; readonly name: string; readonly confirmed: boolean } | null;
  readonly discord: { readonly id: string; readonly name: string; readonly avatar: string | null } | null;
  readonly discordReady: boolean;
}
type Kind = 'minecraft' | 'discord';
interface Code {
  readonly code: string;
  readonly expiresAt: string;
}

const LINKS_KEY = ['panel', 'account', 'links'] as const;
/** While a code is open, look every few seconds whether it was used. */
const POLL_MS = 3000;
const SECOND_MS = 1000;
const MINUTE_S = 60;
const AVATAR_SIZE = 64;
const SECONDS_DIGITS = 2;

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.round((Date.parse(until) - now) / SECOND_MS)) : 0;
}

function CodeBox({ kind, code, onNew }: { kind: Kind; code: Code; onNew: () => void }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const left = useCountdown(code.expiresAt);
  const [copied, setCopied] = useState(false);
  const command = kind === 'minecraft' ? `/verbinden ${code.code}` : `/verbinden code:${code.code}`;
  const copy = async (): Promise<void> => {
    await navigator.clipboard?.writeText(kind === 'minecraft' ? command : code.code);
    setCopied(true);
  };
  if (left === 0)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-muted p-3 text-sm">
        {t('connections.expired')}
        <Button size="sm" variant="ghost" onClick={onNew}>
          <RefreshCw />
          {t('connections.newCode')}
        </Button>
      </div>
    );
  return (
    <div className="grid gap-2 rounded-[14px] border border-primary/30 bg-primary/5 p-3.5">
      <p className="text-sm text-pretty">{t(`connections.${kind}.how`)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-[10px] bg-background px-3 py-1.5 font-mono text-lg font-bold tracking-[0.2em]">
          {command}
        </code>
        <Button size="sm" variant="ghost" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? t('connections.copied') : t('connections.copy')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('connections.validFor', {
          time: `${Math.floor(left / MINUTE_S)}:${String(left % MINUTE_S).padStart(SECONDS_DIGITS, '0')}`,
        })}
      </p>
    </div>
  );
}

function Row({
  kind,
  picture,
  title,
  status,
  linked,
  code,
  onCode,
  onUnlink,
  busy,
  disabled,
}: {
  readonly kind: Kind;
  readonly picture: ReactNode;
  readonly title: string;
  readonly status: ReactNode;
  readonly linked: boolean;
  readonly code: Code | null;
  readonly onCode: () => void;
  readonly onUnlink: () => void;
  readonly busy: boolean;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3.5">
        {picture}
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="font-semibold">{title}</span>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
        {linked ? (
          <Button size="sm" variant="ghost" onClick={onUnlink} disabled={busy}>
            <Link2Off />
            {t('connections.unlink')}
          </Button>
        ) : (
          <Button size="sm" onClick={onCode} disabled={busy || disabled}>
            {t(`connections.${kind}.link`)}
          </Button>
        )}
      </div>
      {code && !linked ? <CodeBox kind={kind} code={code} onNew={onCode} /> : null}
    </li>
  );
}

function MinecraftStatus({ mc }: { readonly mc: Links['minecraft'] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  if (!mc) return <>{t('connections.minecraft.none')}</>;
  if (mc.confirmed)
    return (
      <Pill tone="success">
        <Check className="size-3.5" aria-hidden />
        {t('connections.minecraft.confirmed')}
      </Pill>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <TriangleAlert className="size-4 text-gold" aria-hidden />
      {t('connections.minecraft.unconfirmed')}
    </span>
  );
}

/** "Verbindungen": Minecraft and Discord for this team account – linked only with a code typed in game or in Discord. */
export function ConnectionsCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const client = useQueryClient();
  const [codes, setCodes] = useState<Partial<Record<Kind, Code>>>({});
  const open = Object.values(codes).some((c) => c && Date.parse(c.expiresAt) > Date.now());
  const links = useQuery({
    queryKey: LINKS_KEY,
    queryFn: () => mmApi<Links>('/api/panel/account/links'),
    refetchInterval: open ? POLL_MS : false,
  });
  const done = (): void => {
    void client.invalidateQueries({ queryKey: LINKS_KEY });
    refreshPanelMe(client);
  };
  const newCode = useMutation({
    mutationFn: async (kind: Kind) => ({
      kind,
      c: await mmApi<Code>(`/api/panel/account/links/${kind}/code`, { method: 'POST' }),
    }),
    onSuccess: ({ kind, c }) => setCodes((before) => ({ ...before, [kind]: c })),
  });
  const unlink = useMutation({
    mutationFn: (kind: Kind) => mmApi(`/api/panel/account/links/${kind}`, { method: 'DELETE' }),
    onSuccess: (_r, kind) => {
      setCodes((before) => ({ ...before, [kind]: undefined }));
      done();
    },
  });
  // A code was used: refresh the session too (rank, head).
  const mcLinked = Boolean(links.data?.minecraft);
  useEffect(() => {
    if (mcLinked) refreshPanelMe(client);
  }, [mcLinked, client]);

  const data = links.data;
  const busy = newCode.isPending || unlink.isPending;
  const mc = data?.minecraft ?? null;
  const dc = data?.discord ?? null;
  return (
    <Card className="grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="font-display text-lg font-semibold">{t('connections.title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{t('connections.text')}</p>
      </div>
      <ul className="grid divide-y divide-border">
        <Row
          kind="minecraft"
          picture={
            <MinecraftHead
              uuid={mc?.uuid ?? null}
              name={mc?.name || 'M'}
              className="size-12 rounded-[12px] bg-muted text-xl"
              letterClassName="text-muted-foreground"
            />
          }
          title={mc ? mc.name || t('connections.minecraft.title') : t('connections.minecraft.title')}
          status={<MinecraftStatus mc={mc} />}
          linked={Boolean(mc?.confirmed)}
          code={codes.minecraft ?? null}
          onCode={() => newCode.mutate('minecraft')}
          onUnlink={() => unlink.mutate('minecraft')}
          busy={busy}
        />
        {mc && !mc.confirmed ? (
          <li className="pb-3 text-xs text-muted-foreground">
            <Button size="sm" variant="ghost" className="-ml-3" onClick={() => unlink.mutate('minecraft')}>
              <Link2Off />
              {t('connections.unlink')}
            </Button>
          </li>
        ) : null}
        <Row
          kind="discord"
          picture={
            dc?.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${dc.id}/${dc.avatar}.png?size=${AVATAR_SIZE}`}
                alt=""
                className="size-12 rounded-full bg-muted"
              />
            ) : (
              <span
                className="grid size-12 place-items-center rounded-full bg-[#5865f2] text-white"
                aria-hidden
              >
                <MessageCircle className="size-6" />
              </span>
            )
          }
          title={dc ? dc.name : t('connections.discord.title')}
          status={
            dc ? (
              <Pill tone="success">
                <Check className="size-3.5" aria-hidden />
                {t('connections.discord.linked')}
              </Pill>
            ) : (
              t(data && !data.discordReady ? 'connections.discord.noBot' : 'connections.discord.none')
            )
          }
          linked={Boolean(dc)}
          code={codes.discord ?? null}
          onCode={() => newCode.mutate('discord')}
          onUnlink={() => unlink.mutate('discord')}
          busy={busy}
          disabled={data ? !data.discordReady : true}
        />
      </ul>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground text-pretty">
        <Gamepad2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('connections.everywhere')}
      </p>
    </Card>
  );
}
