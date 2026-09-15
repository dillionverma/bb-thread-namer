import { beforeEach, describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin, { type RenameResult } from "./server";

const PLUGIN_ID = "thread-namer";
const THREAD_ID = "thr_named";
const WORKER_ID = "thr_worker";

/**
 * A host whose thread area behaves like the one a naming run walks through:
 * the thread being named, its outline, the spawned worker and the worker's
 * answer.
 */
function createHost(options: {
  thread?: Partial<Parameters<typeof makeThreadResponse>[0]>;
  outline?: { role: "user" | "assistant"; preview: string }[];
  answer?: string;
  sourceTitle?: string;
  settings?: Record<string, string>;
}) {
  const thread = makeThreadResponse({
    id: THREAD_ID,
    projectId: "proj_1",
    environmentId: "env_1",
    providerId: "claude",
    title: null,
    ...options.thread,
  });
  const outline = options.outline ?? [
    { role: "user" as const, preview: "The login test fails on CI" },
  ];

  const updates: { threadId: string; title?: string | null }[] = [];
  const spawns: Record<string, unknown>[] = [];
  const record = (args: unknown) => {
    spawns.push(args as Record<string, unknown>);
  };

  const host = createFakePluginHost({
    pluginId: PLUGIN_ID,
    ...(options.settings ? { settings: options.settings } : {}),
    sdk: {
      providers: {
        list: async () => [
          {
            id: "claude",
            displayName: "Claude Code",
            available: true,
            capabilities: { permissionModes: ["auto", "full"] },
          },
        ],
      },
      threads: {
        get: async ({ threadId }: { threadId: string }) =>
          threadId === THREAD_ID
            ? thread
            : options.sourceTitle && threadId === "thr_source"
            ? makeThreadResponse({ id: threadId, title: options.sourceTitle })
            : makeThreadResponse({
                id: threadId,
                status: "idle",
                visibility: "hidden",
                originPluginId: PLUGIN_ID,
              }),
        conversationOutline: async () => ({
          items: outline.map((item, index) => ({
            id: `msg_${index}`,
            role: item.role,
            preview: item.preview,
            attachmentSummary: null,
          })),
          maxSeq: outline.length * 2,
        }),
        spawn: async (args: unknown) => {
          record(args);
          return makeThreadResponse({ id: WORKER_ID, visibility: "hidden" });
        },
        wait: async () => ({
          event: {
            type: "turn/completed",
            data: { status: "completed", error: null },
          },
        }),
        output: async () => ({ output: options.answer ?? "Flaky login test" }),
        update: async (args: { threadId: string; title?: string | null }) => {
          updates.push(args);
          Object.assign(thread, args);
          return thread;
        },
        stop: async () => thread,
        delete: async () => ({ ok: true }),
        archive: async () => thread,
      },
    },
  });

  return { ...host, updates, spawns, thread, outline };
}

async function load(host: ReturnType<typeof createHost>) {
  await plugin(host.bb);
}

describe("naming a thread", () => {
  it("writes the cleaned answer onto the thread", async () => {
    const host = createHost({ answer: '"Flaky login test."' });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", {
      threadId: THREAD_ID,
    })) as RenameResult;

    expect(result).toEqual({ ok: true, title: "Flaky login test" });
    expect(host.updates).toEqual([
      { threadId: THREAD_ID, title: "Flaky login test" },
    ]);
  });

  it("runs on the thread's own agent, on its smallest model, by default", async () => {
    const host = createHost({});
    await withCatalog(host, { claude: [
      { model: "claude-opus-5", efforts: ["low", "high"] },
      { model: "claude-haiku-4-5", efforts: ["none", "low", "high"] },
    ] });

    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });

    expect(host.spawns).toHaveLength(1);
    expect(host.spawns[0]).toMatchObject({
      providerId: "claude",
      model: "claude-haiku-4-5",
      reasoningLevel: "low",
      visibility: "hidden",
      // The named thread's environment, so naming provisions no worktree.
      environment: { type: "reuse", environmentId: "env_1" },
      // Naming needs no tools, so the least privileged supported mode is used.
      permissionMode: "auto",
    });
  });

  it("leaves the model to the agent when the catalogue lists no small one", async () => {
    const host = createHost({});
    await load(host);

    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });

    expect(host.spawns[0]).toMatchObject({ providerId: "claude" });
    expect(host.spawns[0]).not.toHaveProperty("model");
    expect(host.spawns[0]).not.toHaveProperty("reasoningLevel");
  });

  it("runs on the picked agent once one is chosen", async () => {
    const host = createHost({});
    await load(host);

    await host.harness.behavior.callRpc("selectAgent", {
      selection: {
        providerId: "codex",
        model: "gpt-5",
        reasoningLevel: "low",
      },
    });
    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });

    expect(host.spawns[0]).toMatchObject({
      providerId: "codex",
      model: "gpt-5",
      reasoningLevel: "low",
    });
  });

  it("stops and deletes its worker thread", async () => {
    const host = createHost({});
    await load(host);

    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });

    const calls = host.harness.inspection.sdk.calls.map((call) => call.path);
    expect(calls).toContain("threads.stop");
    expect(calls).toContain("threads.delete");
  });

  it("reports an empty answer instead of blanking the title", async () => {
    const host = createHost({ answer: "  \n " });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", {
      threadId: THREAD_ID,
    })) as RenameResult;

    expect(result).toMatchObject({ ok: false });
    expect(host.updates).toEqual([]);
  });

  it("refuses a thread with nothing said in it yet", async () => {
    const host = createHost({ outline: [] });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", {
      threadId: THREAD_ID,
    })) as RenameResult;

    expect(result).toMatchObject({ ok: false });
    expect(host.updates).toEqual([]);
  });

  it("renames a hand-named thread when asked directly", async () => {
    const host = createHost({ thread: { title: "My own name" } });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", {
      threadId: THREAD_ID,
    })) as RenameResult;

    expect(result).toMatchObject({ ok: true });
  });

  it("still refuses a hidden thread when asked directly", async () => {
    const host = createHost({ thread: { visibility: "hidden" } });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", {
      threadId: THREAD_ID,
    })) as RenameResult;

    expect(result).toMatchObject({ ok: false });
    expect(host.updates).toEqual([]);
  });
});

