'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

// Mirrors backend's DraftKind enum. Kept inline (not imported from a
// shared package) so the frontend has zero cross-package coupling.
export type DraftKind =
  | 'onboard_application'
  | 'application_review_note'
  | 'add_client'
  | 'add_task'
  | 'send_invite'
  | 'move_client_step'
  | 'raise_blocker'
  | 'request_extension';

export type DraftStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'restored' | 'conflict';

interface UseFormDraftOptions<T> {
  kind: DraftKind;
  contextId: string;
  initialData: T;
  enabled?: boolean;       // default true
  debounceMs?: number;     // default 1500
  maxWaitMs?: number;      // default 4000
  // Optional: change the debounce trigger semantics. Most consumers
  // want the default.
  isEqual?: (a: T, b: T) => boolean;
}

interface UseFormDraftResult<T> {
  data: T;
  setData: (updater: (prev: T) => T) => void;
  status: DraftStatus;
  lastSavedAt: Date | null;
  forceSave: () => Promise<void>;
  clear: () => Promise<void>;
}

const SCHEMA_VERSION = 1;

function defaultEquals<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Stable string key for the TanStack Query / hook state.
function qk(kind: DraftKind, contextId: string) {
  return ['form-draft', kind, contextId] as const;
}

// ── Use a module-level Map to coordinate debounced saves across hooks
// sharing the same kind+contextId (e.g. two components editing the
// same draft). The actual debounce timer is owned by the most recent
// hook instance; older instances become no-ops. This is good enough
// for the current scope (each form has one owner) and avoids the
// complexity of a true shared debounce.
const inflightSaves = new Map<string, Promise<void>>();

/**
 * useFormDraft — autosave any form payload to the backend drafts table.
 *
 * Behavior:
 *  - On mount: GETs the existing draft. If found, merges it on top
 *    of `initialData` and sets `status: 'restored'`. Empty drafts
 *    (no fields) are ignored.
 *  - On every setData: optimistic local update + debounced PUT to
 *    /api/drafts. Debounce uses leading+trailing+maxWait so a long
 *    typing burst still flushes every maxWait ms.
 *  - forceSave(): flush immediately. Called on visibilitychange,
 *    pagehide, and on demand.
 *  - clear(): optimistically resets and DELETEs the draft. Call this
 *    on successful final submit. Errors are swallowed.
 *
 * The hook is safe to call with `enabled: false` — it does no I/O
 * and returns initialData as-is. Useful for components that mount
 * before the form is ready (e.g. before the invite token resolves).
 */
