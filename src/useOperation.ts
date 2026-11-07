import { useCallback, useRef } from 'react';
import { post } from './api';

// Keep the same identifier when retrying an unchanged form after a lost response.
export function useOperation() {
  const operation = useRef({ fingerprint: '', key: crypto.randomUUID() });
  return useCallback(<T>(path: string, body: unknown): Promise<T> => {
    const fingerprint = `${path}:${JSON.stringify(body)}`;
    if (operation.current.fingerprint !== fingerprint)
      operation.current = { fingerprint, key: crypto.randomUUID() };
    return post<T>(path, body, operation.current.key);
  }, []);
}
