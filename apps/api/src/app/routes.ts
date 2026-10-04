import { Router } from 'express';
import { authRoutes, authenticate, type createAuthService } from '../features/auth/index.js';
import type { Config } from '../infrastructure/config/config.js';
import { courseRoutes } from '../features/course/course.routes.js';
import { sessionRoutes } from '../features/sessions/sessions.routes.js';
import { progressRoutes } from '../features/progress/progress.routes.js';
import { learningEventRoutes } from '../features/learning-events/learning-events.routes.js';
import { assessmentRoutes } from '../features/assessments/assessments.routes.js';
import { progress } from '../features/progress/progress.service.js';
export function routes(service:ReturnType<typeof createAuthService>,config:Config){const router=Router();router.use('/auth',authRoutes(service,config));
 const learning=Router();learning.use(authenticate(service));learning.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 learning.use('/course',courseRoutes());learning.use('/sessions',sessionRoutes());learning.use('/progress',progressRoutes());learning.use('/learning-events',learningEventRoutes());learning.use('/assessments',assessmentRoutes());learning.get('/reviews',async(req,res)=>res.json({due:(await progress(req.auth!.userId)).due}));router.use(learning);return router;}
