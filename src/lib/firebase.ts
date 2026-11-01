import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Live sharing is an optional add-on, not a boot requirement — a device
 * with no `.env.local` (or a fresh checkout that hasn't set one up yet)
 * should still run the app fully as a local, single-device session instead
 * of crashing at import time. */
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);

/** Optional reCAPTCHA v3 site key for Firebase App Check. App Check makes the
 * database refuse requests that don't come from this app, which blunts the
 * "sign in as a fresh anonymous user for 5 more PIN tries" trick. With no key
 * set (local dev, tests, a fresh checkout) it is skipped entirely. */
const appCheckSiteKey: string | undefined = import.meta.env.VITE_APPCHECK_SITE_KEY || undefined;

function createApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  const created = initializeApp(firebaseConfig);
  // App Check has to be registered right after initializeApp and before any
  // other service is created, so the first Auth and Database request already
  // carries a token.
  if (appCheckSiteKey) {
    initializeAppCheck(created, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return created;
}

export const app: FirebaseApp | null = createApp();
export const auth: Auth | null = app ? getAuth(app) : null;
export const database: Database | null = app ? getDatabase(app) : null;

let anonymousAuthPromise: Promise<string> | null = null;

/**
 * Resolves once this device has a Firebase anonymous auth UID, signing in
 * silently if it doesn't have one yet. Safe to call multiple times. Rejects
 * immediately (no retry loop) when Firebase isn't configured at all.
 */
export function ensureAnonymousAuth(): Promise<string> {
  if (!auth) return Promise.reject(new Error("Firebase not configured"));
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (!anonymousAuthPromise) {
    const a = auth;
    anonymousAuthPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        a,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user.uid);
          }
        },
        (err) => {
          unsubscribe();
          reject(err);
        },
      );
      signInAnonymously(a).catch((err) => {
        unsubscribe();
        reject(err);
      });
    });
  }
  return anonymousAuthPromise;
}
