import { describe, it, expect, vi } from 'vitest';
import { createApiClient, ApiError } from './api-client';
const response = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const state = {
  accessToken: 'new-access',
  user: {
    id: 'u',
    email: 'user@example.com',
    status: 'active',
    createdAt: '2026-01-01',
  },
  expiresIn: 900,
};
describe('reusable API client', () => {
  it('uses credentials and in-memory access token, without browser persistence', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response(200, { ok: true }));
      const client = createApiClient('https://api.example/api/v1', fetcher);
      client.setAccessToken('memory-token');
      await client.request('/auth/me');
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe('https://api.example/api/v1/auth/me');
      expect(init?.credentials).toBe('include');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer memory-token');
      expect(headers.get('X-Vaani-Client')).toBe('1');
      expect(local).not.toHaveBeenCalled();
    } finally {
      local.mockRestore();
    }
  });
  it('refreshes and retries a GET once with the new token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, state))
      .mockResolvedValueOnce(response(200, { user: state.user }));
    const client = createApiClient('/api/v1', fetcher);
    const changed = vi.fn();
    client.configureAuth(changed, vi.fn());
    client.setAccessToken('old');
    expect(await client.request('/auth/me')).toEqual({ user: state.user });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    expect(
      new Headers(fetcher.mock.calls[2][1]?.headers).get('Authorization'),
    ).toBe('Bearer new-access');
    expect(changed).toHaveBeenCalledWith(state);
  });
  it('deduplicates parallel refreshes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(200, state));
    const client = createApiClient('/api/v1', fetcher);
    await Promise.all([client.refresh(), client.refresh(), client.refresh()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('clears identity and stops when refresh fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(401));
    const client = createApiClient('/api/v1', fetcher);
    const failed = vi.fn();
    client.configureAuth(vi.fn(), failed);
    client.setAccessToken('old');
    await expect(client.request('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledTimes(1);
    await client.request('/public', {}, false).catch(() => {});
    expect(
      new Headers(fetcher.mock.calls[2][1]?.headers).has('Authorization'),
    ).toBe(false);
  });
  it('does not infinitely refresh if the retry is unauthorized', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, state))
      .mockResolvedValueOnce(response(401));
    const client = createApiClient('/api/v1', fetcher);
    const failed = vi.fn();
    client.configureAuth(vi.fn(), failed);
    await expect(client.request('/auth/me')).rejects.toMatchObject({
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('does not retry mutations or login failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(401));
    const client = createApiClient('/api/v1', fetcher);
    await expect(
      client.request('/future', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      client.request('/auth/login', { method: 'POST' }, false),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not restore a token after identity was cleared during refresh', async () => {
    let resolve!: (res: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const client = createApiClient('/api/v1', fetcher);
    const changed = vi.fn();
    client.configureAuth(changed, vi.fn());
    const pending = client.refresh();
    client.clear();
    resolve(response(200, state));
    await expect(pending).rejects.toMatchObject({ code: 'stale_auth' });
    expect(changed).not.toHaveBeenCalled();
  });
  it('logout waits for pending rotation, then clears in-memory auth', async () => {
    let resolve!: (res: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response(200));
    const client = createApiClient('/api/v1', fetcher);
    const pending = client.refresh();
    const logout = client.logout();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(response(200, state));
    await pending;
    await logout;
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/auth/logout');
    await client.request('/public', {}, false);
    expect(
      new Headers(fetcher.mock.calls[2][1]?.headers).has('Authorization'),
    ).toBe(false);
  });
  it('preserves stable API errors without exposing response details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response(401, {
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password.',
        },
      }),
    );
    const client = createApiClient('/api/v1', fetcher);
    await expect(
      client.request('/auth/login', { method: 'POST' }, false),
    ).rejects.toMatchObject({
      code: 'invalid_credentials',
      message: 'Invalid email or password.',
    });
  });
});
