import { Router } from 'express';
import { learnerEvents } from './learning-events.service.js';
export function learningEventRoutes(){const router=Router();router.get('/',async(req,res)=>res.json({events:await learnerEvents(req.auth!.userId)}));return router;}
