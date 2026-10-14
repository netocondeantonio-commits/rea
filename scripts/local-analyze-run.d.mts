export const bindLocalAnalyzer: (tools: {
  runRea: (
    args: readonly string[],
    timeoutMs?: number,
    signal?: AbortSignal,
  ) => Promise<{
    ok: boolean;
    cancelled?: boolean;
    stdout: string;
    stderr: string;
  }>;
  commandExists: (command: string) => Promise<boolean>;
  detectTarget: (path: string) => Promise<string>;
  planSteps: (
    kind: string,
    path: string,
    signal?: AbortSignal,
  ) => Promise<{ id: string; title: string; skip?: string; args?: string[] }[]>;
  exists: (path: string) => Promise<boolean>;
  parseJson: (text: string) => unknown;
  factsFrom: (value: unknown) => string[];
  integritySecret?: () => string;
  onFinished?: (job: { id: string; state: string }) => Promise<void>;
}) => void;

export const analyze: (
  job: {
    id: string;
    target: string;
    state: string;
    directory: string;
    events: { message: string }[];
    steps: { id?: string; title?: string; ok?: boolean; skip?: string }[];
    abort?: AbortController;
    fast?: boolean;
    kind?: string;
    detected?: string;
    headline?: string;
    cpuNice?: number;
  },
  onUpdate: () => void,
) => Promise<void>;