describe("naming on thread.idle", () => {
  it("names an untitled thread once its turn is over", async () => {
    const host = createHost({});
    await load(host);

    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: THREAD_ID }),
      lastAssistantText: "done",
    });
    await settle();

    expect(host.updates).toEqual([
      { threadId: THREAD_ID, title: "Flaky login test" },
    ]);
  });

  it("names a thread only once in the default mode", async () => {
    const host = createHost({});
    await load(host);
    const idle = () =>
      host.harness.behavior.emitThreadEvent("thread.idle", {
        thread: makeThreadResponse({ id: THREAD_ID }),
        lastAssistantText: "done",
      });

    await idle();
    await settle();
    // The thread now carries the name this plugin wrote.
    host.updates.length = 0;
    const named = createHostWithTitle(host, "Flaky login test");
    await named();
    await idle();
    await settle();

    expect(host.updates).toEqual([]);
  });

  it("leaves the thread alone when automatic naming is off", async () => {
    const host = createHost({
      settings: { mode: "Never name threads automatically" },
    });
    await load(host);

    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: THREAD_ID }),
      lastAssistantText: "done",
    });
    await settle();

    expect(host.updates).toEqual([]);
  });

  it("ignores its own hidden worker going idle", async () => {
    const host = createHost({});
    await load(host);

    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({
        id: WORKER_ID,
        visibility: "hidden",
        originPluginId: PLUGIN_ID,
      }),
      lastAssistantText: "Flaky login test",
    });
    await settle();

    expect(host.updates).toEqual([]);
  });
});

