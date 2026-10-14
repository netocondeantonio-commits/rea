interface LocalAnalyzeJob {
  id: string;
  target: string;
  resolved?: string;
  detected?: string | null;
  directory: string;
  steps?: readonly {
    id: string;
    title: string;
    ok?: boolean;
    skip?: string;
    facts?: readonly string[];
    stderr?: string;
  }[];
  events: { message: string }[];
  package_slug?: string;
  artifacts?: readonly { href?: string }[];
  state?: string;
  headline?: string;
  report_markdown?: string;
}

interface LocalAnalyzeTools {
  commandExists?: (command: string) => Promise<boolean>;
  runRea: (
    args: readonly string[],
    timeoutMs?: number,
  ) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
  companions?: Readonly<Record<string, boolean>>;
}

export const writeLocalPackage: (
  job: LocalAnalyzeJob,
  tools: LocalAnalyzeTools,
) => Promise<void>;
