import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

function listarOrganizacoes(authorization: string) {
  return request(createApp()).get('/users/me/organizacoes').set('Authorization', authorization);
}

describe('organizações do usuário autenticado (US13)', () => {
  it('retorna a única organização sem exigir seleção', async () => {
    const user = await createUser();
    const organization = await createOrganization({ name: 'Única organização' });
    await createMembership({ userId: user.id, organizationId: organization.id, role: 'CONSULTOR' });

    const response = await listarOrganizacoes(createAuthorizationHeader(user));
    expect(response.status).toBe(200);
    expect(response.body.dados).toHaveLength(1);
    expect(response.body.dados[0]).toMatchObject({
      papel: 'CONSULTOR',
      organizacao: { id: organization.id.toString(), nome: 'Única organização' },
    });
  });

  it('retorna todas as organizações quando nenhuma foi selecionada', async () => {
    const user = await createUser();
    const first = await createOrganization({ name: 'Organização A' });
    const second = await createOrganization({ name: 'Organização B' });
    await createMembership({ userId: user.id, organizationId: first.id, role: 'CONSULTOR' });
    await createMembership({ userId: user.id, organizationId: second.id, role: 'TESOUREIRO' });

    const response = await listarOrganizacoes(createAuthorizationHeader(user));
    expect(response.status).toBe(200);
    expect(
      response.body.dados.map((item: { organizacao: { id: string } }) => item.organizacao.id),
    ).toEqual([first.id.toString(), second.id.toString()]);
  });

  it('retorna lista vazia quando o usuário não possui organizações', async () => {
    const user = await createUser();
    const response = await listarOrganizacoes(createAuthorizationHeader(user));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dados: [] });
  });

  it('omite vínculo inativo, inclusive quando está fora da organização ativa', async () => {
    const user = await createUser();
    const activeOrganization = await createOrganization({ name: 'Ativa' });
    const inactiveOrganization = await createOrganization({ name: 'Inativa' });
    await createMembership({
      userId: user.id,
      organizationId: activeOrganization.id,
      active: true,
    });
    await createMembership({
      userId: user.id,
      organizationId: inactiveOrganization.id,
      active: false,
    });

    const response = await listarOrganizacoes(createAuthorizationHeader(user));
    expect(response.status).toBe(200);
    expect(response.body.dados).toHaveLength(1);
    expect(response.body.dados[0].organizacao.id).toBe(activeOrganization.id.toString());
  });
});
