export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      signal: AbortSignal.timeout(20000),
      ...options,
      headers: {
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(
      'No se pudo conectar con la aplicación local. Revisá que el servidor esté iniciado.',
    );
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación.');
  return data as T;
}
export function post<T>(path: string, body: unknown = {}, key?: string) {
  return api<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: key ? { 'Idempotency-Key': key } : {},
  });
}
export function put<T>(path: string, body: unknown, key?: string) {
  return api<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: key ? { 'Idempotency-Key': key } : {},
  });
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
