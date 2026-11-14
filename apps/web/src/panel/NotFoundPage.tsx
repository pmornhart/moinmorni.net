import { ArrowLeft, Compass } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';

export function NotFoundPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Card className="grid justify-items-start gap-3 p-8">
      <span
        className="grid size-12 place-items-center rounded-[14px] bg-muted text-muted-foreground"
        aria-hidden
      >
        <Compass className="size-6" />
      </span>
      <h1 className="font-display text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.text')}</p>
      <Button asChild variant="secondary">
        <Link to="/">
          <ArrowLeft />
          {t('notFound.back')}
        </Link>
      </Button>
    </Card>
  );
}
