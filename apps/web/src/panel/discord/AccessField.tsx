import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Eye, EyeOff, KeyRound, Lock, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Input, Pill } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { ConfirmDialog } from '../team/dialogs';
import { APPEARANCE_KEY, DISCORD_KEY, type CredentialState } from './model';

/**
 * One secret of the bot (token or client secret): once saved it never comes back – the panel only shows that it is
 * set and where it comes from. Replace or remove it; a value from the .env is shown as such and stays.
 */

export type AccessKind = 'token' | 'clientSecret';

const PATHS: Readonly<Record<AccessKind, string>> = {
  token: '/api/panel/discord/token',
  clientSecret: '/api/panel/discord/client-secret',
};
const BODY_KEY: Readonly<Record<AccessKind, string>> = { token: 'token', clientSecret: 'secret' };
/** Longest values the server takes (apps/server/src/panel/discord-routes.ts). */
const TOKEN_MAX = 120;
const SECRET_MAX = 128;
const MAX_LENGTH: Readonly<Record<AccessKind, number>> = { token: TOKEN_MAX, clientSecret: SECRET_MAX };

export function AccessField({
  kind,
  state,
  canEdit,
  botName,
}: {
  readonly kind: AccessKind;
  readonly state: CredentialState;
  readonly canEdit: boolean;
  /** Name of the connected bot (token only). */
  readonly botName?: string | null;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DISCORD_KEY }),
      queryClient.invalidateQueries({ queryKey: APPEARANCE_KEY }),
    ]);
  };
  const save = useMutation({
    mutationFn: () =>
      mmApi<{ bot?: { name: string } }>(PATHS[kind], {
        method: 'PUT',
        body: { [BODY_KEY[kind]]: value.trim() },
      }),
    onMutate: () => setFailure(null),
    onSuccess: async (result) => {
      setValue('');
      setEditing(false);
      toast.success(
        result.bot
          ? t('discordAccess.savedBot', { name: result.bot.name })
          : t(`discordAccess.${kind}.saved`),
      );
      await refresh();
    },
    onError: (err) => setFailure(errorText(err)),
  });
  const remove = useMutation({
    mutationFn: () => mmApi(PATHS[kind], { method: 'DELETE' }),
    onSuccess: async () => {
      setRemoving(false);
      toast.success(t(`discordAccess.${kind}.removed`));
      await refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (value.trim()) save.mutate();
  };

  const head = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-muted-foreground" aria-hidden />
        {t(`discordAccess.${kind}.label`)}
      </span>
      {state.source === 'env' ? (
        <Pill tone="blue">
          <Lock className="size-3" aria-hidden />
          {t('discordAccess.fromEnv')}
        </Pill>
      ) : null}
      {state.source === 'panel' ? (
        <Pill tone="success">
          <CircleCheck className="size-3" aria-hidden />
          {t('discordAccess.set')}
        </Pill>
      ) : null}
      {!state.set ? <Pill tone="neutral">{t('discordAccess.notSet')}</Pill> : null}
    </div>
  );

  const showForm = canEdit && state.source !== 'env' && (!state.set || editing);
  return (
    <div className="grid gap-3 rounded-[14px] border border-border bg-muted/40 p-4 dark:bg-white/[0.02]">
      {head}
      {kind === 'token' && botName && state.set ? (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <ShieldCheck className="size-4 text-success" aria-hidden />
          {t('discordAccess.connectedAs', { name: botName })}
        </p>
      ) : null}
      {state.source === 'env' ? (
        <p className="text-[13.5px] text-muted-foreground">{t('discordAccess.envHint')}</p>
      ) : null}
      {!canEdit && state.source !== 'env' ? (
        <p className="flex items-start gap-2 text-[13.5px] text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('discordAccess.ownerOnly')}
        </p>
      ) : null}
      {showForm ? (
        <form onSubmit={submit} className="grid gap-2">
          <label htmlFor={id} className="text-[13.5px] text-muted-foreground">
            {t(`discordAccess.${kind}.help`)}
          </label>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-64">
              <Input
                id={id}
                type={visible ? 'text' : 'password'}
                value={value}
                maxLength={MAX_LENGTH[kind]}
                autoComplete="off"
                spellCheck={false}
                placeholder={t(`discordAccess.${kind}.placeholder`)}
                onChange={(e) => {
                  setValue(e.target.value);
                  setFailure(null);
                }}
                className="pr-11 font-mono text-[13.5px]"
                aria-invalid={failure ? true : undefined}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-[9px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={visible ? t('discordAccess.hide') : t('discordAccess.show')}
                title={visible ? t('discordAccess.hide') : t('discordAccess.show')}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button type="submit" disabled={!value.trim() || save.isPending}>
              <ShieldCheck />
              {save.isPending ? t('discordAccess.checking') : t('discordAccess.save')}
            </Button>
            {editing ? (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                {t('discordAccess.cancel')}
              </Button>
            ) : null}
          </div>
          {failure ? (
            <p role="alert" className="text-[13.5px] font-semibold text-destructive">
              {failure}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('discordAccess.privacy')}</p>
          )}
        </form>
      ) : null}
      {canEdit && state.source === 'panel' && !editing ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <RefreshCw />
            {t('discordAccess.replace')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setRemoving(true)}>
            <Trash2 />
            {t('discordAccess.remove')}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t(`discordAccess.${kind}.removeTitle`)}
        text={t(`discordAccess.${kind}.removeText`)}
        confirm={t('discordAccess.remove')}
        icon={Trash2}
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <span className={cn('sr-only')} aria-live="polite">
        {save.isSuccess ? t(`discordAccess.${kind}.saved`) : ''}
      </span>
    </div>
  );
}
