import { Router } from 'express';

import * as goalController from '../controllers/goalController.js';
import { authenticate } from '../middlewares/auth.js';
import { loadContext } from '../middlewares/load-context.js';
import { requireRole } from '../middlewares/load-context.js';

const router = Router();

router.get('/', authenticate, loadContext, goalController.listGoals);
router.post('/', authenticate, loadContext, requireRole('TESOUREIRO'), goalController.createGoal);
router.put('/:id', authenticate, loadContext, requireRole('TESOUREIRO'), goalController.updateGoal);

export default router;
