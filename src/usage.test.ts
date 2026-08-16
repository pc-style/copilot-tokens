import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { buildSnapshot, loadPricing } from "./usage";

test("buildSnapshot parses Copilot log token usage and session workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "copilot-tokens-"));
  const logsDir = join(root, "logs");
  const sessionDir = join(root, "session-state");
  const sessionId = "11111111-1111-1111-1111-111111111111";

  try {
    mkdirSync(logsDir, { recursive: true });
    mkdirSync(join(sessionDir, sessionId), { recursive: true });
    writeFileSync(join(sessionDir, sessionId, "workspace.yaml"), `cwd: ${join(homedir(), "projects/demo")}\n`);
    writeFileSync(
      join(logsDir, "process-test.log"),
      [
        `2026-05-04T18:20:00.000Z Workspace initialized: ${sessionId}`,
        "2026-05-04T18:20:01.000Z PremiumRequestProcessor: Setting X-Initiator to 'user'",
        '2026-05-04T18:20:02.000Z {"model":"gpt-5.2-codex"}',
        '2026-05-04T18:20:03.000Z {"usage":{"prompt_tokens":123456,"completion_tokens":7890,"cache_read_input_tokens":12000,"cache_creation_input_tokens":500}}',
      ].join("\n"),
    );

    const snapshot = buildSnapshot(logsDir, sessionDir, loadPricing());

    expect(snapshot.scannedFiles).toBe(1);
    expect(snapshot.total.apiCalls).toBe(1);
    expect(snapshot.total.promptTokens).toBe(123456);
    expect(snapshot.total.completionTokens).toBe(7890);
    expect(snapshot.total.cacheReadTokens).toBe(12000);
    expect(snapshot.total.cacheCreationTokens).toBe(500);
    expect(snapshot.total.premiumRequests).toBe(1);
    expect(snapshot.byModel.get("gpt-5.2-codex")?.apiCalls).toBe(1);
    expect(snapshot.byProject.get("~/projects/demo")?.apiCalls).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
