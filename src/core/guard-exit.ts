// A target entry file that calls process.exit() (e.g. on a failed DB
// connection) would kill the whole CLI before our try/catch sees it. Make
// it throw instead, so it surfaces as a normal, catchable error.
export async function withGuardedExit<T>(fn: () => Promise<T>): Promise<T> {
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    throw new Error(
      `The ORM entry file called process.exit(${code ?? 0}) while orm2erd was loading it — likely an import-time side effect (e.g. a database connection attempt). orm2erd only reads schema metadata and never needs a live DB connection; check the entry file for such side effects.`,
    );
  }) as typeof process.exit;
  try {
    return await fn();
  } finally {
    process.exit = originalExit;
  }
}
