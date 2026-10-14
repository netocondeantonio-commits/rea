export const imageOf: (value: unknown) => string;

export const clampMb: (value: unknown) => number;

export const clampCpu: (value: unknown) => number;

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

export const sandboxConfigFrom: (settings?: {
  sandbox?: boolean;
  sandboxImage?: string;
  ramLimitMb?: number;
  sandboxCpus?: number;
}) => { enabled: boolean; image: string; memoryMb: number; cpus: number };

export const setSandboxConfig: (
  reader: () => {
    enabled: boolean;
    image: string;
    memoryMb: number;
    cpus: number;
  },
) => void;

export const readSandboxConfig: () => {
  enabled: boolean;
  image: string;
  memoryMb: number;
  cpus: number;
};

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

export const prepareSandbox: (
  input: {
    repo?: string;
    jobDir?: string;
    targetPath?: string;
    argv?: string[];
    engines?: Record<string, string>;
  },
  exists: (command: string) => Promise<boolean>,
) => Promise<
  | { enabled: false }
  | { enabled: true; blocked: true }
  | {
      enabled: true;
      command: string;
      args: string[];
      env: Record<string, string>;
    }
>;
