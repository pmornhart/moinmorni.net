import { useMutation } from '@tanstack/react-query';
import { Boxes, CheckCircle2, Copy, FileBox, Hammer, Info, MapPin, X } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Kbd, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useLanguage } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { ConfirmDialog } from '../../team/dialogs';
import { useBuildQuery, type BuildOverview } from './model';
import { ExtraCard, Notice, StepList } from './parts';

type Schematic = BuildOverview['schematics'][number];
type Target = BuildOverview['targets'][number];

const SKELETON_ROWS = ['a', 'b', 'c'];
const BYTES_PER_KB = 1024;
const KB_PER_MB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * KB_PER_MB;
const FRACTION_DIGITS = 1;
/** A tiny file still shows as "0,1 KB", never "0 KB". */
const SMALLEST_KB = 0.1;
// The name of a build without its ending: "rathaus.schem" → "rathaus", "alt.schematic" → "alt".
// https://regex101.com/?flavor=javascript&regex=%5C.(schem%7Cschematic)%24&testString=rathaus.schem%0Aalt.schematic
const ENDING = /\.(schem|schematic)$/;

function baseName(file: string): string {
  return file.replace(ENDING, '');
}

/** "12,4 KB" / "1,2 MB" in the panel's language. */
function useSize(): (bytes: number) => string {
  const language = useLanguage();
  const number = new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', {
    maximumFractionDigits: FRACTION_DIGITS,
  });
  return (bytes) =>
    bytes >= BYTES_PER_MB
      ? `${number.format(bytes / BYTES_PER_MB)} MB`
      : `${number.format(Math.max(bytes / BYTES_PER_KB, SMALLEST_KB))} KB`;
}

/** How a builder saves a build on the build server, in four steps. */
function HowToSave(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid content-start gap-3 rounded-[14px] border border-border p-4 sm:p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Info className="size-[18px] text-primary" aria-hidden />
        {t('buildCard.howTitle')}
      </p>
      <StepList
        items={[
          <>
            {t('buildCard.how1')} <Kbd>/bau</Kbd>
          </>,
          <>
            {t('buildCard.how2')} <Kbd>//wand</Kbd> {t('buildCard.how2b')}
          </>,
          <>
            {t('buildCard.how3')} <Kbd>//copy</Kbd> {t('buildCard.how3b')}
          </>,
          <>
            {t('buildCard.how4')} <Kbd>//schem save rathaus</Kbd> {t('buildCard.how4b')}
          </>,
        ]}
      />
    </div>
  );
}

/** After copying: where it is now and how to put it into the world there. */
function CopiedNotice({
  copied,
  onClose,
}: {
  readonly copied: { readonly file: string; readonly target: string };
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const name = baseName(copied.file);
  return (
    <div className="relative">
      <Notice
        tone="success"
        icon={CheckCircle2}
        title={t('buildCard.copiedTitle', { file: copied.file, target: copied.target })}
      >
        <StepList
          items={[
            t('buildCard.after1', { target: copied.target }),
            <>
              {t('buildCard.after2')} <Kbd>//schem load {name}</Kbd>
            </>,
            <>
              {t('buildCard.after3')} <Kbd>//paste</Kbd> {t('buildCard.after3b')}
            </>,
          ]}
        />
      </Notice>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onClose}
        className="absolute right-2 top-2"
        aria-label={t('nav.close')}
      >
        <X />
      </Button>
    </div>
  );
}

function SchematicRow({
  file,
  canCopy,
  onCopy,
}: {
  readonly file: Schematic;
  readonly canCopy: boolean;
  readonly onCopy: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const size = useSize();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent text-primary"
          aria-hidden
        >
          <FileBox className="size-5" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <p className="min-w-0 font-semibold [overflow-wrap:anywhere]">
            {baseName(file.name)}
            <span className="font-normal text-muted-foreground">
              {file.name.slice(baseName(file.name).length)}
            </span>
          </p>
          <p className="text-[13px] text-muted-foreground" title={time.date(file.modifiedAt)}>
            {t('buildCard.saved', { size: size(file.size), time: time.relative(file.modifiedAt) })}
          </p>
        </div>
      </div>
      {/* On phones the button sits below the name, in line with it. */}
      <Button variant="secondary" size="sm" onClick={onCopy} disabled={!canCopy} className="max-sm:ml-[52px]">
        <Copy />
        {t('buildCard.copy')}
      </Button>
    </li>
  );
}

