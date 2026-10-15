import express from 'express';
import userController from '../controllers/userController.js';
import { authenticate } from '../middlewares/auth.js';
import { loadContext, requireRole } from '../middlewares/load-context.js';

const router = express.Router();

// Esta consulta precisa funcionar antes de a pessoa escolher uma organização.
router.get('/me/organizacoes', authenticate, userController.getMyOrganizations);

router.use(authenticate, loadContext);

// Leitura: qualquer membro com vinculo ativo enxerga os colegas da propria organizacao.
router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);

// Escrita sobre contas: restrita ao TESOUREIRO da organizacao.
router.post('/', requireRole('TESOUREIRO'), userController.createUser);
router.put('/:id', requireRole('TESOUREIRO'), userController.updateUser);
router.delete('/:id', requireRole('TESOUREIRO'), userController.deleteUser);

export default router;
