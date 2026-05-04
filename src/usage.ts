import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

export type SectionKey = "summary" | "models" | "daily" | "projects" | "recent" | "pricing";

export type Pricing = {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
};

export type PricingFile = {
  premium_request_cost: number;
  model_pricing: Record<string, Pricing>;
  premium_multiplier: Record<string, number>;
};

export type RecordEntry = {
  model: string;
  modelNormalized: string;
  promptTokens: number;
  completionTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  isUserTurn: boolean;
  timestamp: string | null;
  sessionId: string | null;
  logFile: string;
};

export type Stats = {
  apiCalls: number;
  promptTokens: number;
  completionTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  premiumRequests: number;
};

export type Snapshot = {
  generatedAt: Date;
  logsDir: string;
  sessionDir: string;
  scannedFiles: number;
  records: RecordEntry[];
  total: Stats;
  byModel: Map<string, Stats>;
  byDay: Map<string, Stats>;
  byProject: Map<string, Stats>;
  costByDay: Map<string, number>;
  costByProject: Map<string, number>;
  recent: RecordEntry[];
};

const modelLooksReal = (model: string) =>
  !model.startsWith("{") && /(claude|gpt|gemini)/i.test(model);

export function defaultLogsDir() {
  return join(homedir(), ".copilot", "logs");
}

export function defaultSessionDir() {
  return join(homedir(), ".copilot", "session-state");
}

export function loadPricing(path = "pricing.json"): PricingFile {
  return JSON.parse(readFileSync(path, "utf8")) as PricingFile;
}

export function normalizeModel(modelName: string) {
  let name = modelName;
  for (const prefix of ["sweagent-capi:", "capi:"]) {
    if (name.startsWith(prefix)) name = name.slice(prefix.length);
  }
  return name
    .replace(/^capi-[a-z]+-ptuc-[a-z0-9]+(?:-ib)?-/, "")
    .replace(/:defaultReasoningEffort=\w+/, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

export function getPricing(model: string, pricing: PricingFile) {
  const normalized = normalizeModel(model);
  if (pricing.model_pricing[normalized]) return pricing.model_pricing[normalized];
  for (const key of Object.keys(pricing.model_pricing)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return pricing.model_pricing[key];
    }
  }
  return null;
}

export function getPremiumMultiplier(model: string, pricing: PricingFile) {
  const normalized = normalizeModel(model);
  if (normalized in pricing.premium_multiplier) return pricing.premium_multiplier[normalized] ?? 1;
  for (const key of Object.keys(pricing.premium_multiplier)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return pricing.premium_multiplier[key] ?? 1;
    }
  }
  return 1;
}

export function emptyStats(): Stats {
  return {
    apiCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    premiumRequests: 0,
  };
}

function addStats(stats: Stats, record: RecordEntry, pricing: PricingFile) {
  stats.apiCalls += 1;
  stats.promptTokens += record.promptTokens;
  stats.completionTokens += record.completionTokens;
  stats.cacheCreationTokens += record.cacheCreationTokens;
  stats.cacheReadTokens += record.cacheReadTokens;
  if (record.isUserTurn) stats.premiumRequests += getPremiumMultiplier(record.modelNormalized, pricing);
}

export function parseLogFile(logPath: string): RecordEntry[] {
  const content = readFileSync(logPath, "utf8");
  const lines = content.split("\n");
  const records: RecordEntry[] = [];

  let lastModel = "unknown";
  let lastTimestamp: string | null = null;
  let lastSession: string | null = null;
  let lastInitiator = "agent";

  const tsRe = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/;
  const sessionRe = /(?:Workspace initialized|Created ACP session|Flushed \d+ events to session)[: ]+([0-9a-f-]{36})/;
  const initiatorRe = /PremiumRequestProcessor: Setting X-Initiator to '(\w+)'/;
  const modelRe = /"model"\s*:\s*"([^"]+)"/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const tsMatch = tsRe.exec(line);
    if (tsMatch?.[1]) lastTimestamp = tsMatch[1];

    const sessionMatch = sessionRe.exec(line);
    if (sessionMatch?.[1]) lastSession = sessionMatch[1];

    const initiatorMatch = initiatorRe.exec(line);
    if (initiatorMatch?.[1]) lastInitiator = initiatorMatch[1];

    const modelMatch = modelRe.exec(line);
    if (modelMatch?.[1] && modelLooksReal(modelMatch[1])) lastModel = modelMatch[1];

    if (!line.includes('"completion_tokens"')) continue;

    const blockStart = Math.max(0, i - 10);
    const blockEnd = Math.min(lines.length, i + 15);
    const block = lines.slice(blockStart, blockEnd).join("\n");
    const promptMatch = /"prompt_tokens"\s*:\s*(\d+)/.exec(block);
    const completionMatch = /"completion_tokens"\s*:\s*(\d+)/.exec(block);
    if (!promptMatch?.[1] || !completionMatch?.[1]) continue;

    const blockModelMatch = modelRe.exec(block);
    if (blockModelMatch?.[1] && modelLooksReal(blockModelMatch[1])) lastModel = blockModelMatch[1];

    const cacheCreationMatch = /"cache_creation_input_tokens"\s*:\s*(\d+)/.exec(block);
    const cacheReadMatch = /"cache_read_input_tokens"\s*:\s*(\d+)/.exec(block);
    const cachedTokensMatch = /"cached_tokens"\s*:\s*(\d+)/.exec(block);
    const cacheRead = Number(cacheReadMatch?.[1] ?? cachedTokensMatch?.[1] ?? 0);

    records.push({
      model: lastModel,
      modelNormalized: normalizeModel(lastModel),
      promptTokens: Number(promptMatch[1]),
      completionTokens: Number(completionMatch[1]),
      cacheCreationTokens: Number(cacheCreationMatch?.[1] ?? 0),
      cacheReadTokens: cacheRead,
      isUserTurn: lastInitiator === "user",
      timestamp: lastTimestamp,
      sessionId: lastSession,
      logFile: basename(logPath),
    });
    lastInitiator = "agent";
  }

  return records;
}

