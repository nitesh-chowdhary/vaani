import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConceptMedia } from '@vaani/learning-core';
import { WikimediaCommonsPhotoProvider } from './media-provider';
const media: ConceptMedia = {
  kind: 'image',
  key: 'test-apple',
  alt: 'Apple',
  fallback: '/fallback.svg',
  query: 'single red apple clearly visible',
  source: 'placeholder',
  intent: {
    subject: 'apple',
    category: 'object',
    framing: 'clearly visible',
    isolated: true,
    allowPeople: false,
    exclude: ['diagram'],
  },
};
function page(title: string, width = 1200, height = 900) {
  return {
    title,
    imageinfo: [
      {
        mime: 'image/jpeg',
        width,
        height,
        thumburl: `https://example.com/${title}.jpg`,
        descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
        extmetadata: {
          Artist: { value: 'Photographer' },
          LicenseShortName: { value: 'CC BY 4.0' },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
          ImageDescription: { value: title },
        },
      },
    ],
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
describe('ranked photo selection', () => {
  it('ranks multiple candidates and rejects graphics and inadequate resolution', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            a: page('Fruit market'),
            b: page('Apple diagram'),
            c: page('Apple', 200, 200),
            d: page('Single apple'),
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new WikimediaCommonsPhotoProvider();
    const result = await provider.resolve(media);
    expect(result.url).toContain('Single apple');
    expect(result.attribution?.licenseName).toBe('CC BY 4.0');
    expect(fetchMock.mock.calls[0][0]).toContain('gsrlimit=20');
    expect((await provider.resolve(media)).url).toBe(result.url);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('never searches over a curated or authored asset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const curated = {
      ...media,
      url: '/media/apple.jpg',
      source: 'local' as const,
    };
    expect(await new WikimediaCommonsPhotoProvider().resolve(curated)).toBe(
      curated,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a result set with no suitable licensed photograph', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ query: { pages: { a: page('Apple logo') } } }),
      }),
    );
    await expect(
      new WikimediaCommonsPhotoProvider().resolve(media),
    ).rejects.toThrow('No openly licensed');
  });
});
