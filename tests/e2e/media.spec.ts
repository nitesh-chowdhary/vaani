import { test, expect } from '@playwright/test';
import { mediaForConcept } from '../../packages/learning-core/src/content/media';

test('curated milk photograph loads from the local application', async ({
  page,
}, info) => {
  const media = mediaForConcept({
    id: 'te.lex.milk',
    english: 'milk',
    topic: 'food',
  });
  expect(media?.source).toBe('local');
  expect(media?.url).toBe('/media/telugu/beginner/milk.jpg');
  const response = await page.goto(media!.url!);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-type']).toContain('image/jpeg');
  const image = page.locator('img');
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) =>
          node.complete &&
          node.naturalWidth >= 600 &&
          node.naturalHeight >= 400,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('milk-photograph.png') });
});
