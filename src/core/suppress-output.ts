const SUPPRESSIBLE_CONSOLE_METHODS = ["log", "info", "debug", "warn"] as const;

// Real-world loggers (pino, morgan, winston's default console transport,
// etc.) write straight to the process streams instead of going through
// `console.*`, so patching console alone lets their output leak through.
const SUPPRESSIBLE_STREAMS = ["stdout", "stderr"] as const;

export async function withSuppressedOutput<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const originalConsole = SUPPRESSIBLE_CONSOLE_METHODS.map(
    (method) => [method, console[method]] as const,
  );
  for (const method of SUPPRESSIBLE_CONSOLE_METHODS) {
    console[method] = () => {};
  }

  const originalWrites = SUPPRESSIBLE_STREAMS.map(
    (stream) => [stream, process[stream].write] as const,
  );
  for (const stream of SUPPRESSIBLE_STREAMS) {
    process[stream].write = (() =>
      true) as (typeof process)[typeof stream]["write"];
  }

  try {
    return await fn();
  } finally {
    for (const [method, original] of originalConsole) {
      console[method] = original;
    }
    for (const [stream, original] of originalWrites) {
      process[stream].write = original;
    }
  }
}
