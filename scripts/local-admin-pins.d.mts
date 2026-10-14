export const pinnedDigest: (url: string) => string | undefined;

export const downloadPinned: (
  url: string,
  directory: string,
  signal?: AbortSignal,
) => Promise<string | undefined>;
