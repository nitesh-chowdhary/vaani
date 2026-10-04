import { prepareSessionMedia } from '../content/media.presentation.js';
import { Router } from 'express';
import { createSessionService } from './sessions.service.js';
import {
  actionSchema,
  finishSchema,
  payload,
  startSchema,
} from './sessions.validation.js';
export function sessionRoutes() {
  const router = Router();
  const service = createSessionService();
  router.post('/', async (req, res) => {
    const input = payload(startSchema, req.body);
    res
      .status(201)
      .json(
        await prepareSessionMedia(
          await service.start(req.auth!.userId, input.minutes),
        ),
      );
  });
  router.get('/:id', async (req, res) => {
    res.json(
      await prepareSessionMedia(
        await service.get(req.auth!.userId, req.params.id as string),
        req.query.withoutMedia === '1',
      ),
    );
  });
  router.post('/:id/events', async (req, res) => {
    const result = await service.act(
      req.auth!.userId,
      req.params.id as string,
      payload(actionSchema, req.body),
    );
    res.json({ ...result, session: await prepareSessionMedia(result.session) });
  });
  router.post('/:id/finish', async (req, res) => {
    const input = payload(finishSchema, req.body);
    res.json(
      await service.finish(
        req.auth!.userId,
        req.params.id as string,
        input.eventId,
      ),
    );
  });
  return router;
}
