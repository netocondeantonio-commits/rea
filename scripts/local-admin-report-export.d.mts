export const textToPdf: (title: string, body: string) => Buffer;

export const webhookRequest: (
  rawUrl: string,
  job: { id?: string; state?: string; target?: string; digest?: string },
  chatId?: string,
) => { url: string; body: Record<string, unknown> } | undefined;
