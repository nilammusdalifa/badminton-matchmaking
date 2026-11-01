import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  stored: null as unknown,
  offset: 0,
  writes: [] as { path: string; value: unknown }[],
  reject: [] as boolean[],
}));

vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  get: async () => ({ val: () => fake.stored, exists: () => fake.stored !== null }),
  set: async (r: { path: string }, value: unknown) => {
    fake.writes.push({ path: r.path, value });
    if (fake.reject.shift()) throw new Error("PERMISSION_DENIED");
  },
  onValue: (_r: unknown, cb: (snap: { val: () => unknown }) => void) => {
    cb({ val: () => fake.offset });
    return () => {};
  },
  off: () => {},
  serverTimestamp: () => ({ ".sv": "timestamp" }),
}));
vi.mock("./firebase", () => ({ auth: { currentUser: { uid: "u1" } }, database: {}, firebaseConfigured: true }));

const { claimUmpireAccess, pushErrorCode, pushSessionToFirebase } = await import("./firebaseSync");

const NOW = 50_000_000;
const ATTEMPT = "sessions/s1/attempts/u1";
const CLAIM = "sessions/s1/editorClaims/u1";

describe("claimUmpireAccess", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    fake.stored = null;
    fake.offset = 0;
    fake.writes = [];
    fake.reject = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts the try, then claims, in that order", async () => {
    expect(await claimUmpireAccess("s1", "123456")).toBe("ok");
    expect(fake.writes.map((w) => w.path)).toEqual([ATTEMPT, CLAIM]);
    expect(fake.writes[0].value).toEqual({ count: 1, at: { ".sv": "timestamp" }, guess: "123456" });
    expect(fake.writes[1].value).toBe("123456");
  });
  it("counts on from an earlier try in the window", async () => {
    fake.stored = { count: 2, at: NOW - 60_000, guess: "111111" };
    await claimUmpireAccess("s1", "123456");
    expect(fake.writes[0].value).toMatchObject({ count: 3 });
  });
  it("says wrong PIN when the claim is rejected", async () => {
    fake.reject = [false, true];
    expect(await claimUmpireAccess("s1", "000000")).toBe("wrong-pin");
  });
  it("says locked without writing anything once the tries are used up", async () => {
    fake.stored = { count: 5, at: NOW - 60_000, guess: "111111" };
    expect(await claimUmpireAccess("s1", "123456")).toBe("locked");
    expect(fake.writes).toEqual([]);
  });
  it("uses the server's clock for the lock", async () => {
    // Local clock says the lock is over; the server is 2 minutes behind, so it isn't.
    fake.stored = { count: 5, at: NOW - 660_000, guess: "111111" };
    fake.offset = -120_000;
    expect(await claimUmpireAccess("s1", "123456")).toBe("locked");
    expect(fake.writes).toEqual([]);
  });
  it("retries once with the other count when the clocks disagree", async () => {
    fake.stored = { count: 2, at: NOW - 599_000, guess: "111111" };
    fake.offset = 0;
    fake.reject = [true];
    expect(await claimUmpireAccess("s1", "123456")).toBe("ok");
    expect(fake.writes.map((w) => (w.value as { count?: number }).count ?? w.value)).toEqual([3, 1, "123456"]);
  });
  it("is unavailable when the retry is rejected too", async () => {
    fake.stored = { count: 2, at: NOW - 60_000, guess: "111111" };
    fake.reject = [true, true];
    expect(await claimUmpireAccess("s1", "123456")).toBe("unavailable");
    expect(fake.writes.map((w) => w.path)).toEqual([ATTEMPT, ATTEMPT]);
  });
  it("is unavailable when the first try is rejected and there is no other count", async () => {
    fake.reject = [true];
    expect(await claimUmpireAccess("s1", "123456")).toBe("unavailable");
    expect(fake.writes).toHaveLength(1);
  });
  it("says locked without a second write when the retry would go over the limit", async () => {
    // Local clock: the lock is over (count 1). Server rejects that: it is not.
    fake.stored = { count: 5, at: NOW - 600_000, guess: "111111" };
    fake.reject = [true];
    expect(await claimUmpireAccess("s1", "123456")).toBe("locked");
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].value).toMatchObject({ count: 1 });
  });
});

describe("pushSessionToFirebase result", () => {
  beforeEach(() => {
    fake.writes = [];
    fake.reject = [];
  });
  const data = { sessionName: "x" } as unknown as Parameters<typeof pushSessionToFirebase>[1];

  it("reports a write that landed", async () => {
    const results: unknown[] = [];
    pushSessionToFirebase("s1", data, 3, (r) => results.push(r));
    await vi.waitFor(() => expect(results).toEqual([{ ok: true }]));
    expect(fake.writes[0]).toEqual({ path: "sessions/s1/data", value: { sessionName: "x", rev: 3 } });
  });
  it("reports a refused write with its code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.reject = [true];
    const results: unknown[] = [];
    pushSessionToFirebase("s1", data, 3, (r) => results.push(r));
    await vi.waitFor(() => expect(results).toEqual([{ ok: false, code: "PERMISSION_DENIED" }]));
  });
  it("still works fire-and-forget with no callback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.reject = [true];
    expect(() => pushSessionToFirebase("s1", data, 3)).not.toThrow();
    await vi.waitFor(() => expect(fake.writes).toHaveLength(1));
  });
  it("reads the error code from Firebase errors", () => {
    expect(pushErrorCode(Object.assign(new Error("PERMISSION_DENIED: Permission denied"), { code: "PERMISSION_DENIED" }))).toBe("PERMISSION_DENIED");
    expect(pushErrorCode(new Error("PERMISSION_DENIED: Permission denied"))).toBe("PERMISSION_DENIED");
    expect(pushErrorCode(Object.assign(new Error("x"), { code: "permission_denied" }))).toBe("PERMISSION_DENIED");
    expect(pushErrorCode(new Error("offline"))).toBe("UNKNOWN");
    expect(pushErrorCode("nope")).toBe("UNKNOWN");
  });
});
