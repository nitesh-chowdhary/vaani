import type { ConceptMedia } from '@vaani/learning-core';
export type MediaFailure =
  | 'not_configured'
  | 'no_results'
  | 'rate_limit'
  | 'provider_error'
  | 'invalid_url'
  | 'unsupported_format'
  | 'image_http_failure'
  | 'insufficient_resolution'
  | 'runtime_load_failure'
  | 'missing_metadata'
  | 'bad_query'
  | 'cache_error'
  | 'provider_cooldown';
export class PhotoError extends Error {
  constructor(public category: MediaFailure) {
    super(category);
  }
}
export interface PhotoProvider {
  name: string;
  configured: boolean;
  search(media: ConceptMedia): Promise<ConceptMedia[]>;
  selected?(media: ConceptMedia): Promise<void>;
}
export interface PhotoConfig {
  pexelsKey?: string;
  unsplashKey?: string;
}
export async function providerJson(
  url: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok)
    throw new PhotoError(
      response.status === 429 ? 'rate_limit' : 'provider_error',
    );
  return response.json();
}
function text(value: unknown) {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}
function rank(candidates: ConceptMedia[], media: ConceptMedia) {
  const words = (media.intent?.subject ?? media.query)
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  return candidates
    .filter(
      (c) =>
        c.url &&
        c.attribution &&
        (c.width ?? 0) >= 600 &&
        (c.height ?? 0) >= 400,
    )
    .filter(
      (c) =>
        !/(diagram|logo|screenshot|painting|collage|illustration|scan)\b/i.test(
          c.alt,
        ),
    )
    .sort((a, b) =>
      words.reduce(
        (n, w) =>
          n +
          (b.alt.toLowerCase().includes(w) ? 1 : 0) -
          (a.alt.toLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    );
}
export function photoProviders(config: PhotoConfig): PhotoProvider[] {
  return [
    {
      name: 'pexels',
      configured: !!config.pexelsKey,
      async search(media) {
        const data = await providerJson(
          `https://api.pexels.com/v1/search?${new URLSearchParams({ query: media.query, per_page: '12' })}`,
          { Authorization: config.pexelsKey! },
        );
        return rank(
          (data.photos ?? []).map(
            (p: {
              id: number;
              alt: string;
              width: number;
              height: number;
              url: string;
              photographer: string;
              photographer_url: string;
              src: { large: string };
            }) => ({
              ...media,
              source: 'remote',
              provider: 'pexels',
              assetId: String(p.id),
              url: p.src?.large,
              width: p.width,
              height: p.height,
              alt: p.alt,
              attribution: {
                creator: p.photographer,
                creatorUrl: p.photographer_url,
                sourceName: 'Pexels',
                sourceUrl: p.url,
                licenseUrl: 'https://www.pexels.com/license/',
              },
            }),
          ),
          media,
        );
      },
    },
    {
      name: 'unsplash',
      configured: !!config.unsplashKey,
      async search(media) {
        const data = await providerJson(
          `https://api.unsplash.com/search/photos?${new URLSearchParams({ query: media.query, per_page: '12' })}`,
          {
            Authorization: `Client-ID ${config.unsplashKey}`,
            'Accept-Version': 'v1',
          },
        );
        return rank(
          (data.results ?? []).map(
            (p: {
              id: string;
              alt_description: string;
              width: number;
              height: number;
              urls: { regular: string };
              links: { html: string };
              user: { name: string; links: { html: string } };
            }) => ({
              ...media,
              source: 'remote',
              provider: 'unsplash',
              assetId: p.id,
              url: p.urls?.regular,
              width: p.width,
              height: p.height,
              alt: p.alt_description ?? media.alt,
              attribution: {
                creator: p.user?.name,
                creatorUrl: `${p.user?.links?.html}?utm_source=vaani&utm_medium=referral`,
                sourceName: 'Unsplash',
                sourceUrl: `${p.links?.html}?utm_source=vaani&utm_medium=referral`,
                licenseUrl: 'https://unsplash.com/license',
              },
            }),
          ),
          media,
        );
      },
      async selected(media) {
        await providerJson(
          `https://api.unsplash.com/photos/${encodeURIComponent(media.assetId!)}/download`,
          { Authorization: `Client-ID ${config.unsplashKey}` },
        );
      },
    },
    {
      name: 'commons',
      configured: true,
      async search(media) {
        const params = new URLSearchParams({
          action: 'query',
          generator: 'search',
          gsrsearch: `filetype:bitmap ${media.query} ${(media.intent?.exclude ?? []).map((t) => `-${t}`).join(' ')}`,
          gsrnamespace: '6',
          gsrlimit: '20',
          prop: 'imageinfo',
          iiprop: 'url|mime|size|extmetadata',
          iiurlwidth: '1000',
          format: 'json',
        });
        const data = await providerJson(
          `https://commons.wikimedia.org/w/api.php?${params}`,
        );
        const candidates: ConceptMedia[] = [];
        for (const page of Object.values(data.query?.pages ?? {}) as {
          title: string;
          imageinfo?: {
            mime: string;
            width: number;
            height: number;
            thumburl: string;
            descriptionurl: string;
            extmetadata: Record<string, { value: string }>;
          }[];
        }[]) {
          for (const image of page.imageinfo ?? []) {
            const meta = image.extmetadata ?? {};
            if (
              !['image/jpeg', 'image/webp', 'image/png'].includes(image.mime) ||
              !/cc|public domain/i.test(text(meta.LicenseShortName?.value)) ||
              !meta.Artist?.value ||
              !meta.LicenseUrl?.value
            )
              continue;
            candidates.push({
              ...media,
              source: 'remote',
              provider: 'commons',
              assetId: page.title,
              url: image.thumburl,
              width: image.width,
              height: image.height,
              alt: text(`${page.title} ${meta.ImageDescription?.value ?? ''}`),
              attribution: {
                creator: text(meta.Artist.value),
                sourceName: 'Wikimedia Commons',
                sourceUrl: image.descriptionurl,
                licenseUrl: meta.LicenseUrl.value,
                licenseName: text(meta.LicenseShortName?.value),
              },
            });
          }
        }
        return rank(candidates, media);
      },
    },
  ];
}
export function allowedPhotoUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      [
        'images.pexels.com',
        'images.unsplash.com',
        'upload.wikimedia.org',
        'thumb.wikimedia.org',
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
export async function validatePhoto(media: ConceptMedia): Promise<void> {
  if (!media.url || !allowedPhotoUrl(media.url))
    throw new PhotoError('invalid_url');
  // Provider dimensions supplement byte/MIME validation. Do not send secrets to CDNs.
  if ((media.width ?? 0) < 600 || (media.height ?? 0) < 400)
    throw new PhotoError('insufficient_resolution');
  const response = await fetch(media.url, {
    method: 'GET',
    headers: { Range: 'bytes=0-31' },
    redirect: 'error',
    signal: AbortSignal.timeout(2500),
  });
  try {
    if (!response.ok) throw new PhotoError('image_http_failure');
    if (
      !/^image\/(jpeg|png|webp)(?:;|$)/i.test(
        response.headers.get('content-type') ?? '',
      )
    )
      throw new PhotoError('unsupported_format');
    const reader = response.body?.getReader();
    const bytes = (await reader?.read())?.value;
    await reader?.cancel();
    if (
      !bytes ||
      !(
        (bytes[0] === 255 && bytes[1] === 216) ||
        (bytes[0] === 137 && bytes[1] === 80) ||
        (bytes[0] === 82 && bytes[1] === 73)
      )
    )
      throw new PhotoError('unsupported_format');
  } finally {
    await response.body?.cancel().catch(() => {});
  }
}
