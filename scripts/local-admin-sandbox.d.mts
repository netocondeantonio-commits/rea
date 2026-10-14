export const imageOf: (value: unknown) => string;

export const clampMb: (value: unknown) => number;

export const clampCpu: (value: unknown) => number;

export const sandboxModeOf: () => "docker" | "isolate";

export const sandboxFields: (
  value: {
    sandbox?: boolean;
    sandboxImage?: string;
    sandboxCpus?: number;
  } | null,
) => { sandbox: boolean; sandboxImage: string; sandboxCpus: number };

export const applySandboxSettings: (
  next: { sandbox?: boolean; sandboxImage?: string; sandboxCpus?: number },
  input: { sandbox?: boolean; sandboxImage?: string; sandboxCpus?: number },
) => void;

type SandboxConfig = {
  enabled: boolean;
  mode: "docker" | "isolate";
  image: string;
  memoryMb: number;
  cpus: number;
};

export const sandboxConfigFrom: (settings?: {
  sandbox?: boolean;
  sandboxImage?: string;
  ramLimitMb?: number;
  sandboxCpus?: number;
}) => SandboxConfig;

export const setSandboxConfig: (reader: () => SandboxConfig) => void;

export const readSandboxConfig: () => SandboxConfig;

export const setSandboxJob: (
  job: { directory?: string; resolved?: string } | undefined,
) => void;

export const sandboxJob: () => { directory: string; target: string };

export const sandboxArgs: (input: {
  image?: string;
  memoryMb?: number;
  cpus?: number;
  repo?: string;
  jobDir?: string;
  targetPath?: string;
  argv?: string[];
  engines?: Record<string, string>;
}) => string[];

export const isolateArgs: (input: {
  memoryMb?: number;
  cpus?: number;
  argv?: string[];
}) => string[];

export const prepareSandbox: (
  input: {
    repo?: string;
    jobDir?: string;
    targetPath?: string;
    argv?: string[];
    memoryMb?: number;
    engines?: Record<string, string | undefined>;
  },
  exists: (command: string) => Promise<boolean>,
) => Promise<
  | { enabled: false }
  | { enabled: true; blocked: true; reason: string }
  | {
      enabled: true;
      command: string;
      args: string[];
      env: Record<string, string>;
    }
>;
