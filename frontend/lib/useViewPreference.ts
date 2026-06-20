'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

interface UseViewPreferenceOptions<T> {
  page: string;
  key: string;
  defaultValue: T;
}

type Setter<T> = (next: T | ((prev: T) => T)) => void;

/**
 * useViewPreference — persist a per-user view setting (active tab,
 * filter, sort) to the backend. The value is JSON-encoded as a string
 * for transport; the hook decodes transparently. Updates are
 * debounced (500ms) to avoid hammering the server on rapid changes.
 */
export function useViewPreference<T>({
  page,
  key,
  defaultValue,
}: UseViewPreferenceOptions<T>): [T, Setter<T>, boolean] {
  const [value, setValueInternal] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<T>(defaultValue);
  valueRef.current = value;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/preferences?page=${encodeURIComponent(page)}`);
        if (cancelled) return;
        const raw = res?.preferences?.[key];
        if (typeof raw === 'string') {
          try {
            setValueInternal(JSON.parse(raw) as T);
          } catch {
            // Stored value isn't valid JSON; fall back to default.
            setValueInternal(defaultValue);
          }
        }
      } catch {
        // Network error: fall back silently to defaultValue.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, key]);

  const persist = useCallback((next: T) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void apiFetch('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify({ page, key, value: JSON.stringify(next) }),
      }).catch(() => { /* swallow — view prefs are not critical */ });
    }, 500);
  }, [page, key]);

  const setValue = useCallback<Setter<T>>((next) => {
    setValueInternal(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      valueRef.current = resolved;
      persist(resolved);
      return resolved;
    });
  }, [persist]);

  // Flush on unmount
  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      // Best-effort synchronous flush
      void apiFetch('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify({ page, key, value: JSON.stringify(valueRef.current) }),
      }).catch(() => {});
    }
  }, [page, key]);

  return [value, setValue, loaded];
}
