/** Wiederholt `task`, bis es klappt – z. B. solange der Motor beim gemeinsamen Start noch hochfährt. */
export async function retry<T>(task: () => Promise<T>, tries: number, delayMs: number): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (tries <= 1) throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retry(task, tries - 1, delayMs);
  }
}
