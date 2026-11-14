import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Fingerprint,
  Gamepad2,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmailCard, meQuery, MinecraftAccountCard, PasskeysCard, PasswordCard, TwoFactorCard } from '@/embed';
import { MinecraftHead } from '~/components/minecraft-head';
import { RoleBadge } from '~/components/role-visuals';
import { Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { MotorSession } from '../motor-session';
import { PageHead } from '../PanelShell';
import { refreshPanelMe, useCan, usePanel } from '../session';

/**
 * MorniHosting's account cards fold; they remember open/closed per browser under this prefix. On the first visit the
 * Minecraft card is open – it is the one that matters most in MoinMorni.
 */
const FOLD_STORE = 'mh:fold:';
const OPEN_ON_FIRST_VISIT = ['account-minecraft'] as const;

function openOnFirstVisit(): void {
  try {
    OPEN_ON_FIRST_VISIT.filter((id) => localStorage.getItem(FOLD_STORE + id) === null).forEach((id) =>
      localStorage.setItem(FOLD_STORE + id, '1'),
    );
  } catch {
    // Without storage the cards simply start folded.
  }
}

// Once, when the page is first opened in this visit (before the cards read their state).
openOnFirstVisit();

/** MorniHosting's own cards. Each change (2FA, Minecraft account, password …) refreshes both sessions. */
function AccountCards(): ReactElement {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        refreshPanelMe(queryClient);
      }),
    [queryClient],
  );
  return (
    <>
      <MinecraftAccountCard />
      <PasswordCard />
      <PasskeysCard />
      <TwoFactorCard />
      <EmailCard />
    </>
  );
}

function Summary(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = usePanel();
  const seesTeam = useCan('roles');
  return (
    <Card className="order-1 grid gap-4 p-5 sm:p-6 xl:order-none">
      <div className="flex items-center gap-3.5">
        <MinecraftHead
          uuid={me.minecraftUuid}
          name={me.username}
          className="size-14 rounded-[14px] bg-muted text-2xl"
          letterClassName="text-muted-foreground"
        />
        <div className="grid min-w-0 gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{t('account.signedInAs')}</span>
          <span className="truncate font-display text-xl font-semibold leading-tight">{me.username}</span>
          <RoleBadge role={me.role} />
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{t('account.roleText')}</p>
      {seesTeam ? (
        <Link
          to="/team"
          className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t('account.toTeam')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </Card>
  );
}

function MinecraftHint(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = usePanel();
  return (
    <div className="flex items-start gap-3.5 rounded-[16px] border border-gold/30 bg-gold-soft p-4 sm:p-5">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-gold text-[#1f1503]"
        aria-hidden
      >
        <Gamepad2 className="size-5" />
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold">
          {me.minecraftUuid ? t('account.minecraftLinkedTitle') : t('account.minecraftTitle')}
        </p>
        <p className="text-sm leading-relaxed text-pretty">
          {me.minecraftUuid ? t('account.minecraftLinked') : t('account.minecraftText')}
        </p>
      </div>
    </div>
  );
}

const TERMS: readonly { readonly id: string; readonly icon: LucideIcon }[] = [
  { id: 'password', icon: KeyRound },
  { id: 'passkey', icon: Fingerprint },
  { id: 'twoFactor', icon: ShieldCheck },
  { id: 'email', icon: Mail },
];

/** Passkey, 2FA … in plain words. */
function Glossary(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Card className="order-3 grid gap-4 p-5 sm:p-6 xl:order-none">
      <h2 className="font-display text-lg font-semibold">{t('account.terms.title')}</h2>
      <dl className="grid gap-3.5">
        {TERMS.map(({ id, icon: Icon }) => (
          <div key={id} className="flex items-start gap-3">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground"
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <div className="grid min-w-0 gap-0.5">
              <dt className="text-sm font-semibold">{t(`account.terms.${id}.title`)}</dt>
              <dd className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
                {t(`account.terms.${id}.text`)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** "Mein Konto": the signed-in person's own access – MorniHosting's account cards inside MoinMorni's page. */
export function AccountPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <>
      <PageHead icon={UserRound} title={t('account.title')} text={t('account.text')} />
      {/* Phones: who you are, the cards, the glossary. Wide screens: cards left, the other two in a column right. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 grid min-w-0 gap-4 xl:order-none">
          <MinecraftHint />
          <MotorSession>
            <AccountCards />
          </MotorSession>
        </div>
        <aside className="contents xl:grid xl:content-start xl:gap-5">
          <Summary />
          <Glossary />
        </aside>
      </div>
    </>
  );
}