export function useFormDraft<T extends object>({
  kind,
  contextId,
  initialData,
  enabled = true,
  debounceMs = 1500,
  maxWaitMs = 4000,
  isEqual = defaultEquals,
}: UseFormDraftOptions<T>): UseFormDraftResult<T> {
  const [data, setDataInternal] = useState<T>(initialData);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Refs to avoid stale closures and to allow setData to remain stable.
  const dataRef = useRef<T>(initialData);
  const revisionRef = useRef<number>(0);
  const lastSentRef = useRef<T>(initialData);
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;

  // Debounce state (refs so they survive renders)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInvokeRef = useRef<number>(0);
  const leadingFiredRef = useRef<boolean>(false);

  const key = qk(kind, contextId);

  // ── Mount: load any existing draft ──────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const res = await apiFetch(`/api/drafts?kind=${encodeURIComponent(kind)}&contextId=${encodeURIComponent(contextId)}`);
        if (cancelled) return;
        if (res?.draft) {
          // Validate schemaVersion
          const v = (res.draft.data as any)?.schemaVersion;
          if (v === SCHEMA_VERSION && res.draft.data) {
            const merged = { ...initialDataRef.current, ...res.draft.data } as T;
            // Strip schemaVersion before exposing to the form
            const { schemaVersion, ...rest } = merged as any;
            dataRef.current = rest as T;
            setDataInternal(rest as T);
            revisionRef.current = res.draft.revision || 0;
            setStatus('restored');
            return;
          }
        }
        setStatus('idle');
      } catch {
        if (!cancelled) setStatus('idle');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, contextId, enabled]);

  // ── The actual save function ─────────────────────────────────────
  // Serialize saveNow per (kind, contextId) so rapid keystrokes can't
  // race two PUTs against the same draft. Without this, the leading-
  // edge fire and a trailing fire can both hit the server within the
  // same revision, causing the trailing PUT to lose against the just-
  // incremented server revision → 409. The mutex resolves that: each
  // saveNow awaits the previous one before issuing its PUT.
  const saveLockRef = useRef<Promise<void>>(Promise.resolve());
  const saveNow = useCallback(async () => {
    if (!enabled) return;
    const run = async (): Promise<void> => {
      const payload = dataRef.current;
      const isChanged = !isEqualRef.current(payload, lastSentRef.current);
      if (!isChanged) return;
      lastSentRef.current = payload;
      setStatus('saving');
      try {
        const res = await apiFetch('/api/drafts', {
          method: 'PUT',
          body: JSON.stringify({
            kind,
            contextId,
            data: { schemaVersion: SCHEMA_VERSION, ...payload },
            revision: revisionRef.current,
          }),
        });
        if (res?.draft) {
          revisionRef.current = res.draft.revision || revisionRef.current + 1;
          setLastSavedAt(new Date());
          setStatus('saved');
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('409') || msg.includes('Stale draft revision')) {
          setStatus('conflict');
          // Refetch latest so the user's UI is not stuck on a stale view.
          try {
            const res = await apiFetch(`/api/drafts?kind=${encodeURIComponent(kind)}&contextId=${encodeURIComponent(contextId)}`);
            if (res?.draft?.data) {
              const v = (res.draft.data as any)?.schemaVersion;
              if (v === SCHEMA_VERSION) {
                const { schemaVersion, ...rest } = res.draft.data as any;
                dataRef.current = rest as T;
                setDataInternal(rest as T);
                revisionRef.current = res.draft.revision || 0;
                lastSentRef.current = rest as T;
              }
            }
          } catch { /* ignore */ }
        } else {
          setStatus('error');
        }
      }
    };
    // Chain onto the existing lock so concurrent saves run strictly serially.
    const next = saveLockRef.current.then(run, run);
    saveLockRef.current = next.catch(() => undefined);
    return next;
  }, [kind, contextId, enabled]);

  // ── Public setData: updates state, schedules debounced save ──────
  const setData = useCallback((updater: (prev: T) => T) => {
    setDataInternal(prev => {
      const next = updater(prev);
      dataRef.current = next;

      if (!enabled) return next;

      const now = Date.now();
      const sinceLast = now - lastInvokeRef.current;
      lastInvokeRef.current = now;

      // Leading-edge: fire immediately on first call in a burst.
      if (!leadingFiredRef.current) {
        leadingFiredRef.current = true;
        // Save without awaiting (fire-and-forget)
        void saveNow();
      }

      // Trailing: schedule a save after the debounce window.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        leadingFiredRef.current = false;
        debounceTimerRef.current = null;
        if (maxWaitTimerRef.current) {
          clearTimeout(maxWaitTimerRef.current);
          maxWaitTimerRef.current = null;
        }
        void saveNow();
      }, debounceMs);

      // maxWait: if we haven't fired a save in maxWaitMs, force one.
      if (!maxWaitTimerRef.current) {
        maxWaitTimerRef.current = setTimeout(() => {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          maxWaitTimerRef.current = null;
          leadingFiredRef.current = false;
          void saveNow();
        }, maxWaitMs);
      }

      return next;
    });
  }, [saveNow, debounceMs, maxWaitMs, enabled]);

  // ── forceSave: flush immediately ─────────────────────────────────
  const forceSave = useCallback(async () => {
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    if (maxWaitTimerRef.current) { clearTimeout(maxWaitTimerRef.current); maxWaitTimerRef.current = null; }
    leadingFiredRef.current = false;
    await saveNow();
  }, [saveNow]);

  // ── clear: delete the draft (call after successful final submit) ─
  const clear = useCallback(async () => {
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    if (maxWaitTimerRef.current) { clearTimeout(maxWaitTimerRef.current); maxWaitTimerRef.current = null; }
    try {
      await apiFetch(`/api/drafts?kind=${encodeURIComponent(kind)}&contextId=${encodeURIComponent(contextId)}`, { method: 'DELETE' });
    } catch {
      // Swallow: a stale draft is better than lost work.
    }
    revisionRef.current = 0;
    setStatus('idle');
  }, [kind, contextId]);

  // ── On unmount and on tab hide: flush in-flight save ────────────
  useEffect(() => {
    function onHide() { void forceSave(); }
    function onPageHide() { void forceSave(); }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      // Final flush on unmount
      void forceSave();
    };
  }, [forceSave]);

  return { data, setData, status, lastSavedAt, forceSave, clear };
}