/** Choose the mode the build goes to. */
function TargetChoice({
  targets,
  value,
  onChange,
}: {
  readonly targets: readonly Target[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const name = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="pb-2 text-sm font-semibold">{t('buildCard.chooseTarget')}</legend>
      {targets.map((target) => (
        <label
          key={target.id}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-2.5 transition-colors',
            value === target.id ? 'border-primary bg-accent' : 'border-border hover:bg-muted/60',
          )}
        >
          <input
            type="radio"
            name={name}
            value={target.id}
            checked={value === target.id}
            onChange={() => onChange(target.id)}
            className="size-4 accent-[var(--primary)]"
          />
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-semibold">{target.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

function BuildBody({ overview }: { readonly overview: BuildOverview }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const [file, setFile] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [copied, setCopied] = useState<{ file: string; target: string } | null>(null);
  const { schematics, targets } = overview;
  const copy = useMutation({
    mutationFn: (body: { file: string; target: string }) =>
      mmApi('/api/panel/build/copy', { method: 'POST', body }),
    onSuccess: (_r, body) => {
      const name = targets.find((x) => x.id === body.target)?.name ?? body.target;
      setFile(null);
      setCopied({ file: body.file, target: name });
      toast.success(t('buildCard.copiedToast', { file: body.file, target: name }));
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const open = (name: string): void => {
    setFile(name);
    setTarget((current) => (targets.some((x) => x.id === current) ? current : (targets[0]?.id ?? '')));
  };

  return (
    <>
      {copied ? <CopiedNotice copied={copied} onClose={() => setCopied(null)} /> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-3">
          <h3 className="flex items-baseline justify-between gap-3 font-display text-lg font-semibold">
            {t('buildCard.listTitle')}
            <span className="font-sans text-sm font-normal text-muted-foreground">
              {t('buildCard.count', { count: schematics.length })}
            </span>
          </h3>
          {schematics.length ? (
            <div className="overflow-hidden rounded-[14px] border border-border">
              <ul className="grid divide-y divide-border">
                {schematics.map((s) => (
                  <SchematicRow
                    key={s.name}
                    file={s}
                    canCopy={targets.length > 0}
                    onCopy={() => open(s.name)}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
              {t('buildCard.empty')}
            </p>
          )}
          {schematics.length && !targets.length ? (
            <p className="text-sm text-muted-foreground">{t('buildCard.noTargets')}</p>
          ) : null}
        </div>
        <HowToSave />
      </div>

      <ConfirmDialog
        open={file !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setFile(null);
        }}
        title={t('buildCard.copyTitle', { file: file ?? '' })}
        text={t('buildCard.copyText')}
        confirm={t('buildCard.copyGo')}
        icon={Copy}
        busy={copy.isPending || !target}
        onConfirm={() => {
          if (file && target) copy.mutate({ file, target });
        }}
      >
        <TargetChoice targets={targets} value={target} onChange={setTarget} />
      </ConfirmDialog>
    </>
  );
}

/** Einstellungen → Bau-Server: builds saved with WorldEdit, and copying them into a mode. */
export function BuildCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const build = useBuildQuery();
  return (
    <ExtraCard fold="extra:build" icon={Boxes} title={t('buildCard.title')} text={t('buildCard.text')}>
      {build.isPending ? (
        <div className="grid gap-2">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-16 rounded-[12px]" />
          ))}
        </div>
      ) : null}
      {build.isError ? <p className="text-muted-foreground">{errorText(build.error)}</p> : null}
      {build.data && !build.data.available ? (
        <>
          <Notice tone="neutral" icon={Hammer} title={t('buildCard.missingTitle')}>
            <p>{t('buildCard.missingText')}</p>
          </Notice>
          <HowToSave />
        </>
      ) : null}
      {build.data?.available ? <BuildBody overview={build.data} /> : null}
    </ExtraCard>
  );
}
