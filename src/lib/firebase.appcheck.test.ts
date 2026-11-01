import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Records the order in which the Firebase SDK entry points are called, so the
// test can prove App Check is registered before Auth or the Database exist.
const calls: string[] = [];
const appCheckArgs: unknown[] = [];

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => {
    calls.push("initializeApp");
    return { name: "fake-app" };
  }),
}));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn((_app: unknown, options: unknown) => {
    calls.push("initializeAppCheck");
    appCheckArgs.push(options);
    return {};
  }),
  ReCaptchaV3Provider: class {
    constructor(public siteKey: string) {
      calls.push("ReCaptchaV3Provider");
    }
  },
}));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => {
    calls.push("getAuth");
    return { currentUser: null };
  }),
  signInAnonymously: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock("firebase/database", () => ({
  getDatabase: vi.fn(() => {
    calls.push("getDatabase");
    return {};
  }),
}));

async function loadFirebaseModule() {
  vi.resetModules();
  return import("./firebase");
}

function stubConfig() {
  vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key");
  vi.stubEnv("VITE_FIREBASE_DATABASE_URL", "https://example-default-rtdb.firebaseio.com");
}

describe("firebase.ts App Check", () => {
  beforeEach(() => {
    calls.length = 0;
    appCheckArgs.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers App Check right after initializeApp and before Auth and the Database", async () => {
    stubConfig();
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    await loadFirebaseModule();
    expect(calls).toEqual(["initializeApp", "ReCaptchaV3Provider", "initializeAppCheck", "getAuth", "getDatabase"]);
  });

  it("uses the reCAPTCHA v3 provider with the site key and auto-refreshing tokens", async () => {
    stubConfig();
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    await loadFirebaseModule();
    const options = appCheckArgs[0] as { provider: { siteKey: string }; isTokenAutoRefreshEnabled: boolean };
    expect(options.provider.siteKey).toBe("site-key");
    expect(options.isTokenAutoRefreshEnabled).toBe(true);
  });

  it("skips App Check when no site key is set, and the app still starts", async () => {
    stubConfig();
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "");
    const mod = await loadFirebaseModule();
    expect(calls).toEqual(["initializeApp", "getAuth", "getDatabase"]);
    expect(mod.firebaseConfigured).toBe(true);
    expect(mod.database).not.toBeNull();
  });

  it("does nothing at all when Firebase itself is not configured, even with a site key", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_DATABASE_URL", "");
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const mod = await loadFirebaseModule();
    expect(calls).toEqual([]);
    expect(mod.firebaseConfigured).toBe(false);
    expect(mod.app).toBeNull();
    expect(mod.database).toBeNull();
  });
});
