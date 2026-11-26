import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

type Papel = 'TESOUREIRO' | 'CONSULTOR';

async function vincularNovo(
  organizationId: bigint,
  nome: string,
  role: Papel,
  extra: { active?: boolean; linkedAt?: Date } = {},
) {
  const user = await createUser({ name: nome });
  const membership = await createMembership({ userId: user.id, organizationId, role, ...extra });

  return { user, membership };
}

function listar(organizationId: bigint | string, authorization: string) {
  return request(createApp())
    .get(`/organizacoes/${organizationId.toString()}/membros`)
    .set('Authorization', authorization);
}

describe('consultar membros e papéis (US12)', () => {
  it('Cenário 1 - listar membros ativos', async () => {
    const organization = await createOrganization();
    const ana = await vincularNovo(organization.id, 'Ana', 'TESOUREIRO', {
      linkedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const bruno = await vincularNovo(organization.id, 'Bruno', 'CONSULTOR');
    const carla = await vincularNovo(organization.id, 'Carla', 'CONSULTOR');
    const diego = await vincularNovo(organization.id, 'Diego', 'TESOUREIRO');
    const elisa = await vincularNovo(organization.id, 'Elisa', 'CONSULTOR');
    await vincularNovo(organization.id, 'Fábio', 'CONSULTOR', { active: false });

    const response = await listar(organization.id, createAuthorizationHeader(bruno.user));

    expect(response.status).toBe(200);
    expect(
      response.body.dados.map((membro: { usuario: { nome: string }; papel: string }) => [
        membro.usuario.nome,
        membro.papel,
      ]),
    ).toEqual([
      ['Ana', 'TESOUREIRO'],
      ['Bruno', 'CONSULTOR'],
      ['Carla', 'CONSULTOR'],
      ['Diego', 'TESOUREIRO'],
      ['Elisa', 'CONSULTOR'],
    ]);
    expect(response.body.dados[0]).toEqual({
      id: ana.membership.id.toString(),
      usuario: { id: ana.user.id.toString(), nome: 'Ana', email: ana.user.email, ativo: true },
      papel: 'TESOUREIRO',
      dataVinculo: '2026-02-01',
      ativo: true,
    });
    expect(response.body.dados.map((membro: { id: string }) => membro.id)).toEqual(
      [ana, bruno, carla, diego, elisa].map((membro) => membro.membership.id.toString()),
    );
  });

  it('não exibe membros de outra organização', async () => {
    const organization = await createOrganization();
    const outra = await createOrganization();
    const ana = await vincularNovo(organization.id, 'Ana', 'TESOUREIRO');
    await vincularNovo(outra.id, 'Zeca', 'TESOUREIRO');
    // Quem participa das duas aparece so com o vinculo desta organizacao.
    const bia = await vincularNovo(organization.id, 'Bia', 'CONSULTOR');
    await createMembership({ userId: bia.user.id, organizationId: outra.id, role: 'TESOUREIRO' });

    const response = await listar(organization.id, createAuthorizationHeader(ana.user));

    expect(response.status).toBe(200);
    expect(response.body.dados).toEqual([
      expect.objectContaining({ id: ana.membership.id.toString(), papel: 'TESOUREIRO' }),
      expect.objectContaining({ id: bia.membership.id.toString(), papel: 'CONSULTOR' }),
    ]);
  });

  it('trata outra organização no caminho como inexistente', async () => {
    const organization = await createOrganization();
    const outra = await createOrganization();
    const ana = await vincularNovo(organization.id, 'Ana', 'TESOUREIRO');
    await vincularNovo(outra.id, 'Zeca', 'TESOUREIRO');

    const response = await listar(outra.id, createAuthorizationHeader(ana.user));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ erro: 'Organização não encontrada' });
  });

  it('rejeita identificador de organização inválido', async () => {
    const organization = await createOrganization();
    const ana = await vincularNovo(organization.id, 'Ana', 'TESOUREIRO');

    const response = await listar('abc', createAuthorizationHeader(ana.user));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { id: 'Informe um identificador numérico' },
    });
  });

  it('rejeita parâmetro de consulta não reconhecido', async () => {
    const organization = await createOrganization();
    const ana = await vincularNovo(organization.id, 'Ana', 'TESOUREIRO');

    const response = await listar(organization.id, createAuthorizationHeader(ana.user)).query({
      ativo: 'false',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { requisicao: 'Chave inválida: "ativo"' },
    });
  });

  it('responde 403 para usuário sem vínculo ativo', async () => {
    const organization = await createOrganization();
    await vincularNovo(organization.id, 'Ana', 'TESOUREIRO');
    const fabio = await vincularNovo(organization.id, 'Fábio', 'CONSULTOR', { active: false });

    const response = await listar(organization.id, createAuthorizationHeader(fabio.user));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      erro: 'Usuário não possui vínculo ativo com uma organização',
    });
  });

  it('rejeita requisição sem token de autenticação', async () => {
    const organization = await createOrganization();

    const response = await request(createApp()).get(`/organizacoes/${organization.id}/membros`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ erro: 'Token de autenticação não fornecido.' });
  });
});
