import { Router } from 'express';

import { addMember, listMembers } from '../controllers/membershipController.js';
import { getCurrentContext } from '../controllers/organizationContextController.js';
import {
  changePublicLinkState,
  generatePublicLink,
  getPublicLink,
} from '../controllers/organizationPublicLinkController.js';
import { authenticate } from '../middlewares/auth.js';
import {
  loadContext,
  requireContextOrganization,
  requireRole,
} from '../middlewares/load-context.js';

import * as organizationController from '../controllers/organizationController.js';

const router = Router();

// Leitura do proprio vinculo: qualquer membro com vinculo ativo, entao sem requireRole.
router.get('/atual/contexto', authenticate, loadContext, getCurrentContext);

router.get(
  '/atual/link-publico',
  authenticate,
  loadContext,
  requireRole('TESOUREIRO'),
  getPublicLink,
);
router.post(
  '/atual/link-publico',
  authenticate,
  loadContext,
  requireRole('TESOUREIRO'),
  generatePublicLink,
);
router.patch(
  '/atual/link-publico',
  authenticate,
  loadContext,
  requireRole('TESOUREIRO'),
  changePublicLinkState,
);

// Consultar os membros e direito de qualquer vinculo ativo, entao sem requireRole.
router.get('/:id/membros', authenticate, loadContext, requireContextOrganization, listMembers);

// A organizacao do caminho e conferida antes do papel: outra organizacao responde 404 para qualquer
// papel, e so depois o consultor recebe 403.
router.post(
  '/:id/membros',
  authenticate,
  loadContext,
  requireContextOrganization,
  requireRole('TESOUREIRO'),
  addMember,
);

// Criar organização.
// Não utiliza loadContext: o usuário ainda pode não ter uma organização selecionada.
router.post('/', authenticate, organizationController.createOrganization);

// Atualizar os dados da organização.
// Primeiro confere a organização do caminho; depois, o papel do usuário.
router.put(
  '/:id',
  authenticate,
  loadContext,
  requireContextOrganization,
  requireRole('TESOUREIRO'),
  organizationController.updateOrganization,
);

export default router;
