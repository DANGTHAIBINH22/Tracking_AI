"use client";

/**
 * Browser-only values (localStorage, the URL, layout) read through
 * useSyncExternalStore. Reading them in a mount effect and copying them into
 * state rendered every consumer twice and is what React's lint flags; this
 * reads them during render on the client and falls back to the server value
 * (`null` / `false`) for the hydration pass, so markup still matches.
 */

import { useSyncExternalStore } from "react";
import type { UserPublic } from "./api";

const noSubscription = () => () => {};

/** False while server-rendering and hydrating, true on the client after. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

function subscribeAuth(onChange: () => void) {
  window.addEventListener("auth-change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("auth-change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

// The snapshot must be referentially stable between changes, so the parsed
// user is cached against the raw string it came from.
let cachedRaw: string | null | undefined;
let cachedUser: UserPublic | null = null;

function readStoredUser(): UserPublic | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("admin_user");
  } catch {
    // storage blocked: behave as signed out
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedUser = raw ? (JSON.parse(raw) as UserPublic) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

/** The signed-in admin as stored by setAuthSession / setStoredUser; follows
 *  login, logout and other tabs through the "auth-change" and "storage" events. */
export function useStoredUser(): UserPublic | null {
  return useSyncExternalStore(subscribeAuth, readStoredUser, () => null);
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("local-storage", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("local-storage", onChange);
  };
}

/** One localStorage key, live. Write it with writeLocalStorage so this tab's
 *  readers hear about it too ("storage" only fires in other tabs). */
export function useLocalStorageItem(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
}

export function writeLocalStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: the value just will not persist
  }
  window.dispatchEvent(new Event("local-storage"));
}

/** One query-string parameter of the page as it was loaded. */
export function useSearchParam(name: string): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
