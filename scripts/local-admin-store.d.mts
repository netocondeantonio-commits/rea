export interface AdminUser {
  id: string;
  username: string;
  role: string;
  disabled: boolean;
}

export interface AdminSettings {
  outputDir: string;
  language: string;
  theme: string;
  engines: Record<string, string>;
}

export interface LocalAdmin {
  directory: string;
  secret: string;
  generatedPassword: string;
  authenticate: (
    username: string,
    password: string,
  ) => Promise<AdminUser | undefined>;
  listUsers: () => AdminUser[];
  createUser: (input: {
    username: string;
    password: string;
    role: string;
  }) => Promise<{ error?: string; error_en?: string; user?: AdminUser }>;
  updateUser: (
    id: string,
    input: { disabled?: boolean; role?: string; password?: string },
  ) => Promise<{ error?: string; error_en?: string; user?: AdminUser }>;
  deleteUser: (
    id: string,
  ) => Promise<{ error?: string; error_en?: string; ok?: boolean }>;
  listTargets: () => { id: string; target: string; kind: string }[];
  addTarget: (input: {
    target?: string;
    name?: string;
    kind?: string;
    note_pt?: string;
    note_en?: string;
  }) => Promise<{ error?: string; error_en?: string }>;
  removeTarget: (id: string) => Promise<{ ok?: boolean }>;
  readSettings: () => AdminSettings;
  writeSettings: (
    input: {
      outputDir?: string;
      language?: string;
      theme?: string;
      engines?: Record<string, string>;
    },
    role: string,
  ) => Promise<AdminSettings>;
  engineEnv: () => Record<string, string>;
  audit: (entry: {
    user: string;
    action: string;
    detail?: string;
  }) => Promise<void>;
  listAudit: () => Promise<Record<string, unknown>[]>;
}

export const canDeleteUser: (
  users: readonly { id: string; role: string; disabled?: boolean }[],
  id: string,
) => boolean;

export const openAdmin: (input: {
  directory: string;
  env?: Record<string, string | undefined>;
}) => Promise<LocalAdmin>;
