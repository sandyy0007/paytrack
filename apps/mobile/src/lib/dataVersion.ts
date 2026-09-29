import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

/** Bumped after every local write so live queries re-run. */
export const useDataVersion = create<{ v: number; bump: () => void }>((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 })),
}));
export const bumpData = () => useDataVersion.getState().bump();

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/** Runs an async local query and re-runs it whenever local data changes. */
export function useLiveQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const v = useDataVersion((s) => s.v);
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>({
    data: undefined, loading: true, error: null,
  });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: s.data === undefined }));
    fnRef.current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error: Error) => alive && setState((s) => ({ ...s, loading: false, error })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, nonce, ...deps]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}
