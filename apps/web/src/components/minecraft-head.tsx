import { useState, type ReactElement } from 'react';
import { apiUrl } from '@/lib/api';
import { cn } from '~/lib/cn';

/**
 * A team member's face: the head of their linked Minecraft account (the motor fetches the skin from Mojang), else the
 * first letter of their name.
 */
export function MinecraftHead({
  uuid,
  name,
  className,
  letterClassName,
}: {
  readonly uuid: string | null;
  readonly name: string;
  /** Size, radius and background – for the head and the letter alike. */
  readonly className?: string;
  /** Extra classes for the letter (e.g. its colour on the dark band). */
  readonly letterClassName?: string;
}): ReactElement {
  const [failed, setFailed] = useState<string | null>(null);
  if (uuid && failed !== uuid) {
    return (
      <img
        src={apiUrl(`/api/heads/${encodeURIComponent(uuid)}`)}
        alt=""
        className={cn('shrink-0 [image-rendering:pixelated]', className)}
        onError={() => setFailed(uuid)}
      />
    );
  }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center font-display font-semibold uppercase',
        className,
        letterClassName,
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}
