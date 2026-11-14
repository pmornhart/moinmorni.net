import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useRefreshPlayers, type LiftKind } from './model';

export interface LiftInput {
  readonly uuid: string;
  readonly kind: LiftKind;
  readonly name: string;
}

/** Lifts a ban or mute right away (in the game too) and tells how it went. */
export function useLiftPunishment(): UseMutationResult<unknown, Error, LiftInput> {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const refresh = useRefreshPlayers();
  return useMutation({
    mutationFn: ({ uuid, kind }: LiftInput) =>
      mmApi<{ ok: boolean }>(`/api/panel/punishments/${encodeURIComponent(uuid)}/${kind}`, {
        method: 'DELETE',
      }),
    onSuccess: async (_, { kind, name }) => {
      toast.success(t(`punish.lifted.${kind}`, { name }));
      await refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });
}
