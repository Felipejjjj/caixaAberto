import { Router } from 'express';

import { exportTransactions, listTransactions } from '../controllers/transactionListController.js';
import { authenticate } from '../middlewares/auth.js';
import { loadContext } from '../middlewares/load-context.js';

const router = Router();

router.get('/', authenticate, loadContext, listTransactions);
router.get('/export.csv', authenticate, loadContext, exportTransactions);

export default router;
