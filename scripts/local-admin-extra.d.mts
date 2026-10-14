export const takeHighest: (
  waiting: { job: { priority?: number; id?: string } }[],
) => { job: { priority?: number; id?: string } };

export const gateFast: (
  fast: boolean,
  kind: string,
) => { usePlan: boolean; skip: string };

export const isDue: (
  target: { everyMinutes?: number; nextRun?: string },
  now: number,
  busy: boolean,
) => boolean;

export const acceptedEngines: (input: {
  engines?: Record<string, unknown>;
  PATH?: string;
  GHIDRA_INSTALL_DIR?: string;
}) => Record<string, string>;

export const buildChecklist: (
  job: {
    steps?: { id?: string; ok?: boolean; skip?: string; facts?: string[] }[];
  },
  text: string,
) => {
  disclaimer: string;
  items: { id: string; status: string; observation: string }[];
};

export const writeHashes: (
  directory: string,
  secret: string,
) => Promise<{ digest: string; signature: string }>;

export const diffSets: (
  leftText: string,
  rightText: string,
  cap?: number,
) => { added: string[]; removed: string[] };
