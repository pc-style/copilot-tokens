import blessed from "blessed";
import chokidar, { type FSWatcher } from "chokidar";
import {
  buildSnapshot,
  calcCost,
  defaultLogsDir,
  defaultSessionDir,
  fmtCost,
  fmtTokens,
  loadPricing,
  type PricingFile,
  type SectionKey,
  type Snapshot,
  type Stats,
} from "./usage";

type Options = {
  logsDir: string;
  sessionDir: string;
  refreshMs: number;
};

type SectionState = Record<SectionKey, boolean>;

const sectionLabels: Record<SectionKey, string> = {
  summary: "Summary",
  models: "Models",
  daily: "Daily",
  projects: "Projects",
  recent: "Recent",
  pricing: "Pricing",
};

const defaultSections: SectionState = {
  summary: true,
  models: true,
  daily: true,
  projects: true,
  recent: true,
  pricing: false,
};

export function startTui(options: Partial<Options> = {}) {
  const resolved: Options = {
    logsDir: options.logsDir ?? defaultLogsDir(),
    sessionDir: options.sessionDir ?? defaultSessionDir(),
    refreshMs: options.refreshMs ?? 1500,
  };

  const pricing = loadPricing();
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Copilot Tokens",
  });

  const sections = { ...defaultSections };
  const root = blessed.box({ parent: screen, top: 0, left: 0, width: "100%", height: "100%" });
  let snapshot: Snapshot | null = null;
  let refreshTimer: Timer | null = null;
  let watcher: FSWatcher | null = null;

  screen.key(["q", "C-c"], () => {
    if (refreshTimer) clearInterval(refreshTimer);
    void watcher?.close();
    return process.exit(0);
  });
  screen.key(["r"], () => refresh());
  screen.key(["s", "S"], () => openSettings(screen, sections, () => render()));

  const refresh = () => {
    snapshot = buildSnapshot(resolved.logsDir, resolved.sessionDir, pricing);
    render();
  };

  const render = () => {
    root.children.forEach((child) => child.detach());
    renderHeader(root, resolved, snapshot);

    const body = blessed.box({
      parent: root,
      top: 3,
      left: 0,
      width: "100%",
      height: "100%-3",
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: { ch: " ", track: { bg: "gray" }, style: { inverse: true } },
    });

    let top = 0;
    const snap = snapshot;
    if (!snap) {
      body.append(blessed.text({ top, content: "Loading..." }));
      screen.render();
      return;
    }

    if (sections.summary) top = addPanel(body, top, "Summary", summaryLines(snap, pricing));
    if (sections.models) top = addPanel(body, top, "By Model", modelLines(snap, pricing));
    if (sections.daily) top = addPanel(body, top, "By Day", aggregateLines(snap.byDay, snap.costByDay));
    if (sections.projects) top = addPanel(body, top, "By Project", aggregateLines(snap.byProject, snap.costByProject, 10));
    if (sections.recent) top = addPanel(body, top, "Recent Calls", recentLines(snap));
    if (sections.pricing) top = addPanel(body, top, "Pricing", pricingLines(pricing));

    body.setScrollPerc(0);
    screen.render();
  };

  refresh();
  refreshTimer = setInterval(refresh, resolved.refreshMs);
  watcher = chokidar.watch([resolved.logsDir, resolved.sessionDir], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
  });
  watcher.on("add", refresh).on("change", refresh).on("unlink", refresh);
}

function renderHeader(parent: blessed.Widgets.BoxElement, options: Options, snapshot: Snapshot | null) {
  const status = snapshot
    ? `${snapshot.records.length.toLocaleString()} calls  ${fmtTokens(snapshot.total.promptTokens + snapshot.total.completionTokens)} tokens  ${snapshot.scannedFiles} logs  updated ${snapshot.generatedAt.toLocaleTimeString()}`
    : "Loading";

  blessed.box({
    parent,
    top: 0,
    left: 0,
    height: 3,
    width: "100%",
    border: "line",
    style: { border: { fg: "cyan" } },
    content: ` Copilot Tokens  |  ${status}\n s settings  r refresh  q quit  |  ${options.logsDir}`,
  });
}

function addPanel(parent: blessed.Widgets.BoxElement, top: number, title: string, lines: string[]) {
  const height = Math.max(5, Math.min(lines.length + 2, title === "Recent Calls" ? 16 : 13));
  const box = blessed.box({
    parent,
    top,
    left: 0,
    width: "100%-1",
    height,
    border: "line",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    label: ` ${title} `,
    style: { border: { fg: "blue" }, label: { fg: "cyan" } },
    content: lines.length ? lines.join("\n") : "No data yet.",
  });
  box.setScrollPerc(0);
  return top + height + 1;
}

