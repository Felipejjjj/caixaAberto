import { Router } from 'express';

import * as goalController from '../controllers/goalController.js';
import { authenticate } from '../middlewares/auth.js';
import { loadContext } from '../middlewares/load-context.js';

const router = Router();

router.get('/', authenticate, loadContext, goalController.listGoals);

export default router;
