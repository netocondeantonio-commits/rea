import type { LocalAdmin } from "./local-admin-store.mjs";

export interface DashboardJob {
  id: string;
  target: string;
  state: string;
  directory: string;
  events: { message: string }[];
  abort?: AbortController;
  headline?: string;
  kind?: string;
  user?: string;
}

export const startLocalDashboard: (input: {
  options: {
    port: number;
    output: string;
    baseOutput?: string;
    adminDirectory?: string;
  };
  jobs: Map<string, DashboardJob>;
  dashboardPath: string;
  analyze: (job: DashboardJob, onUpdate: () => void) => Promise<void>;
  admin?: LocalAdmin;
  runRea?: (
    args: readonly string[],
    timeoutMs?: number,
  ) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
  commandExists?: (command: string) => Promise<boolean>;
}) => Promise<{ url: string; close: () => Promise<void> }>;
