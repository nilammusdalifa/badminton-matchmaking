import { initializeApp, type FirebaseApp } from "firebase/app";
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

export const app: FirebaseApp | null = firebaseConfigured ? initializeApp(firebaseConfig) : null;
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
