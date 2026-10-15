import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import {
  createCategory,
  createMembership,
  createOrganization,
  createTransaction,
  createUser,
} from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function criarOrganizacao(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const user = await createUser();
  const organization = await createOrganization({
    name: 'Atlética TSI',
    managementStart: new Date('2026-01-01T00:00:00.000Z'),
    managementEnd: new Date('2026-12-31T00:00:00.000Z'),
  });
  await createMembership({ userId: user.id, organizationId: organization.id, role });

  return { user, organization, authorization: createAuthorizationHeader(user) };
}

function alterar(id: bigint | string, authorization: string, body: object) {
  return request(createApp())
    .put(`/organizacoes/${id.toString()}`)
    .set('Authorization', authorization)
    .send(body);
}

async function lerOrganizacao(id: bigint) {
  return prisma.organization.findUniqueOrThrow({
    where: { id },
    select: { name: true, description: true, managementStart: true, managementEnd: true },
  });
}

describe('alteração de organização (US08)', () => {
  it('Cenário 1 - alterar dados da organização', async () => {
    const { user, organization, authorization } = await criarOrganizacao();
    const consultor = await createUser();
    await createMembership({
      userId: consultor.id,
      organizationId: organization.id,
      role: 'CONSULTOR',
    });
    const categoria = await createCategory({ organizationId: organization.id });
    const lancamento = await createTransaction({
      organizationId: organization.id,
      userId: user.id,
      categoryId: categoria.id,
      date: new Date('2026-09-01T00:00:00.000Z'),
    });

    const response = await alterar(organization.id, authorization, {
      nome: 'Atlética TSI 2026',
      inicioGestao: '2026-02-01',
      fimGestao: '2027-01-31',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: organization.id.toString(),
      nome: 'Atlética TSI 2026',
      descricao: organization.description,
      inicioGestao: '2026-02-01',
      fimGestao: '2027-01-31',
      linkPublico: null,
      transparenciaAtiva: false,
    });

    // Lancamentos e membros continuam vinculados a mesma organizacao.
    const lancamentoDepois = await prisma.transaction.findUniqueOrThrow({
      where: { id: lancamento.id },
    });
    expect(lancamentoDepois.organizationId).toBe(organization.id);
    expect(
      await prisma.membership.count({ where: { organizationId: organization.id, active: true } }),
    ).toBe(2);
  });

  it('Cenário 2 - membro consultor tenta alterar', async () => {
    const { organization, authorization } = await criarOrganizacao('CONSULTOR');

    const response = await alterar(organization.id, authorization, { nome: 'Outro nome' });

    expect(response.status).toBe(403);
    expect((await lerOrganizacao(organization.id)).name).toBe('Atlética TSI');
  });

  it('altera só a descrição e mantém o restante', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const response = await alterar(organization.id, authorization, { descricao: 'Nova descrição' });

    expect(response.status).toBe(200);
    expect(await lerOrganizacao(organization.id)).toEqual({
      name: 'Atlética TSI',
      description: 'Nova descrição',
      managementStart: new Date('2026-01-01T00:00:00.000Z'),
      managementEnd: new Date('2026-12-31T00:00:00.000Z'),
    });
  });

  it('valida o período contra a data que não foi enviada', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const response = await alterar(organization.id, authorization, { fimGestao: '2025-12-31' });

    expect(response.status).toBe(400);
    expect(response.body.erro).toBe(
      'A data inicial da gestão deve ser anterior ou igual à data final.',
    );
    expect((await lerOrganizacao(organization.id)).managementEnd).toEqual(
      new Date('2026-12-31T00:00:00.000Z'),
    );
  });

  it('recusa período que deixa lançamento de fora, inclusive estornado', async () => {
    const { user, organization, authorization } = await criarOrganizacao();
    const categoria = await createCategory({ organizationId: organization.id });
    await createTransaction({
      organizationId: organization.id,
      userId: user.id,
      categoryId: categoria.id,
      date: new Date('2026-03-01T00:00:00.000Z'),
      status: 'ESTORNADO',
      reversedAt: new Date('2026-03-02T12:00:00.000Z'),
    });

    const response = await alterar(organization.id, authorization, { inicioGestao: '2026-06-01' });

    expect(response.status).toBe(409);
    expect(response.body.erro).toBe(
      'Existem lançamentos fora do novo período de gestão. Ajuste o período para incluí-los.',
    );
    expect((await lerOrganizacao(organization.id)).managementStart).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );

    const ateOLancamento = await alterar(organization.id, authorization, {
      inicioGestao: '2026-03-01',
    });
    expect(ateOLancamento.status).toBe(200);
  });

  it('trata organização de outro contexto como inexistente', async () => {
    const { authorization } = await criarOrganizacao();
    const outra = await createOrganization({ name: 'Outra' });

    const response = await alterar(outra.id, authorization, { nome: 'Invadida' });

    expect(response.status).toBe(404);
    expect((await lerOrganizacao(outra.id)).name).toBe('Outra');
  });

  it('rejeita corpo vazio, data inexistente e propriedade não reconhecida', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const vazio = await alterar(organization.id, authorization, {});
    const dataInexistente = await alterar(organization.id, authorization, {
      fimGestao: '2026-02-30',
    });
    const emIngles = await alterar(organization.id, authorization, { name: 'Outro nome' });

    expect(vazio.status).toBe(400);
    expect(dataInexistente.status).toBe(400);
    expect(emIngles.status).toBe(400);
    expect((await lerOrganizacao(organization.id)).name).toBe('Atlética TSI');
  });
});
