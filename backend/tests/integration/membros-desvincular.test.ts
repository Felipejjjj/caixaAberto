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

async function setup(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const actor = await createUser();
  const organization = await createOrganization();
  const actorMembership = await createMembership({
    userId: actor.id,
    organizationId: organization.id,
    role,
  });
  const maria = await createUser();
  const mariaMembership = await createMembership({
    userId: maria.id,
    organizationId: organization.id,
    role: 'CONSULTOR',
  });
  return {
    actor,
    organization,
    actorMembership,
    maria,
    mariaMembership,
    authorization: createAuthorizationHeader(actor),
  };
}

function desvincular(id: bigint | string, authorization: string) {
  return request(createApp())
    .delete(`/membros/${id.toString()}`)
    .set('Authorization', authorization);
}

describe('desvincular membro (US11)', () => {
  it('Cenário BDD - Maria perde o acesso e os lançamentos dela permanecem no extrato', async () => {
    const ctx = await setup();
    const categoria = await createCategory({
      organizationId: ctx.organization.id,
      type: 'ENTRADA',
    });
    await createTransaction({
      organizationId: ctx.organization.id,
      userId: ctx.maria.id,
      categoryId: categoria.id,
      description: 'Lançamento da Maria',
    });

    const response = await desvincular(ctx.mariaMembership.id, ctx.authorization);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: ctx.mariaMembership.id.toString(),
      usuario: { id: ctx.maria.id.toString(), nome: ctx.maria.name, email: ctx.maria.email },
      ativo: false,
    });

    const vinculo = await prisma.membership.findUnique({ where: { id: ctx.mariaMembership.id } });
    expect(vinculo?.active).toBe(false);

    const acessoDaMaria = await request(createApp())
      .get('/extrato')
      .query({ dataInicio: '2026-09-01', dataFim: '2026-09-30' })
      .set('Authorization', createAuthorizationHeader(ctx.maria));
    expect(acessoDaMaria.status).toBe(403);

    const extrato = await request(createApp())
      .get('/extrato')
      .query({ dataInicio: '2026-09-01', dataFim: '2026-09-30' })
      .set('Authorization', ctx.authorization);
    expect(extrato.status).toBe(200);
    expect(extrato.body.linhas.map((linha: { descricao: string }) => linha.descricao)).toContain(
      'Lançamento da Maria',
    );
    expect(await prisma.transaction.count({ where: { userId: ctx.maria.id } })).toBe(1);
  });

  it('CA-F08-02 - o membro desvinculado sai da listagem de membros', async () => {
    const ctx = await setup();

    await desvincular(ctx.mariaMembership.id, ctx.authorization);

    const lista = await request(createApp())
      .get(`/organizacoes/${ctx.organization.id.toString()}/membros`)
      .set('Authorization', ctx.authorization);
    expect(lista.status).toBe(200);
    expect(lista.body.dados.map((membro: { id: string }) => membro.id)).not.toContain(
      ctx.mariaMembership.id.toString(),
    );
  });

  it('permite vincular de novo quem foi desvinculado, reativando o mesmo registro', async () => {
    const ctx = await setup();
    await desvincular(ctx.mariaMembership.id, ctx.authorization);

    const vinculo = await request(createApp())
      .post(`/organizacoes/${ctx.organization.id.toString()}/membros`)
      .set('Authorization', ctx.authorization)
      .send({ email: ctx.maria.email });

    expect(vinculo.status).toBe(201);
    expect(vinculo.body.id).toBe(ctx.mariaMembership.id.toString());
    expect(vinculo.body.ativo).toBe(true);
  });

  it('só o tesoureiro desvincula: consultor recebe 403 e o vínculo segue ativo', async () => {
    const ctx = await setup('CONSULTOR');

    const response = await desvincular(ctx.mariaMembership.id, ctx.authorization);

    expect(response.status).toBe(403);
    const vinculo = await prisma.membership.findUnique({ where: { id: ctx.mariaMembership.id } });
    expect(vinculo?.active).toBe(true);
  });

  it('exige autenticação', async () => {
    const response = await request(createApp()).delete('/membros/1');

    expect(response.status).toBe(401);
  });

  it('impede o tesoureiro de desvincular a si mesmo', async () => {
    const ctx = await setup();

    const response = await desvincular(ctx.actorMembership.id, ctx.authorization);

    expect(response.status).toBe(403);
    const vinculo = await prisma.membership.findUnique({ where: { id: ctx.actorMembership.id } });
    expect(vinculo?.active).toBe(true);
  });

  it('desvincula outro tesoureiro quando sobra ao menos um', async () => {
    const ctx = await setup();
    await prisma.membership.update({
      where: { id: ctx.mariaMembership.id },
      data: { role: 'TESOUREIRO' },
    });

    const response = await desvincular(ctx.mariaMembership.id, ctx.authorization);

    expect(response.status).toBe(200);
    expect(response.body.ativo).toBe(false);
  });

  it('responde 404 para vínculo inexistente ou já inativo', async () => {
    const ctx = await setup();
    await desvincular(ctx.mariaMembership.id, ctx.authorization);

    const jaInativo = await desvincular(ctx.mariaMembership.id, ctx.authorization);
    const inexistente = await desvincular('999999', ctx.authorization);

    expect(jaInativo.status).toBe(404);
    expect(inexistente.status).toBe(404);
  });

  it('isolamento: vínculo de outra organização é tratado como inexistente', async () => {
    const ctx = await setup();
    const outraOrganizacao = await createOrganization();
    const estranho = await createUser();
    const vinculoEstranho = await createMembership({
      userId: estranho.id,
      organizationId: outraOrganizacao.id,
      role: 'CONSULTOR',
    });

    const response = await desvincular(vinculoEstranho.id, ctx.authorization);

    expect(response.status).toBe(404);
    const vinculo = await prisma.membership.findUnique({ where: { id: vinculoEstranho.id } });
    expect(vinculo?.active).toBe(true);
  });

  it('responde 400 para identificador inválido', async () => {
    const ctx = await setup();

    const response = await desvincular('abc', ctx.authorization);

    expect(response.status).toBe(400);
  });
});