describe("the CLI command", () => {
  it("names the calling thread when no id is given", async () => {
    const host = createHost({});
    await load(host);

    const result = await host.harness.behavior.runCli(["rename"], {
      threadId: THREAD_ID,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("Flaky login test");
  });

  it("asks for a thread id when it has none", async () => {
    const host = createHost({});
    await load(host);

    const result = await host.harness.behavior.runCli(["rename"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("thread id");
  });

  it("reports how naming is configured", async () => {
    const host = createHost({});
    await load(host);

    const result = await host.harness.behavior.runCli(["status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Automatic naming:");
    expect(result.stdout).toContain("the thread's own agent");
  });

  it("rejects an unknown subcommand", async () => {
    const host = createHost({});
    await load(host);

    const result = await host.harness.behavior.runCli(["nope"]);

    expect(result.exitCode).toBe(2);
  });
});

/**
 * Re-point the fake `threads.get` at a thread that now carries the generated
 * title, the way the real thread row would after an update.
 */
function createHostWithTitle(
  host: ReturnType<typeof createHost>,
  title: string,
) {
  return async () => {
    host.harness.sdk.stub("threads.get", async ({ threadId }) =>
      makeThreadResponse({
        id: threadId as string,
        projectId: "proj_1",
        environmentId: "env_1",
        providerId: "claude",
        title,
      }),
    );
  };
}

/** Let the fire-and-forget event handler finish. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Give every agent a catalogue and wait for discovery to finish. */
async function withCatalog(
  host: ReturnType<typeof createHost>,
  models: Record<string, { model: string; efforts?: string[] }[]>,
) {
  host.harness.sdk.stub("providers.models", async ({ providerId }: { providerId: string }) => ({
    modelLoadError: null,
    selectedOnlyModels: [],
    models: (models[providerId] ?? []).map((entry) => ({
      model: entry.model,
      displayName: entry.model,
      description: "",
      supportedReasoningEfforts: (entry.efforts ?? []).map((level) => ({ reasoningEffort: level, description: "" })),
      defaultReasoningEffort: "medium",
    })),
  }));
  await load(host);
  // Discovery answers early and fills in behind; wait for the whole round.
  for (let round = 0; round < 20; round += 1) {
    const snapshot = (await host.harness.behavior.callRpc("catalog", { refresh: round === 0 })) as { pending: string[]; discovering: boolean };
    if (snapshot.pending.length === 0 && !snapshot.discovering) break;
    await settle();
  }
}


describe("continuation naming", () => {
  const continuation = [{ role: "user" as const, preview: "Continue from @thread:thr_source" }];
  it("inherits on creation without running a worker, including before an outline exists", async () => {
    const host = createHost({ sourceTitle: "BB observability", outline: [],
      thread: { titleFallback: continuation[0]!.preview } });
    await load(host);
    await host.harness.behavior.emitThreadEvent("thread.created", { thread: host.thread });
    await settle();
    expect(host.thread.title).toBe("BB observability");
    expect(host.spawns).toHaveLength(0);
  });
  it("keeps the inherited topic when the worker fails", async () => {
    const host = createHost({ sourceTitle: "BB observability", outline: [
      ...continuation, { role: "user", preview: "Add trace filtering" },
    ] });
    host.harness.sdk.stub("threads.wait", async () => { throw new Error("failed"); });
    await load(host);
    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });
    expect(host.thread.title).toBe("BB observability");
    expect(host.spawns[0]?.prompt).toContain('Original thread topic: "BB observability"');
  });
  it("refines a provisional title in once mode when meaningful context arrives", async () => {
    const host = createHost({ sourceTitle: "BB observability", outline: [...continuation], answer: "Trace filtering" });
    await load(host);
    await host.harness.behavior.runCli(["inherit", THREAD_ID]);
    host.outline.push({ role: "user", preview: "Add trace filtering" });
    await host.harness.behavior.emitThreadEvent("thread.idle", { thread: host.thread, lastAssistantText: "Done" });
    await settle();
    expect(host.thread.title).toBe("Trace filtering");
  });
  it("names a continuation from its reply when the source has no title", async () => {
    const host = createHost({ answer: "Quick handoff button", outline: [
      ...continuation,
      { role: "assistant", preview: "Yes — a threadHeaderAction plus threads.fork does it." },
    ] });
    await load(host);
    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });
    expect(host.spawns).toHaveLength(1);
    expect(host.thread.title).toBe("Quick handoff button");
  });
  it("reads the source id when the next line was glued onto the link", async () => {
    // Real ids are ten characters; the fallback title drops the newline
    // between the link and what the person typed next.
    const host = createHost({
      outline: [{ role: "user", preview: "Continue from @thread:thr_abc123def4continue" }] });
    host.harness.sdk.stub("threads.get", async ({ threadId }: { threadId: string }) =>
      threadId === THREAD_ID ? { ...host.thread }
        : makeThreadResponse({ id: threadId, title: threadId === "thr_abc123def4" ? "BB observability" : null }));
    await load(host);
    await host.harness.behavior.runCli(["inherit", THREAD_ID]);
    expect(host.thread.title).toBe("BB observability");
  });
  it("does not invent a title for an unresolved bare continuation", async () => {
    const host = createHost({ outline: continuation });
    await load(host);
    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });
    expect(host.updates).toHaveLength(0);
    expect(host.spawns).toHaveLength(0);
  });
  it("preserves manual titles during inheritance and worker completion", async () => {
    const host = createHost({ sourceTitle: "BB observability", outline: continuation,
      thread: { title: "My title" } });
    await load(host);
    await host.harness.behavior.runCli(["inherit", THREAD_ID]);
    expect(host.updates).toHaveLength(0);
    host.outline.push({ role: "user", preview: "Add trace filtering" });
    host.harness.sdk.stub("threads.output", async () => {
      host.thread.title = "Manual edit while naming";
      return { output: "Trace filtering" };
    });
    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });
    expect(host.thread.title).toBe("Manual edit while naming");
    expect(host.updates).toHaveLength(0);
  });
  it("does not inherit when automatic naming is off", async () => {
    const host = createHost({ sourceTitle: "BB observability", outline: continuation,
      settings: { mode: "Never name threads automatically" } });
    await load(host);
    await host.harness.behavior.runCli(["inherit", THREAD_ID]);
    expect(host.updates).toHaveLength(0);
  });
});


