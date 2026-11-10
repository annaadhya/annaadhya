"use client";
/**
 * Small data-fetching hook for the client-rendered admin pages:
 * loading / error / data states with retry, deliberately tiny (no react-query).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

/** document.title for client pages (client components cannot export metadata). */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Annaadhya Admin`;
  }, [title]);
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

export function useApiQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  // Keep the latest fetcher without making callers memoize it.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err
              : new ApiError(err instanceof Error ? err.message : "Unexpected error", "internal", 0),
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
