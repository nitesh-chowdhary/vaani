import { Router } from 'express';
import { z } from 'zod';
import { payload } from '../sessions/sessions.validation.js';
import { createSessionService } from '../sessions/sessions.service.js';
export function assessmentRoutes(){const router=Router();const service=createSessionService();
 router.get('/next',async(req,res)=>{res.json({assessment:await service.assessment(req.auth!.userId)});});
 router.post('/:id/attempts',async(req,res)=>{const input=payload(z.object({response:z.string().min(1).max(4000)}).strict(),req.body);res.status(201).json(await service.submitAssessment(req.auth!.userId,req.params.id as string,input.response));});return router;
}