function summaryLines(snapshot: Snapshot, pricing: PricingFile) {
  const totalCost = totalCostForModels(snapshot.byModel, pricing);
  return [
    row("API calls", snapshot.total.apiCalls.toLocaleString(), "Premium req", snapshot.total.premiumRequests.toLocaleString()),
    row("Input", fmtTokens(snapshot.total.promptTokens), "Output", fmtTokens(snapshot.total.completionTokens)),
    row("Cache read", fmtTokens(snapshot.total.cacheReadTokens), "Cache write", fmtTokens(snapshot.total.cacheCreationTokens)),
    row("Estimated API cost", fmtCost(totalCost), "Log files", snapshot.scannedFiles.toLocaleString()),
    row("Log dir", snapshot.logsDir, "Session dir", snapshot.sessionDir),
  ];
}

function modelLines(snapshot: Snapshot, pricing: PricingFile) {
  return table(
    ["model", "calls", "in", "out", "cache", "premium", "cost"],
    [...snapshot.byModel.entries()]
      .sort((a, b) => calcCost(b[0], b[1], pricing) - calcCost(a[0], a[1], pricing))
      .map(([model, stats]) => [
        model,
        String(stats.apiCalls),
        fmtTokens(stats.promptTokens),
        fmtTokens(stats.completionTokens),
        fmtTokens(stats.cacheReadTokens + stats.cacheCreationTokens),
        String(stats.premiumRequests),
        fmtCost(calcCost(model, stats, pricing)),
      ]),
  );
}

function aggregateLines(map: Map<string, Stats>, costs: Map<string, number>, limit = 8) {
  return table(
    ["name", "calls", "tokens", "premium", "cost"],
    [...map.entries()]
      .sort((a, b) => b[1].promptTokens + b[1].completionTokens - (a[1].promptTokens + a[1].completionTokens))
      .slice(0, limit)
      .map(([name, stats]) => [
        name,
        String(stats.apiCalls),
        fmtTokens(stats.promptTokens + stats.completionTokens),
        String(stats.premiumRequests),
        fmtCost(costs.get(name) ?? 0),
      ]),
  );
}

function recentLines(snapshot: Snapshot) {
  return table(
    ["time", "model", "in", "out", "file"],
    snapshot.recent.map((record) => [
      record.timestamp ?? "unknown",
      record.modelNormalized,
      fmtTokens(record.promptTokens),
      fmtTokens(record.completionTokens),
      record.logFile,
    ]),
  );
}

function pricingLines(pricing: PricingFile) {
  return table(
    ["model", "in", "out", "cache read", "cache write", "premium"],
    Object.entries(pricing.model_pricing).map(([model, price]) => [
      model,
      `$${price.input}`,
      `$${price.output}`,
      `$${price.cache_read}`,
      `$${price.cache_write}`,
      String(pricing.premium_multiplier[model] ?? 1),
    ]),
  );
}

function totalCostForModels(map: Map<string, Stats>, pricing: PricingFile) {
  return [...map.entries()].reduce((sum, [model, stats]) => sum + calcCost(model, stats, pricing), 0);
}

function row(a: string, b: string, c: string, d: string) {
  return `${a.padEnd(20)} ${b.padEnd(18)} ${c.padEnd(16)} ${d}`;
}

function table(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.min(
      Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
      index === 0 ? 44 : 14,
    ),
  );
  const format = (cols: string[]) =>
    cols
      .map((col, index) => truncate(col, widths[index] ?? 10).padEnd(widths[index] ?? 10))
      .join("  ");
  return [`{bold}${format(headers)}{/bold}`, ...rows.map(format)];
}

function truncate(value: string, width: number) {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}~`;
}

function openSettings(screen: blessed.Widgets.Screen, sections: SectionState, onChange: () => void) {
  const overlay = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 48,
    height: 14,
    border: "line",
    label: " Settings ",
    tags: true,
    style: { border: { fg: "cyan" }, bg: "black" },
  });

  const list = blessed.list({
    parent: overlay,
    top: 1,
    left: 2,
    width: "100%-4",
    height: "100%-4",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      selected: { bg: "blue", fg: "white" },
      item: { fg: "white" },
    },
    items: sectionItems(sections),
  });

  blessed.text({
    parent: overlay,
    bottom: 0,
    left: 2,
    content: "space/enter toggle   esc close",
    style: { fg: "gray" },
  });

  const toggle = () => {
    const selectedIndex = (list as blessed.Widgets.ListElement & { selected: number }).selected;
    const key = Object.keys(sectionLabels)[selectedIndex] as SectionKey | undefined;
    if (!key) return;
    sections[key] = !sections[key];
    list.setItems(sectionItems(sections));
    list.select(Object.keys(sectionLabels).indexOf(key));
    onChange();
  };

  list.key(["space", "enter"], toggle);
  overlay.key(["escape", "q"], () => {
    overlay.detach();
    screen.render();
  });
  list.focus();
  screen.render();
}

function sectionItems(sections: SectionState) {
  return (Object.keys(sectionLabels) as SectionKey[]).map(
    (key) => `${sections[key] ? "[x]" : "[ ]"} ${sectionLabels[key]}`,
  );
}
