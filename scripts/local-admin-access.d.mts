export const isPrivateAddress: (raw: string) => boolean;

export const publicHttpUrl: (raw: string) => URL | undefined;

export const bindAddress: (
  host: string | undefined,
  port: number | string,
) => { host: string; port: number; error?: undefined } | { error: string };

export const canSeeJob: (
  actor: { user: string; role: string } | undefined,
  job: { user?: string } | undefined,
) => boolean;

export const canSeeTarget: (
  actor: { user: string; role: string } | undefined,
  target: { owner?: string } | undefined,
) => boolean;

export const targetWrite: (
  actor: { user: string; role: string },
  target: { owner?: string } | undefined,
) => "ok" | "missing" | "forbidden";

export const guardJobs: <T extends { user?: string }>(
  jobs: Map<string, T>,
  actor: { user: string; role: string },
) => {
  get: (id: string) => T | undefined;
  has: (id: string) => boolean;
  values: () => T[];
  set: (id: string, job: T) => Map<string, T>;
};

export const allowRequest: (
  key: string,
  limit: number,
  windowMs: number,
  now?: number,
) => boolean;

export const resetLimits: () => void;

export const clientAddress: (request: {
  headers?: Record<string, string | undefined>;
  socket?: { remoteAddress?: string };
}) => string;

export const demoAllowsTarget: (target: string, uploadRoot?: string) => boolean;

export const applySecurityHeaders: (response: {
  setHeader: (name: string, value: string) => void;
}) => void;

export const corsHeaders: (request: {
  headers?: Record<string, string | undefined>;
}) => Record<string, string>;

export const prepareHeaders: (ctx: {
  request: { headers?: Record<string, string | undefined> };
  response: { setHeader: (name: string, value: string) => void };
}) => void;

export const rejectIfLimited: (
  ctx: {
    request: {
      headers?: Record<string, string | undefined>;
      socket?: { remoteAddress?: string };
    };
    response: {
      setHeader: (name: string, value: string) => void;
      writeHead: (status: number, headers: Record<string, string>) => void;
      end: (body?: string) => void;
    };
  },
  pathname: string,
) => boolean;

export const ensureDemoUser: (admin: {
  listUsers: () => { username: string }[];
  createUser: (input: {
    username: string;
    password: string;
    role: string;
  }) => Promise<{ error?: string }>;
}) => Promise<string>;

export const shownHost: (host: string) => string;
