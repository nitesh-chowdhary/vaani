import { mediaResolver } from '../content/media.resolver.js';
import { z } from 'zod';
import { ApiError } from '../../infrastructure/errors/api-error.js';
import { Router } from 'express';
import { loadContent } from '../content/content.service.js';
import {
  createSessionService,
  publicItem,
} from '../sessions/sessions.service.js';
import { coursePresentation } from './course.presentation.js';
import { progress } from '../progress/progress.service.js';
export function courseRoutes() {
  const router = Router();
  const service = createSessionService();
  router.get('/media/:id', async (req, res) => {
    const item = loadContent().catalog.items[req.params.id as string];
    if (!item) throw new ApiError(404, 'not_found', 'Content not found.');
    const parsed = z
      .object({ failedUrl: z.string().max(2048).optional() })
      .safeParse(req.query);
    if (!parsed.success)
      throw new ApiError(400, 'invalid_input', 'Invalid request.');
    res.json(
      item.media
        ? await mediaResolver.resolve(item.media, parsed.data.failedUrl)
        : { status: 'unavailable' },
    );
  });
  router.get('/', async (req, res) => {
    const { catalog } = loadContent();
    const presentation = coursePresentation(catalog);
    res.json({
      id: catalog.master.courseId,
      title: `${presentation.targetLanguage.name} Course`,
      baseLanguage: presentation.baseLanguage.code,
      presentation,
      preview: Object.values(catalog.items)
        .filter(
          (item) =>
            item.family === 'lexicalConcepts' && item.media?.source === 'local',
        )
        .slice(0, 4)
        .map((item) => publicItem(item, false)),
      progress: await progress(req.auth!.userId),
      activeSession: await service.active(req.auth!.userId),
    });
  });
  return router;
}
