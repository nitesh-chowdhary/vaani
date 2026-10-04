import { Schema, model } from 'mongoose';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConceptMedia } from '@vaani/learning-core';
import {
  PhotoError,
  photoProviders,
  validatePhoto,
  type PhotoProvider,
  type MediaFailure,
} from './media.providers.js';
export interface MediaResult {
  status: 'ready' | 'unavailable';
  media?: ConceptMedia;
  expiresAt: number;
  rejectedUrls?: string[];
}
const schema = new Schema({
  key: { type: String, unique: true },
  result: Schema.Types.Mixed,
  expiresAt: Date,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const MediaAsset = model('MediaAsset', schema);
export interface MediaStore {
  get(key: string): Promise<MediaResult | undefined>;
  put(key: string, result: MediaResult): Promise<void>;
}
const mongoStore: MediaStore = {
  async get(key) {
    const record = await MediaAsset.findOne({
      key,
      expiresAt: { $gt: new Date() },
    }).lean();
    return record?.result as MediaResult | undefined;
  },
  async put(key, result) {
    await MediaAsset.updateOne(
      { key },
      { $set: { result, expiresAt: new Date(result.expiresAt) } },
      { upsert: true },
    );
  },
};
export function createMediaResolver(options: {
  providers: PhotoProvider[];
  store: MediaStore;
  validate?: (media: ConceptMedia) => Promise<void>;
  local?: (url: string) => boolean;
  diagnose?: (key: string, provider: string, category: MediaFailure) => void;
}) {
  const pending = new Map<string, Promise<MediaResult>>();
  const cooldown = new Map<string, number>();
  const validate = options.validate ?? validatePhoto;
  const local =
    options.local ??
    ((url) =>
      /^\/media\/[\w/-]+\.(jpg|png|webp)$/.test(url) &&
      existsSync(
        fileURLToPath(new URL(`../../../../web/public${url}`, import.meta.url)),
      ));
  return {
    async resolve(
      media: ConceptMedia,
      failedUrl?: string,
    ): Promise<MediaResult> {
      const key = `v3:${media.key}:${media.query}`;
      if (pending.has(key)) {
        const result = await pending.get(key)!;
        if (!failedUrl || result.media?.url !== failedUrl) return result;
      }
      const work = (async (): Promise<MediaResult> => {
        let cached: MediaResult | undefined;
        try {
          cached = await options.store.get(key);
        } catch {
          options.diagnose?.(media.key, 'cache', 'cache_error');
        }
        const rejected = new Set(cached?.rejectedUrls ?? []);
        if (
          failedUrl &&
          (failedUrl === media.url || failedUrl === cached?.media?.url)
        )
          rejected.add(failedUrl);
        if (
          !failedUrl &&
          media.source === 'local' &&
          media.url &&
          !rejected.has(media.url) &&
          local(media.url)
        )
          return {
            status: 'ready',
            media: { ...media, provider: 'local', resolutionStatus: 'ready' },
            expiresAt: Date.now() + 86400000,
          };
        if (
          cached &&
          cached.expiresAt > Date.now() &&
          (!failedUrl || cached.media?.url !== failedUrl)
        )
          return cached;
        if (failedUrl)
          options.diagnose?.(
            media.key,
            media.provider ?? media.source,
            'runtime_load_failure',
          );
        if (!media.query.trim()) {
          options.diagnose?.(media.key, 'none', 'bad_query');
          return save({
            status: 'unavailable',
            expiresAt: Date.now() + 600000,
          });
        }
        const deadline = Date.now() + 6000;
        for (const provider of options.providers) {
          if (Date.now() > deadline) break;
          if ((cooldown.get(provider.name) ?? 0) > Date.now()) {
            options.diagnose?.(media.key, provider.name, 'provider_cooldown');
            continue;
          }
          if (!provider.configured) {
            options.diagnose?.(media.key, provider.name, 'not_configured');
            continue;
          }
          try {
            const candidates = await provider.search(media);
            if (!candidates.length)
              options.diagnose?.(media.key, provider.name, 'no_results');
            for (const candidate of candidates.slice(0, 3)) {
              if (Date.now() > deadline) break;
              if (candidate.url && rejected.has(candidate.url)) continue;
              try {
                await validate(candidate);
                await provider.selected?.(candidate);
                return save({
                  status: 'ready',
                  media: {
                    ...candidate,
                    provider: provider.name,
                    resolutionStatus: 'ready',
                    resolvedAt: Date.now(),
                  },
                  expiresAt: Date.now() + 86400000,
                });
              } catch (error) {
                if (candidate.url) rejected.add(candidate.url);
                options.diagnose?.(
                  media.key,
                  provider.name,
                  error instanceof PhotoError
                    ? error.category
                    : 'image_http_failure',
                );
              }
            }
          } catch (error) {
            cooldown.set(provider.name, Date.now() + 60000);
            options.diagnose?.(
              media.key,
              provider.name,
              error instanceof PhotoError ? error.category : 'provider_error',
            );
          }
        }
        return save({ status: 'unavailable', expiresAt: Date.now() + 600000 });
        async function save(result: MediaResult) {
          result.rejectedUrls = [...rejected].slice(-8);
          try {
            await options.store.put(key, result);
          } catch {
            options.diagnose?.(media.key, 'cache', 'cache_error');
          }
          return result;
        }
      })();
      pending.set(key, work);
      try {
        return await work;
      } finally {
        if (pending.get(key) === work) pending.delete(key);
      }
    },
  };
}
export const mediaResolver = createMediaResolver({
  providers: photoProviders({
    pexelsKey: process.env.PEXELS_API_KEY,
    unsplashKey: process.env.UNSPLASH_ACCESS_KEY,
  }),
  store: mongoStore,
  diagnose: (key, provider, category) => {
    if (process.env.NODE_ENV !== 'production')
      console.info('[media]', { key, provider, category });
  },
});
