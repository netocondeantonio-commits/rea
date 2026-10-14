export const zipDirectory: (
  root: string,
  limits?: { fileCap?: number; totalCap?: number },
) => Promise<Buffer>;
