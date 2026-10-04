import type { ConceptMedia } from '@vaani/learning-core';

export interface MediaProvider {
  resolve(media: ConceptMedia, signal?: AbortSignal): Promise<ConceptMedia>;
}

interface CommonsImageInfo {
  mime?: string;
  width?: number;
  height?: number;
  title?: string;
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface CommonsPage {
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsSearchResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

function plainText(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function readCache(key: string): ConceptMedia | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as ConceptMedia) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, media: ConceptMedia): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(media));
  } catch {
    // Private browsing or storage limits do not block the learning session.
  }
}

export class WikimediaCommonsPhotoProvider implements MediaProvider {
  private readonly memoryCache = new Map<string, ConceptMedia>();

  async resolve(
    media: ConceptMedia,
    signal?: AbortSignal,
  ): Promise<ConceptMedia> {
    if (media.url || !media.query) return media;
    const cacheKey = `vaani:learning-photo:v2:${media.key}:${media.query}`;
    const cached = this.memoryCache.get(cacheKey) ?? readCache(cacheKey);
    if (cached) {
      this.memoryCache.set(cacheKey, cached);
      return {
        ...media,
        url: cached.url,
        source: cached.source,
        attribution: cached.attribution,
      };
    }

    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${media.query} ${(media.intent?.exclude ?? []).map((term) => `-${term}`).join(' ')}`,
      gsrnamespace: '6',
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata',
      iiurlwidth: '1000',
      format: 'json',
      origin: '*',
    });
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok)
      throw new Error('Photo search is temporarily unavailable.');
    const result = (await response.json()) as CommonsSearchResponse;
    const candidates = Object.values(result.query?.pages ?? {})
      .flatMap((page) =>
        (page.imageinfo ?? []).map((image) => ({
          ...image,
          title: page.title,
        })),
      )
      .filter((image) =>
        ['image/jpeg', 'image/webp'].includes(image.mime ?? ''),
      );
    const ranked = candidates.filter((image) => {
      const metadata = image.extmetadata ?? {};
      const license = plainText(metadata.LicenseShortName?.value).toLowerCase();
      return (
        (image.width ?? 0) >= 600 &&
        (image.height ?? 0) >= 400 &&
        !/diagram|logo|map\b|screenshot|scan\b|collage|painting|illustration|drawing|poster|engraving/i.test(
          plainText(
            `${image.title ?? ''} ${metadata.ImageDescription?.value ?? ''}`,
          ),
        ) &&
        !(media.intent?.exclude ?? []).some((term) =>
          plainText(
            `${image.title ?? ''} ${metadata.ImageDescription?.value ?? ''}`,
          )
            .toLowerCase()
            .split(/\W+/)
            .includes(term),
        ) &&
        !!image.thumburl &&
        !!image.descriptionurl &&
        !!metadata.LicenseUrl?.value &&
        !!metadata.Artist?.value &&
        (license.includes('cc') || license.includes('public domain'))
      );
    });
    const terms = (media.intent?.subject ?? media.query)
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 2);
    const score = (image: CommonsImageInfo) => {
      const description = plainText(
        `${image.title ?? ''} ${image.extmetadata?.ImageDescription?.value ?? ''}`,
      ).toLowerCase();
      const relevance = terms.reduce(
        (sum, term) => sum + (description.split(/\W+/).includes(term) ? 10 : 0),
        0,
      );
      const ratio = (image.width ?? 1) / (image.height ?? 1);
      return (
        relevance +
        (ratio >= 0.8 && ratio <= 1.8 ? 5 : 0) +
        Math.min(((image.width ?? 0) * (image.height ?? 0)) / 1000000, 3)
      );
    };
    ranked.sort(
      (a, b) =>
        score(b) - score(a) ||
        (a.descriptionurl ?? '').localeCompare(b.descriptionurl ?? ''),
    );
    const selected = ranked[0];
    if (!selected) throw new Error('No openly licensed photograph was found.');

    const metadata = selected.extmetadata ?? {};
    const resolved: ConceptMedia = {
      ...media,
      url: selected.thumburl,
      source: 'remote',
      attribution: {
        creator: plainText(metadata.Artist?.value) || 'Photographer',
        sourceName: 'Wikimedia Commons',
        sourceUrl: selected.descriptionurl!,
        licenseUrl: metadata.LicenseUrl!.value!,
        licenseName:
          plainText(metadata.LicenseShortName?.value) || 'Open license',
      },
    };
    this.memoryCache.set(cacheKey, resolved);
    writeCache(cacheKey, resolved);
    return resolved;
  }
}

export const mediaProvider: MediaProvider = new WikimediaCommonsPhotoProvider();
