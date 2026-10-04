import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ConceptMedia } from '@vaani/learning-core';
import { mediaForConcept } from '@vaani/learning-core';
import { createMediaResolver, type MediaResult } from './media.resolver.js';
import {
  photoProviders,
  PhotoError,
  validatePhoto,
  type PhotoProvider,
} from './media.providers.js';
import { prepareSessionMedia, type SessionView } from './media.presentation.js';
const media: ConceptMedia = {
  kind: 'image',
  key: 'te.lex.water',
  query: 'clear glass of water',
  source: 'placeholder',
  alt: 'Water',
  fallback: '/fallback.svg',
};
const photo = (provider: string): ConceptMedia => ({
  ...media,
  url: `https://images.pexels.com/${provider}.jpg`,
  source: 'remote',
  width: 1200,
  height: 800,
  attribution: {
    creator: 'Photographer',
    sourceName: provider,
    sourceUrl: 'https://www.pexels.com/photo/1',
    licenseUrl: 'https://www.pexels.com/license/',
  },
});
function setup(providers: PhotoProvider[]) {
  const cache = new Map<string, MediaResult>();
  const validate = vi.fn().mockResolvedValue(undefined);
  const resolver = createMediaResolver({
    providers,
    validate,
    local: () => true,
    store: {
      get: async (key) => cache.get(key),
      put: async (key, value) => {
        cache.set(key, value);
      },
    },
  });
  return { resolver, validate, cache };
}
const provider = (
  name: string,
  works = true,
  configured = true,
): PhotoProvider => ({
  name,
  configured,
  search: vi.fn().mockImplementation(async () => {
    if (!works) throw new PhotoError('rate_limit');
    return [photo(name)];
  }),
});
afterEach(() => vi.unstubAllGlobals());
describe('ordered server photo pipeline', () => {
  it('curation wins without any external request', async () => {
    const p = provider('primary');
    const { resolver } = setup([p]);
    const result = await resolver.resolve({
      ...media,
      source: 'local',
      url: '/media/water.jpg',
    });
    expect(result.status).toBe('ready');
    expect(p.search).not.toHaveBeenCalled();
  });
  it.each([
    [true, true, 'primary'],
    [false, true, 'secondary'],
    [false, false, 'commons'],
  ])('primary %s secondary %s selects %s', async (a, b, name) => {
    const { resolver } = setup([
      provider('primary', a as boolean),
      provider('secondary', b as boolean),
      provider('commons'),
    ]);
    expect((await resolver.resolve(media)).media?.provider).toBe(name);
  });
  it('unconfigured provider is skipped', async () => {
    const p = provider('primary', true, false);
    const { resolver } = setup([p, provider('secondary')]);
    expect((await resolver.resolve(media)).media?.provider).toBe('secondary');
    expect(p.search).not.toHaveBeenCalled();
  });
  it('all providers unavailable is a bounded cached result, not an exception', async () => {
    const { resolver } = setup([
      provider('primary', false),
      provider('secondary', false),
      provider('commons', false),
    ]);
    expect((await resolver.resolve(media)).status).toBe('unavailable');
  });
  it('deduplicates concurrency and reuses persisted resolution across resolver instances', async () => {
    const p = provider('primary');
    const { resolver, cache } = setup([p]);
    await Promise.all([resolver.resolve(media), resolver.resolve(media)]);
    await resolver.resolve(media);
    expect(p.search).toHaveBeenCalledOnce();
    expect(cache.size).toBe(1);
  });
  it('runtime failure invalidates the selected URL and tries the next source', async () => {
    const { resolver } = setup([provider('primary'), provider('secondary')]);
    const first = await resolver.resolve(media);
    expect(
      (await resolver.resolve(media, first.media!.url)).media?.provider,
    ).toBe('secondary');
  });
  it('invalid selected candidate does not stop fallback', async () => {
    const { resolver, validate } = setup([
      provider('primary'),
      provider('secondary'),
    ]);
    validate.mockRejectedValueOnce(new PhotoError('unsupported_format'));
    expect((await resolver.resolve(media)).media?.provider).toBe('secondary');
  });
  it('rejects private URLs before making network requests', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      validatePhoto({ ...photo('bad'), url: 'http://127.0.0.1/secret' }),
    ).rejects.toThrow('invalid_url');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('Commons considers multiple licensed candidates, not the first result', async () => {
    const page = (name: string) => ({
      title: name,
      imageinfo: [
        {
          mime: 'image/jpeg',
          width: 1200,
          height: 800,
          thumburl: `https://upload.wikimedia.org/${name}.jpg`,
          descriptionurl: 'https://commons.wikimedia.org/file',
          extmetadata: {
            Artist: { value: 'Photographer' },
            LicenseShortName: { value: 'CC BY 4.0' },
            LicenseUrl: {
              value: 'https://creativecommons.org/licenses/by/4.0/',
            },
            ImageDescription: { value: name },
          },
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              a: page('Water diagram'),
              b: page('Landscape'),
              c: page('Glass of water'),
            },
          },
        }),
      }),
    );
    const candidates = await photoProviders({}).at(-1)!.search(media);
    expect(candidates[0].alt).toContain('Glass of water');
    expect(candidates.some((c) => /diagram/.test(c.alt))).toBe(false);
  });
  it('does not force abstract vocabulary to photographs', () => {
    expect(
      mediaForConcept({
        id: 'te.lex.want-need',
        topic: 'intent',
        english: 'want / need',
      }),
    ).toBeUndefined();
  });
  it('all-source failure changes image-dependent choices to audio/target choices', async () => {
    const session = {
      presentation: { targetLanguage: { speechLocale: 'te-IN' } },
      activity: {
        id: 'a',
        type: 'audio_image_recognition',
        conceptId: 'te.lex.water',
        intent: {
          cue: 'audio',
          response: 'choose_media',
          skill: 'listening',
          answer: 'choice',
        },
        choiceMode: 'media',
        mediaCue: media,
        target: null,
        choices: [
          { id: 'te.lex.water', media },
          { id: 'te.lex.tea', media: { ...media, key: 'te.lex.tea' } },
        ],
      },
    } as unknown as SessionView;
    const result = await prepareSessionMedia(session, false, async () => ({
      status: 'unavailable',
      expiresAt: Date.now() + 1,
    }));
    expect(result.activity?.choiceMode).toBe('telugu');
    expect(result.activity?.intent?.response).toBe('choose_target');
    expect(result.activity?.audio?.text).toBe('నీళ్లు');
    expect(result.activity?.choices?.map((c) => c.id)).toEqual([
      'te.lex.water',
      'te.lex.tea',
    ]);
    expect(result.activity?.choices?.some((c) => c.media)).toBe(false);
  });
});

