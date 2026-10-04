// Credentials are intentionally held only in module memory.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function createApiClient(
  baseUrl: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  let accessToken: string | null = null;
  let generation = 0;
  let refreshPromise: Promise<unknown> | null = null;
  let refreshHandler: ((data: unknown) => void) | null = null;
  let failureHandler: (() => void) | null = null;
  const clear = () => {
    generation++;
    accessToken = null;
  };
  async function send(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-Vaani-Client', '1');
    headers.set('X-Auth-Transport', 'web');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
    if (!response.ok) {
      let body;
      try {
        body = await response.json();
      } catch {
        /* no server details exposed */
      }
      throw new ApiError(
        response.status,
        body?.error?.code ?? 'request_failed',
        body?.error?.message ?? 'Request failed. Please try again.',
      );
    }
    return response.status === 204 ? undefined : response.json();
  }
  async function refresh() {
    if (!refreshPromise) {
      const started = generation;
      refreshPromise = (async () => {
        try {
          const data = await send('/auth/refresh', {
            method: 'POST',
            body: '{}',
          });
          if (started !== generation)
            throw new ApiError(401, 'stale_auth', 'Authentication changed.');
          accessToken = data.accessToken;
          refreshHandler?.(data);
          return data;
        } catch (error) {
          if (started === generation) {
            clear();
            failureHandler?.();
          }
          throw error;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    return refreshPromise;
  }
  return {
    setAccessToken: (token: string) => {
      generation++;
      accessToken = token;
    },
    clear,
    configureAuth: (
      onRefresh: (data: unknown) => void,
      onFailure: () => void,
    ) => {
      refreshHandler = onRefresh;
      failureHandler = onFailure;
    },
    refresh,
    // Automatically retry only reads. Mutations must explicitly handle expired auth.
    async request<T>(
      path: string,
      init: RequestInit = {},
      authorized = true,
    ): Promise<T> {
      try {
        return await send(path, init);
      } catch (error) {
        if (authorized && error instanceof ApiError && error.status === 401) {
          if (['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) {
            await refresh();
            try {
              return await send(path, init);
            } catch (retryError) {
              if (retryError instanceof ApiError && retryError.status === 401) {
                clear();
                failureHandler?.();
              }
              throw retryError;
            }
          }
          clear();
          failureHandler?.();
        }
        throw error;
      }
    },
    // Serialize logout after any pending rotation, so it revokes the latest cookie.
    async logout() {
      if (refreshPromise)
        try {
          await refreshPromise;
        } catch {
          /* clear still follows */
        }
      try {
        await send('/auth/logout', { method: 'POST', body: '{}' });
      } finally {
        clear();
        failureHandler?.();
      }
    },
  };
}
export const apiClient = createApiClient(
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
);
