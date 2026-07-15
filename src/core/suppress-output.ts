const SUPPRESSIBLE_CONSOLE_METHODS = ["log", "info", "debug", "warn"] as const;

export async function withSuppressedOutput<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const originals = SUPPRESSIBLE_CONSOLE_METHODS.map(
    (method) => [method, console[method]] as const,
  );
  for (const method of SUPPRESSIBLE_CONSOLE_METHODS) {
    console[method] = () => {};
  }
  try {
    return await fn();
  } finally {
    for (const [method, original] of originals) {
      console[method] = original;
    }
  }
}
