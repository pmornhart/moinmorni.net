import { useEffect, useState } from 'react';

/** A value that follows `value` only after it stayed the same for `ms` (e.g. a search while typing). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
