import { describe, expect, it } from "vitest";
import { buildNamingPrompt, cleanTitle, continuationId, stripContinuation, truncateTitle } from "./title";

describe("cleanTitle", () => {
  it("keeps an ordinary title as it is", () => {
    expect(cleanTitle("  Flaky login test\n", 48)).toBe("Flaky login test");
  });

  it("drops a trailing period", () => {
    expect(cleanTitle("Fix the flaky login test.", 48)).toBe(
      "Fix the flaky login test",
    );
  });

  it("unwraps a fenced answer", () => {
    expect(cleanTitle("```\nFlaky login test\n```", 48)).toBe(
      "Flaky login test",
    );
  });

  it("unwraps quotes, including typographic ones", () => {
    expect(cleanTitle('"Flaky login test"', 48)).toBe("Flaky login test");
    expect(cleanTitle("“Flaky login test”", 48)).toBe("Flaky login test");
    expect(cleanTitle("« Test de connexion instable »", 48)).toBe(
      "Test de connexion instable",
    );
  });

  it("drops a label the agent prefixed", () => {
    expect(cleanTitle("Title: Flaky login test", 48)).toBe("Flaky login test");
    expect(cleanTitle("- Flaky login test", 48)).toBe("Flaky login test");
  });

  it("takes the last line when the agent adds preamble", () => {
    expect(cleanTitle("Here is a title:\n\nFlaky login test", 48)).toBe(
      "Flaky login test",
    );
  });

  it("collapses a multi-line answer into one line", () => {
    expect(cleanTitle("Flaky   login\ttest", 48)).toBe("Flaky login test");
  });

  it("reports nothing usable as an empty string", () => {
    expect(cleanTitle("   \n\n  ", 48)).toBe("");
  });

  it("fits the answer to the budget", () => {
    expect(cleanTitle("Investigate the intermittent login timeout", 20)).toBe(
      "Investigate the",
    );
  });
});

describe("truncateTitle", () => {
  it("leaves a title inside the budget alone", () => {
    expect(truncateTitle("Short", 32)).toBe("Short");
  });

  it("cuts on a word boundary when there is a useful one", () => {
    expect(truncateTitle("Refactor the environment resolver", 20)).toBe(
      "Refactor the",
    );
  });

  it("cuts mid-word rather than losing most of the title", () => {
    expect(truncateTitle("a verylongsinglewordtitlethatnevermeetsaspace", 12)).toBe(
      "a verylongsi",
    );
  });
});

describe("buildNamingPrompt", () => {
  const outline = [
    { role: "user" as const, preview: "The login test fails on CI" },
    { role: "assistant" as const, preview: "Looking at the retry logic" },
  ];

  it("states the length budget and labels both roles", () => {
    const prompt = buildNamingPrompt("Name it.", outline, 40);
    expect(prompt).toContain("at most 40 characters");
    expect(prompt).toContain("User: The login test fails on CI");
    expect(prompt).toContain("Assistant: Looking at the retry logic");
  });

  it("keeps the opening and recent context of a long conversation", () => {
    const long = Array.from({ length: 20 }, (_, index) => ({
      role: "user" as const,
      preview: `turn ${index}`,
    }));
    const prompt = buildNamingPrompt("Name it.", long, 40);
    expect(prompt).toContain("turn 0");
    expect(prompt).toContain("turn 19");
    expect(prompt).not.toContain("turn 8");
  });

  it("drops an empty preview instead of sending a bare role label", () => {
    const prompt = buildNamingPrompt(
      "Name it.",
      [{ role: "user", preview: "   " }, ...outline],
      40,
    );
    expect(prompt).not.toContain("User:  ");
  });
});


it("supplies source and current titles with a stability rule and removes raw continuation IDs", () => {
  const prompt = buildNamingPrompt("Name it", [
    { role: "user", preview: "Continue from @thread:thr_source add trace filters" },
  ], 48, { sourceTitle: "Observability", currentTitle: "Trace filters" });
  expect(prompt).toContain('Original thread topic: "Observability"');
  expect(prompt).toContain('Current title: "Trace filters"');
  expect(prompt).toContain("Keep the current title verbatim");
  expect(prompt).toContain("User: add trace filters");
  expect(prompt).not.toContain("thr_source");
});

describe("continuationId", () => {
  it("reads the linked thread id", () => {
    expect(continuationId("Continue from @thread:thr_abc123def4")).toBe("thr_abc123def4");
    expect(continuationId("continue from @thread:thr_source tldr")).toBe("thr_source");
  });

  it("stops at the id's length when the user's next line was glued on", () => {
    expect(continuationId("Continue from @thread:thr_abc123def4continue")).toBe("thr_abc123def4");
    expect(stripContinuation("Continue from @thread:thr_abc123def4continue")).toBe("continue");
    expect(stripContinuation("Continue from @thread:thr_abc123def4 - fix the tests")).toBe("fix the tests");
  });

  it("is not fooled by an ordinary message", () => {
    expect(continuationId("continue with the plan")).toBeNull();
    expect(stripContinuation("continue with the plan")).toBe("continue with the plan");
  });
});
