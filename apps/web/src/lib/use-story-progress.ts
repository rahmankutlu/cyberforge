"use client";

import type { Story } from "@cyberforge/types";
import { useCallback, useSyncExternalStore } from "react";

import { readStorage, writeStorage } from "./persistent-storage";
import {
  emptyProgress,
  parseProgress,
  reduceStory,
  storyStorageKey,
  type StoryAction,
  type StoryProgress,
} from "./story-state";

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: StoryProgress }>();
const SERVER: StoryProgress = emptyProgress();

function read(slug: string, story?: Story): StoryProgress {
  const key = storyStorageKey(slug);
  const raw = readStorage(key);
  const hit = cache.get(slug);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseProgress(raw, story);
  cache.set(slug, { raw, value });
  return value;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("cyberforge:story:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Progress for one story, persisted in this browser and shared across tabs. */
export function useStoryProgress(slug: string, story?: Story) {
  const progress = useSyncExternalStore(
    subscribe,
    () => read(slug, story),
    () => SERVER,
  );

  const dispatch = useCallback(
    (action: StoryAction) => {
      const next = reduceStory(read(slug, story), action);
      writeStorage(storyStorageKey(slug), JSON.stringify(next));
      cache.delete(slug);
      listeners.forEach((l) => l());
    },
    [slug, story],
  );

  return { progress, dispatch };
}

/** Read-only progress for many stories (the index page). */
export function useAllStoryProgress(slugs: string[]): Record<string, StoryProgress> {
  const key = slugs.map((s) => `${s}=${readStorage(storyStorageKey(s)) ?? ""}`).join("|");
  const snapshot = useSyncExternalStore(
    subscribe,
    () => key,
    () => "",
  );
  return Object.fromEntries(slugs.map((s) => [s, snapshot === "" ? SERVER : read(s)]));
}
