import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { AlertDialog } from 'radix-ui';
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  FileText,
  MessagesSquare,
  Newspaper,
  PenLine,
  Pin,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { Text } from '@moinmorni/shared';
import { Button, Card, Input, Pill, Skeleton, Switch, Textarea, type PillTone } from '~/components/ui';
import { MM_NAMESPACE, SUPPORTED_LANGUAGES, type Language } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { NEWS_CATEGORIES, type NewsCategory } from '~/lib/site';
import { paragraphs, usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';

/** A news post as the panel sees it (apps/server/src/panel/news-routes.ts). */
export interface PanelNews {
  readonly id: number;
  readonly slug: string;
  readonly category: NewsCategory;
  readonly title: Text;
  readonly body: Text;
  readonly pinned: boolean;
  /** null = draft. */
  readonly publishedAt: string | null;
  readonly author: string;
  readonly createdAt: string;
}

interface NewsDraft {
  readonly category: NewsCategory;
  readonly title: Text;
  readonly body: Text;
  readonly pinned: boolean;
}

/** Limits of the news API. */
const TITLE_MAX = 120;
const BODY_MAX = 20_000;
const BODY_ROWS = 12;
const NEWS_KEY = ['panel', 'news'] as const;
const EMPTY: NewsDraft = {
  category: 'info',
  title: { de: '', en: '' },
  body: { de: '', en: '' },
  pinned: false,
};

const CATEGORY_TONE: Readonly<Record<NewsCategory, PillTone>> = {
  update: 'success',
  event: 'gold',
  info: 'blue',
};

const CATEGORY_ACTIVE: Readonly<Record<NewsCategory, string>> = {
  update: 'border-success bg-success-soft text-success',
  event: 'border-gold bg-gold-soft text-gold',
  info: 'border-blue bg-blue-soft text-blue',
};

function useNewsQuery(): UseQueryResult<PanelNews[]> {
  return useQuery({ queryKey: NEWS_KEY, queryFn: () => mmApi<PanelNews[]>('/api/panel/news') });
}

function draftOf(news: PanelNews): NewsDraft {
  // The server copies the German text into empty English fields; show them empty again when they are the same.
  const own = (text: Text): Text => ({ de: text.de, en: text.en === text.de ? '' : text.en });
  return { category: news.category, title: own(news.title), body: own(news.body), pinned: news.pinned };
}

function CategoryPill({ category }: { readonly category: NewsCategory }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return <Pill tone={CATEGORY_TONE[category]}>{t(`site.news.category.${category}`)}</Pill>;
}

function StatePill({ news }: { readonly news: PanelNews }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return news.publishedAt ? (
    <Pill tone="success" dot>
      {t('newsAdmin.published')}
    </Pill>
  ) : (
    <Pill tone="neutral" dot>
      {t('newsAdmin.draft')}
    </Pill>
  );
}

/** Asks once more before a news post is gone for good. */
function DeleteNews({
  news,
  onDone,
}: {
  readonly news: PanelNews;
  readonly onDone?: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => mmApi(`/api/panel/news/${news.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setOpen(false);
      toast.success(t('newsAdmin.deleted', { title: pick(news.title) }));
      await queryClient.invalidateQueries({ queryKey: NEWS_KEY });
      onDone?.();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <Button variant="danger" size="sm">
          <Trash2 />
          {t('newsAdmin.delete')}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[18px] border border-border bg-popover p-6 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <AlertDialog.Title className="font-display text-xl font-semibold">
            {t('newsAdmin.deleteTitle')}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground">
            {t('newsAdmin.deleteText', { title: pick(news.title) })}
          </AlertDialog.Description>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{t('newsAdmin.cancel')}</Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              className="border-destructive bg-destructive-soft"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2 />
              {t('newsAdmin.deleteConfirm')}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function NewsRow({ news }: { readonly news: PanelNews }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const time = useTimeText();
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryPill category={news.category} />
          <StatePill news={news} />
          {news.pinned ? (
            <Pill tone="gold" className="gap-1">
              <Pin className="size-3" aria-hidden />
              {t('newsAdmin.pinned')}
            </Pill>
          ) : null}
        </div>
        <Link
          to={`/news/${news.id}`}
          className="truncate text-[1.05rem] font-bold hover:text-primary hover:underline"
        >
          {pick(news.title)}
        </Link>
        <p className="text-[13px] text-muted-foreground">
          {news.publishedAt
            ? t('newsAdmin.publishedAt', { date: time.date(news.publishedAt), name: news.author })
            : t('newsAdmin.createdAt', { date: time.date(news.createdAt), name: news.author })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {news.publishedAt ? (
          <Button asChild variant="ghost" size="sm">
            <a href={`/news/${news.slug}`} target="_blank" rel="noopener">
              <ExternalLink />
              {t('newsAdmin.view')}
            </a>
          </Button>
        ) : null}
        <Button asChild variant="secondary" size="sm">
          <Link to={`/news/${news.id}`}>
            <PenLine />
            {t('newsAdmin.edit')}
          </Link>
        </Button>
        <DeleteNews news={news} />
      </div>
    </li>
  );
}

function NewsList(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const news = useNewsQuery();
  const list = news.data ?? [];
  const drafts = list.filter((n) => !n.publishedAt).length;
  return (
    <>
      <PageHead icon={Newspaper} title={t('newsAdmin.title')} text={t('newsAdmin.text')}>
        <Button asChild>
          <Link to="/news/neu">
            <Plus />
            {t('newsAdmin.new')}
          </Link>
        </Button>
      </PageHead>
      {news.isPending ? <Skeleton className="h-64 rounded-[16px]" /> : null}
      {news.isError ? <Card className="p-6 text-muted-foreground">{errorText(news.error)}</Card> : null}
      {news.data && !list.length ? (
        <Card className="grid justify-items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-[14px] bg-gold-soft text-gold" aria-hidden>
            <Newspaper className="size-6" />
          </span>
          <p className="max-w-[46ch] text-muted-foreground">{t('newsAdmin.empty')}</p>
          <Button asChild>
            <Link to="/news/neu">
              <Plus />
              {t('newsAdmin.first')}
            </Link>
          </Button>
        </Card>
      ) : null}
      {list.length ? (
        <>
          <p className="px-1 text-sm text-muted-foreground">
            {t('newsAdmin.count', { count: list.length })}
            {drafts ? ` · ${t('newsAdmin.drafts', { count: drafts })}` : ''}
          </p>
          <Card className="overflow-hidden">
            <ul className="grid divide-y divide-border">
              {list.map((n) => (
                <NewsRow key={n.id} news={n} />
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}

/** The post as the website will show it: title and one paragraph per line. */
function Preview({
  draft,
  language,
}: {
  readonly draft: NewsDraft;
  readonly language: Language;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const title = (language === 'en' && draft.title.en.trim()) || draft.title.de;
  const body = (language === 'en' && draft.body.en.trim()) || draft.body.de;
  const lines = paragraphs(body);
  return (
    <Card className="grid content-start gap-4 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-gold">
        <Eye className="size-4" aria-hidden />
        {t('newsAdmin.preview')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryPill category={draft.category} />
        {draft.pinned ? (
          <Pill tone="gold" className="gap-1">
            <Pin className="size-3" aria-hidden />
            {t('newsAdmin.pinned')}
          </Pill>
        ) : null}
      </div>
      <h2 className="font-display text-[1.6rem] font-semibold leading-tight [overflow-wrap:anywhere]">
        {title || <span className="text-muted-foreground">{t('newsAdmin.previewNoTitle')}</span>}
      </h2>
      {lines.length ? (
        <div className="grid gap-3 leading-relaxed [overflow-wrap:anywhere]">
          {lines.map((line, i) => (
            // Lines may repeat word for word; their place is their identity.
            <p key={`${i + 1}-${line}`}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('newsAdmin.previewEmpty')}</p>
      )}
      {language === 'en' && !draft.body.en.trim() && draft.body.de.trim() ? (
        <p className="text-xs text-muted-foreground">{t('newsAdmin.previewFallback')}</p>
      ) : null}
    </Card>
  );
}

function Editor({ news }: { readonly news: PanelNews | null }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ids = { title: useId(), body: useId(), pinned: useId() };
  const [draft, setDraft] = useState<NewsDraft>(() => (news ? draftOf(news) : EMPTY));
  const [language, setLanguage] = useState<Language>('de');
  const [tried, setTried] = useState(false);
  const titleMissing = !draft.title.de.trim();
  const bodyMissing = !draft.body.de.trim();
  const published = Boolean(news?.publishedAt);

  const save = useMutation({
    mutationFn: (publish: boolean) =>
      mmApi<PanelNews>(news ? `/api/panel/news/${news.id}` : '/api/panel/news', {
        method: news ? 'PUT' : 'POST',
        body: { ...draft, publish },
      }),
    onSuccess: async (saved, publish) => {
      await queryClient.invalidateQueries({ queryKey: NEWS_KEY });
      const message = ((): string => {
        if (!publish) return t('newsAdmin.savedDraft');
        return published ? t('newsAdmin.savedUpdated') : t('newsAdmin.savedPublished');
      })();
      toast.success(message);
      // Published: back to the list. A new draft keeps its editor (now under its own address).
      if (publish) void navigate('/news');
      else if (!news) void navigate(`/news/${saved.id}`, { replace: true });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const submit = (publish: boolean): void => {
    setTried(true);
    if (titleMissing || bodyMissing) {
      setLanguage('de');
      return;
    }
    save.mutate(publish);
  };
  const setText = (field: 'title' | 'body', value: string): void =>
    setDraft((d) => ({ ...d, [field]: { ...d[field], [language]: value } }));
  const showError = (missing: boolean): boolean => tried && missing && language === 'de';

  return (
    <>
      <PageHead
        icon={Newspaper}
        title={news ? t('newsAdmin.editTitle') : t('newsAdmin.newTitle')}
        text={t('newsAdmin.editorText')}
      >
        <Button asChild variant="ghost">
          <Link to="/news">
            <ArrowLeft />
            {t('newsAdmin.back')}
          </Link>
        </Button>
      </PageHead>
      <div className="grid items-start gap-[22px] xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="grid gap-6 p-5 sm:p-7">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">{t('newsAdmin.category')}</legend>
            <div className="flex flex-wrap gap-2">
              {NEWS_CATEGORIES.map((c) => (
                <label
                  key={c}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary/30',
                    draft.category === c
                      ? CATEGORY_ACTIVE[c]
                      : 'border-input text-muted-foreground hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="news-category"
                    value={c}
                    checked={draft.category === c}
                    onChange={() => setDraft((d) => ({ ...d, category: c }))}
                    className="sr-only"
                  />
                  {t(`site.news.category.${c}`)}
                </label>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">{t('newsAdmin.categoryHelp')}</p>
          </fieldset>

          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold">{t('newsAdmin.textLabel')}</span>
              <div
                role="group"
                aria-label={t('newsAdmin.languageLabel')}
                className="inline-flex rounded-full border border-border bg-muted/60 p-0.5"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={language === l}
                    onClick={() => setLanguage(l)}
                    className={cn(
                      'cursor-pointer rounded-full px-3.5 py-1 text-xs font-bold transition-colors',
                      language === l ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground',
                    )}
                  >
                    {t(`language.${l}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.title} className="text-sm font-semibold">
                {language === 'de' ? t('newsAdmin.titleDe') : t('newsAdmin.titleEn')}
              </label>
              <Input
                id={ids.title}
                value={draft.title[language]}
                maxLength={TITLE_MAX}
                placeholder={language === 'en' ? draft.title.de : t('newsAdmin.titlePlaceholder')}
                aria-invalid={showError(titleMissing)}
                className={cn(showError(titleMissing) && 'border-destructive')}
                onChange={(e) => setText('title', e.target.value)}
              />
              {showError(titleMissing) ? (
                <p className="text-[13px] font-semibold text-destructive">{t('newsAdmin.titleMissing')}</p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.body} className="text-sm font-semibold">
                {language === 'de' ? t('newsAdmin.bodyDe') : t('newsAdmin.bodyEn')}
              </label>
              <Textarea
                id={ids.body}
                rows={BODY_ROWS}
                value={draft.body[language]}
                maxLength={BODY_MAX}
                placeholder={
                  language === 'en' ? t('newsAdmin.bodyEnPlaceholder') : t('newsAdmin.bodyPlaceholder')
                }
                aria-invalid={showError(bodyMissing)}
                className={cn('min-h-56', showError(bodyMissing) && 'border-destructive')}
                onChange={(e) => setText('body', e.target.value)}
              />
              <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted-foreground">
                <span className={cn(showError(bodyMissing) && 'font-semibold text-destructive')}>
                  {showError(bodyMissing) ? t('newsAdmin.bodyMissing') : t('newsAdmin.bodyHelp')}
                </span>
                <span className="tabular">
                  {t('settings.chars', { count: draft.body[language].length, max: BODY_MAX })}
                </span>
              </div>
            </div>
            {language === 'en' ? (
              <p className="rounded-[12px] bg-blue-soft px-3.5 py-2.5 text-[13px] text-blue">
                {t('newsAdmin.englishHelp')}
              </p>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-[14px] border border-border p-4">
            <div className="grid gap-1">
              <label htmlFor={ids.pinned} className="font-semibold">
                {t('newsAdmin.pinLabel')}
              </label>
              <p className="text-[13px] text-muted-foreground">{t('newsAdmin.pinHelp')}</p>
            </div>
            <Switch
              id={ids.pinned}
              checked={draft.pinned}
              onCheckedChange={(checked) => setDraft((d) => ({ ...d, pinned: checked }))}
            />
          </div>

          <div className="grid gap-3 border-t border-border pt-5">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => submit(true)} disabled={save.isPending}>
                <Send />
                {published ? t('newsAdmin.publishAgain') : t('newsAdmin.publish')}
              </Button>
              <Button variant="secondary" onClick={() => submit(false)} disabled={save.isPending}>
                <Save />
                {t('newsAdmin.saveDraft')}
              </Button>
            </div>
            <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <MessagesSquare className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden />
              {published ? t('newsAdmin.publishedHint') : t('newsAdmin.discordHint')}
            </p>
            {news ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <DeleteNews news={news} onDone={() => void navigate('/news')} />
                {published ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/news/${news.slug}`} target="_blank" rel="noopener">
                      <ExternalLink />
                      {t('newsAdmin.view')}
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
        <div className="xl:sticky xl:top-6">
          <Preview draft={draft} language={language} />
        </div>
      </div>
    </>
  );
}

function EditorRoute(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { newsId = '' } = useParams();
  const news = useNewsQuery();
  if (newsId === 'neu') return <Editor news={null} />;
  if (news.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
  const found = news.data?.find((n) => String(n.id) === newsId);
  if (!found) {
    return (
      <Card className="grid justify-items-start gap-3 p-6">
        <p className="flex items-center gap-2 text-muted-foreground">
          <FileText className="size-5" aria-hidden />
          {t('newsAdmin.missing')}
        </p>
        <Button asChild variant="secondary">
          <Link to="/news">
            <ArrowLeft />
            {t('newsAdmin.back')}
          </Link>
        </Button>
      </Card>
    );
  }
  return <Editor key={found.id} news={found} />;
}

/** Panel: all news (drafts and published) – /panel/news. */
export function NewsPage(): ReactElement {
  return (
    <AreaGate area="content">
      <NewsList />
    </AreaGate>
  );
}

/** Panel: write or change one news post – /panel/news/neu and /panel/news/<id>. */
export function NewsEditorPage(): ReactElement {
  return (
    <AreaGate area="content">
      <EditorRoute />
    </AreaGate>
  );
}
