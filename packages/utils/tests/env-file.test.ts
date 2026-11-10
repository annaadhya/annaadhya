import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotEnvIfPresent } from "../src/env-file";

const PROBE_UNSET = "ENV_LOADER_PROBE_UNSET";
const PROBE_PRESET = "ENV_LOADER_PROBE_PRESET";

describe("loadDotEnvIfPresent", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    delete process.env[PROBE_UNSET];
    delete process.env[PROBE_PRESET];
    while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  });

  function tempEnvFile(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), "env-loader-test-"));
    tempDirs.push(dir);
    const file = join(dir, ".env");
    writeFileSync(file, content, "utf8");
    return file;
  }

  it("loads variables from the first existing candidate and ignores later ones", () => {
    const winner = tempEnvFile(`${PROBE_UNSET}=from-first\n`);
    const loser = tempEnvFile(`${PROBE_UNSET}=from-second\n`);
    expect(loadDotEnvIfPresent([winner, loser])).toBe(winner);
    expect(process.env[PROBE_UNSET]).toBe("from-first");
  });

  it("never overrides variables already present in the real environment", () => {
    process.env[PROBE_PRESET] = "from-shell";
    const file = tempEnvFile(`${PROBE_PRESET}=from-file\n`);
    loadDotEnvIfPresent([file]);
    expect(process.env[PROBE_PRESET]).toBe("from-shell");
  });

  it("expands \\n escapes inside double-quoted values (Node parser, valid PEM downstream)", () => {
    const file = tempEnvFile(`${PROBE_UNSET}="line-one\\nline-two"\n`);
    loadDotEnvIfPresent([file]);
    expect(process.env[PROBE_UNSET]).toBe("line-one\nline-two");
  });

  it("keeps literal backslash-n in unquoted values (shell `set` / export format)", () => {
    const file = tempEnvFile(`${PROBE_UNSET}=line-one\\nline-two\n`);
    loadDotEnvIfPresent([file]);
    expect(process.env[PROBE_UNSET]).toBe("line-one\\nline-two");
  });

  it("skips unparseable lines instead of throwing (Node parser behavior)", () => {
    const file = tempEnvFile(`malformed line without equals\n${PROBE_UNSET}=still-parsed\n`);
    expect(loadDotEnvIfPresent([file])).toBe(file);
    expect(process.env[PROBE_UNSET]).toBe("still-parsed");
  });

  it("returns null and touches nothing when no candidate exists", () => {
    const missing = join(tmpdir(), "definitely-missing-env-dir", ".env");
    expect(loadDotEnvIfPresent([missing])).toBeNull();
    expect(process.env[PROBE_UNSET]).toBeUndefined();
  });
});