it('configured Pexels uses backend authorization and preserves asset/license metadata', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      photos: [
        {
          id: 12,
          alt: 'Clear glass of water',
          width: 1200,
          height: 800,
          url: 'https://www.pexels.com/photo/12',
          photographer: 'Photographer',
          photographer_url: 'https://www.pexels.com/@creator',
          src: { large: 'https://images.pexels.com/photos/12.jpg' },
        },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  const result = (
    await photoProviders({ pexelsKey: 'test-server-key' })[0].search(media)
  )[0];
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
    'test-server-key',
  );
  expect(result.assetId).toBe('12');
  expect(result.attribution?.licenseUrl).toBe(
    'https://www.pexels.com/license/',
  );
  expect(JSON.stringify(result)).not.toContain('test-server-key');
});
it('configured Unsplash preserves hotlink URLs and tracks selection, not every render', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        {
          id: 'abc',
          alt_description: 'Clear glass of water',
          width: 1200,
          height: 800,
          urls: {
            regular: 'https://images.unsplash.com/photo-abc?ixid=authored',
          },
          links: { html: 'https://unsplash.com/photos/abc' },
          user: {
            name: 'Photographer',
            links: { html: 'https://unsplash.com/@creator' },
          },
        },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  const p = photoProviders({ unsplashKey: 'test-server-key' })[1];
  const candidate = (await p.search(media))[0];
  expect(candidate.url).toBe(
    'https://images.unsplash.com/photo-abc?ixid=authored',
  );
  await p.selected!(candidate);
  expect(fetcher.mock.calls[1][0]).toContain('/photos/abc/download');
  expect(candidate.attribution?.sourceUrl).toContain('utm_source=vaani');
});
it('real API rate limits are categorized without exposing credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  await expect(
    photoProviders({ pexelsKey: 'test' })[0].search(media),
  ).rejects.toMatchObject({ category: 'rate_limit' });
});
it('quarantines multiple failed URLs without alternating back onto a broken asset', async () => {
  const { resolver } = setup([provider('primary'), provider('secondary')]);
  const a = await resolver.resolve(media);
  const b = await resolver.resolve(media, a.media!.url);
  const exhausted = await resolver.resolve(media, b.media!.url);
  expect(exhausted.status).toBe('unavailable');
  expect(exhausted.rejectedUrls).toHaveLength(2);
});
it('cached metadata is reused by a different resolver instance', async () => {
  const p = provider('primary');
  const { resolver, cache } = setup([p]);
  await resolver.resolve(media);
  const other = createMediaResolver({
    providers: [p],
    store: { get: async (key) => cache.get(key), put: async () => {} },
    validate: async () => {},
  });
  expect((await other.resolve(media)).status).toBe('ready');
  expect(p.search).toHaveBeenCalledOnce();
});
it('cache failure does not turn media into a failing course API', async () => {
  const resolver = createMediaResolver({
    providers: [provider('primary')],
    validate: async () => {},
    store: {
      get: async () => {
        throw new Error('cache offline');
      },
      put: async () => {
        throw new Error('cache offline');
      },
    },
  });
  expect((await resolver.resolve(media)).status).toBe('ready');
});
it('MIME claims without an image file signature are rejected', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('not a photograph', {
        headers: { 'content-type': 'image/jpeg' },
      }),
    ),
  );
  await expect(validatePhoto(photo('fake'))).rejects.toMatchObject({
    category: 'unsupported_format',
  });
});
