import { Router } from 'express';
import { progress } from './progress.service.js';
export function progressRoutes(){const router=Router();router.get('/',async(req,res)=>res.json(await progress(req.auth!.userId)));return router;}
