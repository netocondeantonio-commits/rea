export const uploadCap: () => number;

export const safeName: (raw: string) => string;

export const acceptedUpload: (name: string, bytes: Uint8Array) => boolean;

export const fileFromMultipart: (
  buffer: Buffer,
  type: string,
) => { name: string; bytes: Buffer } | undefined;

export const readUpload: (
  request: {
    headers: Record<string, string | undefined>;
    on: (event: string, listener: (chunk?: Buffer | Error) => void) => void;
    destroy: () => void;
  },
  max: number,
) => Promise<{ name: string; bytes: Buffer } | undefined>;

export const postUpload: (ctx: {
  request: {
    headers: Record<string, string | undefined>;
    on: (event: string, listener: (chunk?: Buffer | Error) => void) => void;
    destroy: () => void;
  };
  response: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string | Buffer) => void;
  };
  actor: { user: string };
  options: { output: string };
  admin: {
    audit: (entry: {
      user: string;
      action: string;
      detail?: string;
    }) => Promise<void>;
  };
  jobs: { set: (id: string, job: unknown) => void };
  analyze: (job: unknown, onUpdate: () => void) => Promise<void>;
}) => Promise<void>;