export function loadSessionWorkspaces(sessionDir: string) {
  const workspaces = new Map<string, string>();
  if (!existsSync(sessionDir)) return workspaces;
  for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workspaceFile = join(sessionDir, entry.name, "workspace.yaml");
    if (!existsSync(workspaceFile)) continue;
    const cwd = /cwd:\s*(.+)/.exec(readFileSync(workspaceFile, "utf8"))?.[1]?.trim();
    if (cwd) workspaces.set(entry.name, cwd);
  }
  return workspaces;
}

export function buildSnapshot(logsDir: string, sessionDir: string, pricing: PricingFile): Snapshot {
  const files = existsSync(logsDir)
    ? readdirSync(logsDir)
        .filter((file) => file.startsWith("process-") && file.endsWith(".log"))
        .map((file) => join(logsDir, file))
        .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
    : [];

  const workspaces = loadSessionWorkspaces(sessionDir);
  const records = files.flatMap(parseLogFile);
  const total = emptyStats();
  const byModel = new Map<string, Stats>();
  const byDay = new Map<string, Stats>();
  const byProject = new Map<string, Stats>();
  const costByDay = new Map<string, number>();
  const costByProject = new Map<string, number>();

  for (const record of records) {
    addStats(total, record, pricing);
    addStats(getOrCreate(byModel, record.modelNormalized), record, pricing);
    const day = record.timestamp?.slice(0, 10) ?? "unknown";
    const project = projectName(workspaces.get(record.sessionId ?? "") ?? "unknown");
    addStats(getOrCreate(byDay, day), record, pricing);
    addStats(getOrCreate(byProject, project), record, pricing);
    addCost(costByDay, day, record, pricing);
    addCost(costByProject, project, record, pricing);
  }

  return {
    generatedAt: new Date(),
    logsDir,
    sessionDir,
    scannedFiles: files.length,
    records,
    total,
    byModel,
    byDay,
    byProject,
    costByDay,
    costByProject,
    recent: [...records]
      .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
      .slice(0, 12),
  };
}

function getOrCreate(map: Map<string, Stats>, key: string) {
  const current = map.get(key);
  if (current) return current;
  const stats = emptyStats();
  map.set(key, stats);
  return stats;
}

function addCost(map: Map<string, number>, key: string, record: RecordEntry, pricing: PricingFile) {
  map.set(key, (map.get(key) ?? 0) + calcCost(record.modelNormalized, oneRecordStats(record), pricing));
}

function oneRecordStats(record: RecordEntry): Stats {
  return {
    apiCalls: 1,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    cacheCreationTokens: record.cacheCreationTokens,
    cacheReadTokens: record.cacheReadTokens,
    premiumRequests: 0,
  };
}

export function calcCost(model: string, stats: Stats, pricingFile: PricingFile) {
  const pricing = getPricing(model, pricingFile);
  if (!pricing) return 0;
  const netInput = Math.max(0, stats.promptTokens - stats.cacheReadTokens - stats.cacheCreationTokens);
  return (
    (netInput / 1e6) * pricing.input +
    (stats.completionTokens / 1e6) * pricing.output +
    (stats.cacheReadTokens / 1e6) * pricing.cache_read +
    (stats.cacheCreationTokens / 1e6) * pricing.cache_write
  );
}

export function fmtTokens(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function fmtCost(cost: number) {
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(3)}`;
}

export function projectName(cwd: string) {
  return cwd.replace(homedir(), "~");
}
