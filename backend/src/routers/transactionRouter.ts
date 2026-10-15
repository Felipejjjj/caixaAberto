import { Router } from 'express';
import * as transactionController from '../controllers/transactionController.js';
import { authenticate } from '../middlewares/auth.js';
import { loadContext, requireRole } from '../middlewares/load-context.js';

const router = Router();

// US18 + US19: Registrar lançamento financeiro
// Body: { categoryId, amount, date, description, tipo, source?, recipient? }
router.post(
  '/',
  authenticate,
  loadContext,
  requireRole('TESOUREIRO'),
  transactionController.createTransaction,
);

// US29: Consultar resumo financeiro mensal
// Ex.: GET /transactions/resumo/mensal?mes=2026-09
router.get('/resumo/mensal', authenticate, loadContext, transactionController.monthlySummary);

// US24: Visualizar detalhes do lançamento
// Ex.: GET /transactions/123
router.get('/:id', authenticate, loadContext, transactionController.getOne);

// Atualizar lançamento financeiro
// Ex.: PUT /transactions/123
router.put(
  '/:id',
  authenticate,
  loadContext,
  requireRole('TESOUREIRO'),
  transactionController.updateOne,
);

export default router;
