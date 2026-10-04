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