describe("continuation chains", () => {
  it("resolves an unnamed source chain and stops on cycles", async () => {
    const host = createHost({ outline: [{ role: "user", preview: "Continue from @thread:thr_source" }] });
    let cycle = false;
    host.harness.sdk.stub("threads.get", async ({ threadId }: { threadId: string }) => {
      if (threadId === THREAD_ID) return { ...host.thread };
      if (threadId === "thr_source") return makeThreadResponse({ id: threadId, title: null,
        titleFallback: "Continue from @thread:thr_original" });
      return makeThreadResponse({ id: threadId, title: cycle ? null : "Original task",
        titleFallback: "Continue from @thread:thr_source" });
    });
    await load(host);
    await host.harness.behavior.runCli(["inherit", THREAD_ID]);
    expect(host.thread.title).toBe("Original task");
    host.thread.title = null;
    host.updates.length = 0;
    cycle = true;
    await host.harness.behavior.runCli(["inherit", THREAD_ID]);
    expect(host.updates).toHaveLength(0);
    expect(host.spawns).toHaveLength(0);
  });
});


describe("agent fallback", () => {
  function twoProviders(host: ReturnType<typeof createHost>) {
    host.harness.sdk.stub("providers.list", async () => [
      { id: "claude", displayName: "Claude Code", available: true, capabilities: { permissionModes: ["auto", "full"] } },
      { id: "codex", displayName: "Codex", available: true, capabilities: { permissionModes: ["full"] } },
      { id: "pi", displayName: "Pi", available: false, capabilities: { permissionModes: ["full"] } },
    ]);
  }

  it("tries another signed-in agent when the thread's own agent fails", async () => {
    const host = createHost({});
    twoProviders(host);
    let attempts = 0;
    host.harness.sdk.stub("threads.wait", async () => {
      attempts += 1;
      return { event: { type: "turn/completed", data: attempts === 1
        ? { status: "failed", error: { message: "429 Too Many Requests" } }
        : { status: "completed", error: null } } };
    });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID })) as RenameResult;

    expect(result).toEqual({ ok: true, title: "Flaky login test" });
    expect(host.spawns.map((spawn) => spawn.providerId)).toEqual(["claude", "codex"]);
    // The fallback agent runs on its own default model, with its own least
    // privileged mode, not the failed agent's settings.
    expect(host.spawns[1]).not.toHaveProperty("model");
    expect(host.spawns[1]).toMatchObject({ permissionMode: "full" });
  });

  it("prefers a small model when the catalogue lists one", async () => {
    const host = createHost({});
    twoProviders(host);
    let attempts = 0;
    host.harness.sdk.stub("threads.wait", async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("timed out");
      return { event: { type: "turn/completed", data: { status: "completed", error: null } } };
    });
    await withCatalog(host, {
      claude: [{ model: "claude-opus-5" }],
      codex: [{ model: "gpt-5" }, { model: "gpt-5-mini", efforts: ["low", "medium"] }],
    });

    await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID });

    expect(host.spawns[1]).toMatchObject({ providerId: "codex", model: "gpt-5-mini", reasoningLevel: "low" });
  });

  it("reports the last failure when every agent fails", async () => {
    const host = createHost({});
    twoProviders(host);
    host.harness.sdk.stub("threads.wait", async () => {
      throw new Error("timed out");
    });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID })) as RenameResult;

    expect(result).toMatchObject({ ok: false });
    expect(host.spawns).toHaveLength(2);
    expect(host.updates).toEqual([]);
  });
});

describe("a destroyed environment", () => {
  it("names from the project default instead of giving up", async () => {
    const host = createHost({});
    let first = true;
    host.harness.sdk.stub("threads.spawn", async (args: unknown) => {
      host.spawns.push(args as Record<string, unknown>);
      if (first) {
        first = false;
        throw new Error("HTTP 409: Environment unavailable");
      }
      return makeThreadResponse({ id: WORKER_ID, visibility: "hidden" });
    });
    await load(host);

    const result = (await host.harness.behavior.callRpc("rename", { threadId: THREAD_ID })) as RenameResult;

    expect(result).toEqual({ ok: true, title: "Flaky login test" });
    expect(host.spawns.map((spawn) => spawn.environment)).toEqual([
      { type: "reuse", environmentId: "env_1" },
      { type: "project-default" },
    ]);
  });
});
