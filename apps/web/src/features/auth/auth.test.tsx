import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { App } from '../../app/App';
import { apiClient } from '../../lib/api-client';
const password = 'a long simple passphrase';
const user = {
  id: 'u',
  email: 'user@example.com',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const state = { user, accessToken: 'access-in-memory', expiresIn: 900 };
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function mount(path: string, strict = false) {
  const content = (
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}
async function fill(email = 'user@example.com', value = password) {
  const browser = userEvent.setup();
  await browser.type(await screen.findByLabelText('Email'), email);
  await browser.type(screen.getByLabelText('Password'), value);
  return browser;
}
beforeEach(() => {
  apiClient.clear();
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    json(401, {
      error: { code: 'invalid_refresh', message: 'Authentication required.' },
    }),
  );
  vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => String(args[0]).endsWith('/course') ? Promise.resolve(json(200, {id:'te',title:'Telugu Course',baseLanguage:'en',progress:{level:'A0',lexicalIntroduced:0,due:0,weak:0,listening:0,speaking:0,delayedRetention:0,pendingAssessments:0},activeSession:null})) : fetcher(...args));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  apiClient.clear();
});
describe('auth forms', () => {
  it.each(['/login', '/signup'])('validates email on %s', async (path) => {
    mount(path);
    const browser = await fill('invalid');
    await browser.click(
      screen.getByRole('button', {
        name: path === '/login' ? 'Log in' : 'Create account',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address',
    );
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith(path)),
    ).toHaveLength(0);
  });
  it.each(['/login', '/signup'])('validates password on %s', async (path) => {
    mount(path);
    const browser = await fill('user@example.com', 'abcdefg');
    await browser.click(
      screen.getByRole('button', {
        name: path === '/login' ? 'Log in' : 'Create account',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8');
  });
  it.each(['/login', '/signup'])(
    'success on %s sends only email/password and redirects',
    async (path) => {
      const local = vi.spyOn(Storage.prototype, 'setItem');
      fetcher.mockImplementation(async (url) =>
        String(url).endsWith(path)
          ? json(path === '/signup' ? 201 : 200, state)
          : json(401, {}),
      );
      mount(path);
      const browser = await fill('user@example.com', 'abcdefgh');
      await browser.click(
        screen.getByRole('button', {
          name: path === '/login' ? 'Log in' : 'Create account',
        }),
      );
      expect(
        await screen.findByRole('heading', { name: 'Telugu Course' }),
      ).toBeInTheDocument();
      expect(screen.getByText(user.email)).toBeInTheDocument();
      const call = fetcher.mock.calls.find(([url]) =>
        String(url).endsWith(path),
      )!;
      expect(JSON.parse(call[1]!.body as string)).toEqual({
        email: user.email,
        password: 'abcdefgh',
      });
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
      expect(local).not.toHaveBeenCalled();
    },
  );
  it.each(['/login', '/signup'])(
    'toggles password visibility without submitting on %s',
    async (path) => {
      mount(path);
      const browser = await fill();
      const input = screen.getByLabelText('Password');
      expect(input).toHaveAttribute('type', 'password');
      await browser.click(
        screen.getByRole('button', { name: 'Show password' }),
      );
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveValue(password);
      expect(
        screen.getByRole('button', { name: 'Hide password' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await browser.click(
        screen.getByRole('button', { name: 'Hide password' }),
      );
      expect(input).toHaveAttribute('type', 'password');
      expect(
        fetcher.mock.calls.filter(([url]) => String(url).endsWith(path)),
      ).toHaveLength(0);
    },
  );
  it('shows generic invalid credentials', async () => {
    fetcher.mockImplementation(async (url) =>
      json(401, {
        error: {
          code: String(url).endsWith('/login')
            ? 'invalid_credentials'
            : 'invalid_refresh',
          message: 'Invalid email or password.',
        },
      }),
    );
    mount('/login');
    const browser = await fill();
    await browser.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.',
    );
    expect(screen.queryByRole('heading', { name: 'Telugu Course' })).not.toBeInTheDocument();
  });
});
describe('auth state and protected route', () => {
  it('redirects unauthenticated users to login', async () => {
    mount('/app');
    expect(
      await screen.findByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument();
  });
  it('restores cookie auth, fetches current user, and renders protected route', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/refresh') ? json(200, state) : json(200, { user }),
    );
    mount('/app');
    expect(
      await screen.findByRole('heading', { name: 'Telugu Course' }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith('/me')),
    ).toBe(true);
  });
  it('supports StrictMode bootstrap without duplicate rotation', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/refresh') ? json(200, state) : json(200, { user }),
    );
    mount('/app', true);
    expect(
      await screen.findByRole('heading', { name: 'Telugu Course' }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refresh')),
    ).toHaveLength(1);
  });
  it('logs out and returns to login', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/logout')
        ? new Response(null, { status: 204 })
        : String(url).endsWith('/refresh')
          ? json(200, state)
          : json(200, { user }),
    );
    mount('/app');
    const browser = userEvent.setup();
    await browser.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(
      await screen.findByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith('/logout')),
    ).toBe(true);
  });
  it('refresh failure on an authorized read returns user to login', async () => {
    let refreshes = 0;
    fetcher.mockImplementation(async (url) => {
      if (String(url).endsWith('/refresh'))
        return ++refreshes === 1 ? json(200, state) : json(401, {});
      return json(200, { user });
    });
    mount('/app');
    await screen.findByRole('heading', { name: 'Telugu Course' });
    fetcher.mockImplementation(async () => json(401, {}));
    await apiClient.request('/auth/me').catch(() => {});
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Log in' }),
      ).toBeInTheDocument(),
    );
  });
  it('successful refresh keeps protected identity', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/refresh') ? json(200, state) : json(200, { user }),
    );
    mount('/app');
    await screen.findByRole('heading', { name: 'Telugu Course' });
    fetcher.mockResolvedValueOnce(json(401, {}));
    await apiClient.request('/auth/me');
    expect(
      screen.getByRole('heading', { name: 'Telugu Course' }),
    ).toBeInTheDocument();
  });
});
