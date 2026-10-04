import type { ConceptMedia } from '@vaani/learning-core';
import { apiClient } from '../../../lib/api-client';
export interface MediaProvider {
  resolve(
    media: ConceptMedia,
    signal?: AbortSignal,
    failedUrl?: string,
  ): Promise<ConceptMedia>;
}
export class ApiPhotoProvider implements MediaProvider {
  private readonly pending = new Map<string, Promise<ConceptMedia>>();
  async resolve(
    media: ConceptMedia,
    signal?: AbortSignal,
    failedUrl?: string,
  ): Promise<ConceptMedia> {
    if (media.url && !failedUrl) return media;
    const key = `${media.key}:${failedUrl ?? ''}`;
    let request = this.pending.get(key);
    if (!request) {
      request = apiClient
        .request<{ status: string; media?: ConceptMedia }>(
          `/course/media/${encodeURIComponent(media.key)}${failedUrl ? `?${new URLSearchParams({ failedUrl })}` : ''}`,
        )
        .then((result) => {
          if (result.status !== 'ready' || !result.media?.url)
            throw new Error('No usable media');
          return result.media;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, request);
    }
    const resolved = await request;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return resolved;
  }
}
export const mediaProvider: MediaProvider = new ApiPhotoProvider();
