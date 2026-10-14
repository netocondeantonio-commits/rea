export const hashPassword: (password: string) => Promise<string>;

export const verifyPassword: (
  password: string,
  stored: string,
) => Promise<boolean>;

export const signSession: (
  secret: string,
  payload: { user: string; role: string; exp: number },
) => string;

export const readSessionToken: (
  secret: string,
  token: string | undefined,
) => { user: string; role?: string; exp: number } | undefined;

export const bearerMatches: (
  header: string | undefined,
  token: string | undefined,
) => boolean;

export const parseCookies: (
  header: string | undefined,
) => Record<string, string>;

export const loginAllowed: (username: string) => boolean;

export const noteLogin: (username: string, ok: boolean) => void;

export const loadEnvFile: (path: string) => Promise<void>;

export const randomPassword: () => string;
