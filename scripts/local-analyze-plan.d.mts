export const createPlan: (tools: {
  mergedEnv: () => Record<string, string | undefined>;
  commandExists: (command: string) => Promise<boolean>;
  runRea: (
    args: string[],
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ) => Promise<{ ok: boolean }>;
}) => {
  planSteps: (
    kind: string,
    path: string,
    signal: AbortSignal | undefined,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      args?: string[];
      skip?: string;
      timeoutMs?: number;
    }>
  >;
};
