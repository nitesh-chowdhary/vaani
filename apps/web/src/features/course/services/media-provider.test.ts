import { afterEach, describe, it, expect, vi } from 'vitest';
import { apiClient } from '../../../lib/api-client';
import { ApiPhotoProvider } from './media-provider';
import type { ConceptMedia } from '@vaani/learning-core';
const media: ConceptMedia = {
  kind: 'image',
  key: 'te.lex.bus',
  alt: 'Bus',
  query: 'city bus side view',
  source: 'placeholder',
  fallback: '/fallback.svg',
};
afterEach(() => vi.restoreAllMocks());
describe('server media adapter', () => {
  it('does not search over already resolved media', async () => {
    const request = vi.spyOn(apiClient, 'request');
    const ready = { ...media, url: '/media/bus.jpg' };
    expect(await new ApiPhotoProvider().resolve(ready)).toBe(ready);
    expect(request).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent resolution and delegates caching to the API', async () => {
    const ready = { ...media, url: 'https://images.pexels.com/bus.jpg' };
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue({ status: 'ready', media: ready });
    const provider = new ApiPhotoProvider();
    expect(
      await Promise.all([provider.resolve(media), provider.resolve(media)]),
    ).toEqual([ready, ready]);
    expect(request).toHaveBeenCalledOnce();
  });
  it('reports unusable media to the activity rather than returning a placeholder', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({ status: 'unavailable' });
    await expect(new ApiPhotoProvider().resolve(media)).rejects.toThrow(
      'No usable media',
    );
  });
  it('reports a runtime failure to the server to move through the provider chain', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
      status: 'ready',
      media: { ...media, url: '/media/other.jpg' },
    });
    await new ApiPhotoProvider().resolve(
      { ...media, url: 'https://images.pexels.com/bad.jpg' },
      undefined,
      'https://images.pexels.com/bad.jpg',
    );
    expect(request.mock.calls[0][0]).toContain('failedUrl=');
  });
});
