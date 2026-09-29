"use client";

import { useCallback, useSyncExternalStore } from "react";

import { readJson, readStorage, writeStorage } from "./persistent-storage";

/**
 * Learning progress lives in this browser's localStorage: no account, no server round trip.
 * It can optionally be backed up to the local CyberForge instance under an anonymous profile id.
 */
const PROGRESS_KEY = "cyberforge:learning:completed";
const PROFILE_KEY = "cyberforge:learning:profile";

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: readonly string[] } = { raw: null, value: [] };

function snapshot(): readonly string[] {
  const raw = readStorage(PROGRESS_KEY);
  if (raw !== cache.raw) {
    const parsed = readJson<unknown>(PROGRESS_KEY, []);
    cache = {
      raw,
      value: Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [],
    };
  }
  return cache.value;
}

const serverSnapshot: readonly string[] = [];

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROGRESS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: readonly string[]) {
  writeStorage(PROGRESS_KEY, JSON.stringify([...new Set(next)].sort()));
  listeners.forEach((l) => l());
}

export function getProfileId(): string {
  let id = readStorage(PROFILE_KEY);
  if (!id) {
    id = `local-${crypto.randomUUID()}`;
    writeStorage(PROFILE_KEY, id);
  }
  return id;
}

export function useLearningProgress() {
  const completed = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);

  const toggle = useCallback((slug: string) => {
    const current = snapshot();
    write(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
  }, []);

  const isDone = useCallback((slug: string) => completed.includes(slug), [completed]);
  const reset = useCallback(() => write([]), []);

  return { completed, isDone, toggle, reset };
}

export function progressFor(completed: readonly string[], slugs: readonly string[]) {
  const done = slugs.filter((s) => completed.includes(s)).length;
  return {
    done,
    total: slugs.length,
    pct: slugs.length ? Math.round((done / slugs.length) * 100) : 0,
  };
}
