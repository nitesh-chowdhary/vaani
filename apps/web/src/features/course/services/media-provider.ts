import type { ConceptMedia } from '@vaani/learning-core';

export interface MediaProvider {
  resolve(media: ConceptMedia, signal?: AbortSignal): Promise<ConceptMedia>;
}

interface CommonsImageInfo {
  mime?: string;
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface CommonsPage {
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

  async resolve(media: ConceptMedia, signal?: AbortSignal): Promise<ConceptMedia> {
    if (media.url || !media.query) return media;
    const cacheKey = `vaani:learning-photo:${media.key}:${media.query}`;
    const cached = this.memoryCache.get(cacheKey) ?? readCache(cacheKey);
    if (cached) {
      this.memoryCache.set(cacheKey, cached);
      return cached;
    }

    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${media.query}`,
      gsrnamespace: '6',
      gsrlimit: '8',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '1000',
      format: 'json',
      origin: '*',
    });
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error('Photo search is temporarily unavailable.');
    const result = (await response.json()) as CommonsSearchResponse;
    const candidates = Object.values(result.query?.pages ?? {})
      .flatMap((page) => page.imageinfo ?? [])
      .filter((image) =>
        ['image/jpeg', 'image/webp'].includes(image.mime ?? ''),
      );
    const selected = candidates.find((image) => {
      const metadata = image.extmetadata ?? {};
      const license = plainText(metadata.LicenseShortName?.value).toLowerCase();
      return (
        !!image.thumburl &&
        !!image.descriptionurl &&
        !!metadata.LicenseUrl?.value &&
        !!metadata.Artist?.value &&
        (license.includes('cc') || license.includes('public domain'))
      );
    });
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
        licenseName: plainText(metadata.LicenseShortName?.value) || 'Open license',
      },
    };
    this.memoryCache.set(cacheKey, resolved);
    writeCache(cacheKey, resolved);
    return resolved;
  }
}

export const mediaProvider: MediaProvider = new WikimediaCommonsPhotoProvider();
