/** Warten, bis `check` stimmt (alle 25 ms nachsehen), höchstens `ms` lang – sonst schlägt der Test fehl. */
export async function until(check: () => boolean | Promise<boolean>, ms = 6000): Promise<void> {
  const start = Date.now();
  const again = async (): Promise<void> => {
    if (await check()) return;
    if (Date.now() - start > ms) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 25));
    await again();
  };
  await again();
}
