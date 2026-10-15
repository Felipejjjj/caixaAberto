import { Router } from 'express';

import { requestPasswordReset, resetPassword } from '../controllers/passwordResetController.js';

const router = Router();

// Sem autenticacao: quem usa estas rotas e justamente quem nao consegue mais entrar.
router.post('/solicitar', requestPasswordReset);
router.post('/redefinir', resetPassword);

export default router;
