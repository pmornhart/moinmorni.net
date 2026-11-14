import { Check, Copy, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE, setLanguage, SUPPORTED_LANGUAGES } from '~/i18n';
import { cn } from '~/lib/cn';
import { useLanguage } from '~/lib/text';
import { useTheme } from '~/lib/theme';
import { Button, type ButtonVariant } from './ui';

const COPIED_MS = 1800;

/** Copies `value`; shows "Kopiert!" for a moment. Falls back to selecting the text when the clipboard is blocked. */
export function useCopy(value: string): {
  readonly copied: boolean;
  readonly failed: boolean;
  readonly copy: () => void;
} {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = (): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(value);
        setFailed(false);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
      } catch {
        setFailed(true);
      }
    })();
  };
  return { copied, failed, copy };
}

export function CopyButton({
  value,
  variant = 'band',
  className,
}: {
  readonly value: string;
  readonly variant?: ButtonVariant;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { copied, copy } = useCopy(value);
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={copy}
      className={cn('min-w-[7.5rem]', className)}
      aria-live="polite"
    >
      {copied ? <Check /> : <Copy />}
      {copied ? t('copy.done') : t('copy.action')}
    </Button>
  );
}

export function ThemeToggle({
  variant = 'ghost',
  className,
}: {
  readonly variant?: ButtonVariant;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { resolved, toggle } = useTheme();
  const label = resolved === 'dark' ? t('theme.toLight') : t('theme.toDark');
  return (
    <Button
      variant={variant}
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={className}
    >
      {resolved === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

/** DE | EN as a small segmented switch. */
export function LanguageSwitch({
  tone = 'band',
  className,
}: {
  readonly tone?: 'band' | 'plain';
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const frame = tone === 'band' ? 'border-band-line bg-white/[0.05]' : 'border-border bg-muted/60';
  const active = tone === 'band' ? 'bg-band-foreground text-band' : 'bg-card text-foreground shadow-card';
  const idle =
    tone === 'band'
      ? 'text-band-muted hover:text-band-foreground'
      : 'text-muted-foreground hover:text-foreground';
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn('inline-flex rounded-full border p-0.5', frame, className)}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={language === lang}
          title={t(`language.${lang}`)}
          onClick={() => setLanguage(lang)}
          className={cn(
            'cursor-pointer rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] transition-colors',
            language === lang ? active : idle,
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}

/** A labelled row of content used in forms: label, then the control, then help text. */
export function FieldBlock({
  id,
  label,
  help,
  children,
  className,
}: {
  readonly id: string;
  readonly label: string;
  readonly help?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {help ? <div className="text-[13px] leading-snug text-muted-foreground">{help}</div> : null}
    </div>
  );
}
