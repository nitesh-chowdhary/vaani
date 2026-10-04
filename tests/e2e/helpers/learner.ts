import { randomUUID } from 'node:crypto';
import {
  expect,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import type {
  Session,
  ActionResult,
} from '../../../apps/web/src/features/course/types/course.types';
import { loadContent } from '../../../apps/api/src/features/content/content.service.js';
import { intentFor } from '@vaani/learning-core';

export async function screenshot(page: Page, info: TestInfo, label: string) {
  const path = info.outputPath(`${label}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(label, { path, contentType: 'image/png' });
}

export function monitor(page: Page) {
  const issues: string[] = [];
  const responseStatuses = new WeakMap<Request, number>();
  let authenticated = false;
  page.on('pageerror', (error) => issues.push(`Page error: ${error.message}`));
  page.on('console', (message) => {
    // The initial no-cookie refresh returns 401 before signup by design.
    if (
      message.type() === 'error' &&
      !(
        !authenticated &&
        /401/.test(message.text()) &&
        new URL(message.location().url || 'http://localhost').pathname ===
          '/api/v1/auth/refresh'
      )
    )
      issues.push(`Console: ${message.text()}`);
  });
  page.on('response', (response) => {
    responseStatuses.set(response.request(), response.status());
    const path = new URL(response.url()).pathname;
    if (response.ok() && path === '/api/v1/auth/logout') authenticated = false;
    if (
      response.ok() &&
      ['/api/v1/auth/login', '/api/v1/auth/signup'].includes(path)
    )
      authenticated = true;
    if (!path.startsWith('/api/v1/') || response.status() < 400) return;
    if (
      !authenticated &&
      path === '/api/v1/auth/refresh' &&
      response.status() === 401
    )
      return;
    issues.push(`API: ${response.status()} ${path}`);
  });
  page.on('requestfailed', (request) => {
    // Chromium can report ERR_ABORTED for a successfully received 204:
    // there is intentionally no response body to load. Other failures still fail.
    if (
      responseStatuses.get(request) === 204 &&
      request.failure()?.errorText === 'net::ERR_ABORTED'
    )
      return;
    if (new URL(request.url()).pathname.startsWith('/api/v1/'))
      issues.push(
        `Request failed: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`,
      );
  });
  return {
    issues,
    signedIn: () => {
      authenticated = true;
    },
  };
}

export async function signup(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'vaani-e2e-passphrase';
  await page.goto('/signup');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole('heading', { name: 'Telugu Course' }),
  ).toBeVisible();
  return { email, password };
}

export async function start(page: Page): Promise<Session> {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/sessions') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Continue Telugu', exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/app\/session\//);
  await expect(page.getByRole('progressbar')).toBeVisible();
  return result.json();
}

export async function eventAction(
  page: Page,
  action: () => Promise<unknown>,
  expectedAction = 'answer',
): Promise<ActionResult> {
  const response = page.waitForResponse(
    (r) =>
      /\/sessions\/[^/]+\/events$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action === expectedAction,
  );
  await action();
  const result = await response;
  expect(result.ok(), `Learner event HTTP ${result.status()}`).toBeTruthy();
  return result.json();
}

export async function audit(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  const images = page.locator('.learning-photo img');
  for (const image of await images.all()) {
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) =>
            node.complete && node.naturalWidth > 0 && node.naturalHeight > 0,
        ),
      )
      .toBe(true);
    const source = await image.getAttribute('src');
    expect(source).not.toMatch(/placeholder|\.svg(?:\?|$)|^data:/);
    const box = await image.boundingBox();
    expect(box?.width).toBeGreaterThan(80);
    expect(box?.height).toBeGreaterThan(80);
  }
  const buttons = page.locator('button:visible');
  for (const button of await buttons.all()) {
    expect(
      (await button.getAttribute('aria-label')) ||
        (await button.innerText()).trim(),
      'Buttons need accessible names',
    ).toBeTruthy();
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
  }
  for (const control of await page
    .locator(
      '.choice-photo, .word-choice, .microphone-button, .v-button-primary',
    )
    .all()) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
}

// Only the browser speech adapter is synthetic. HTTP, auth, content, planner,
// persistence and evaluation all run against the real app and API.
export async function syntheticSpeech(page: Page) {
  await page.addInitScript(() => {
    type Callback = (event: {
      results: { isFinal: boolean; 0: { transcript: string } }[];
    }) => void;
    class Recognition {
      lang = '';
      onresult: Callback | null = null;
      onend: (() => void) | null = null;
      start() {
        (
          window as unknown as { __e2eRecognition: Recognition }
        ).__e2eRecognition = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: Recognition,
    });
  });
}

export async function answer(
  page: Page,
  info: TestInfo,
  session: Session,
  wrong = false,
  oralText?: string,
): Promise<Session> {
  const activity = session.activity!;
  const intent = activity.intent ?? intentFor(activity.type);
  const target = loadContent().catalog.items[activity.conceptId];
  if (activity.phase === 'exposure') {
    return (
      await eventAction(
        page,
        () =>
          page.getByRole('button', { name: 'I understand — continue' }).click(),
        'expose',
      )
    ).session;
  }
  if (activity.choices?.length) {
    const correctIndex = activity.choices.findIndex(
      (choice) => choice.id === activity.conceptId,
    );
    expect(correctIndex).toBeGreaterThanOrEqual(0);
    const index = wrong
      ? (correctIndex + 1) % activity.choices.length
      : correctIndex;
    expect(!wrong || activity.choices.length > 1).toBeTruthy();
    const grid = page.locator('.choice-grid');
    const cards = grid.locator('.choice-photo, .word-choice');
    const card = cards.nth(index);
    const before = await card.boundingBox();
    const region = page.getByRole('region', { name: 'Answer and continue' });
    const actionBefore = await region
      .locator('.learning-actions')
      .boundingBox();
    const geometries = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        // Measure reserved layout, excluding intentional hover/selection scale.
        const element = node as HTMLElement;
        return { width: element.offsetWidth, height: element.offsetHeight };
      }),
    );
    expect(
      Math.max(...geometries.map((r) => r.width)) -
        Math.min(...geometries.map((r) => r.width)),
    ).toBeLessThan(2);
    expect(
      Math.max(...geometries.map((r) => r.height)) -
        Math.min(...geometries.map((r) => r.height)),
    ).toBeLessThan(2);
    await screenshot(page, info, `${session.cursor}-choice-before`);
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const pattern = '**/sessions/*/events';
    await page.route(pattern, async (route) => {
      await gate;
      await route.continue();
    });
    const response = page.waitForResponse(
      (r) =>
        /\/sessions\/[^/]+\/events$/.test(new URL(r.url()).pathname) &&
        r.request().postDataJSON()?.action === 'answer',
    );
    try {
      // First choice is exercised with keyboard as well as normal pointer input.
      await card.focus();
      await card.press('Enter');
      await expect(card).toHaveAttribute('data-state', 'selected');
      await expect(card).toBeDisabled();
      await screenshot(page, info, `${session.cursor}-choice-pending`);
    } finally {
      release();
    }
    const evaluationResponse = await response;
    expect(evaluationResponse.ok()).toBeTruthy();
    const result = (await evaluationResponse.json()) as ActionResult;
    await page.unroute(pattern);
    const classification = wrong ? 'incorrect' : 'correct';
    await expect(card).toHaveAttribute('data-state', classification);
    await expect(card.locator('.choice-mark')).toHaveAttribute(
      'aria-label',
      wrong ? 'Try again' : 'Correct',
    );
    expect(
      await card.evaluate((node) => getComputedStyle(node).boxShadow),
    ).not.toBe('none');
    if (activity.choices.length > 1)
      await expect(
        grid.locator('[data-receded="true"]').first(),
      ).toBeAttached();
    const after = await card.boundingBox();
    expect(Math.abs(after!.width - before!.width)).toBeLessThan(8);
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(8);
    const actionAfter = await region.locator('.learning-actions').boundingBox();
    expect(
      Math.abs(actionAfter!.y - actionBefore!.y),
      'Primary action moved after answering',
    ).toBeLessThan(12);
    await screenshot(page, info, `${session.cursor}-choice-${classification}`);
    await page
      .getByRole('button', {
        name: wrong ? 'Try again' : 'Continue',
        exact: true,
      })
      .click();
    return result.session;
  }
  let result: ActionResult;
  if (intent.response === 'speak' && oralText) {
    await page
      .getByRole('button', { name: 'Type instead', exact: true })
      .click();
    await page.getByLabel('Your response').fill(oralText);
    result = await eventAction(page, () =>
      page.getByRole('button', { name: 'Check', exact: true }).click(),
    );
    expect(result.classification).toBe('correct');
    expect(result.evidence).toBe('unverified');
    expect(result.feedback).not.toMatch(/spelling/i);
  } else if (intent.response === 'speak') {
    await expect(page.getByLabel('Your response')).toHaveCount(0);
    const mic = page.getByRole('button', { name: /^Speak / });
    await mic.click();
    await expect(
      page.getByRole('button', { name: 'Stop recording' }),
    ).toBeVisible();
    await screenshot(page, info, `${session.cursor}-speaking-listening`);
    result = await eventAction(page, () =>
      page.evaluate((text) => {
        const recognition = (
          window as unknown as {
            __e2eRecognition: {
              lang: string;
              onresult: (event: unknown) => void;
              onend: () => void;
            };
          }
        ).__e2eRecognition;
        if (recognition.lang !== 'te-IN')
          throw new Error('Wrong speech locale');
        recognition.onresult({
          results: [{ isFinal: true, 0: { transcript: text } }],
        });
        recognition.onend?.();
      }, target.telugu),
    );
  } else if (intent.response === 'build') {
    const tiles = activity.tiles ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    for (const word of target.telugu
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/[\p{P}]+$/gu, ''))) {
      const candidates = await page
        .getByRole('button', { name: `Add ${word}`, exact: true })
        .all();
      let found = false;
      for (const candidate of candidates) {
        if (await candidate.isEnabled()) {
          await candidate.click();
          found = true;
          break;
        }
      }
      expect(found, `Missing sentence tile ${word}`).toBe(true);
    }
    await screenshot(page, info, `${session.cursor}-sentence-built`);
    result = await eventAction(page, () =>
      page.getByRole('button', { name: 'Check', exact: true }).click(),
    );
  } else if (intent.skill === 'writing') {
    await page.getByLabel('Your response').fill(target.telugu);
    result = await eventAction(page, () =>
      page.getByRole('button', { name: 'Check', exact: true }).click(),
    );
  } else {
    throw new Error(
      `Unsupported non-writing interaction: ${activity.type} / ${intent.response}`,
    );
  }
  expect(result.classification).not.toBe('incorrect');
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeVisible();
  await screenshot(page, info, `${session.cursor}-feedback`);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  return result.session;
}
