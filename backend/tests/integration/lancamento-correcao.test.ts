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

async function setup() {
  const responsavel = await createUser();
  const outroTesoureiro = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: responsavel.id, organizationId: organization.id });
  await createMembership({ userId: outroTesoureiro.id, organizationId: organization.id });
  const categoriaEntrada = await createCategory({
    organizationId: organization.id,
    name: 'Doações',
    type: 'ENTRADA',
  });
  const outraCategoriaEntrada = await createCategory({
    organizationId: organization.id,
    name: 'Patrocínios',
    type: 'ENTRADA',
  });
  const categoriaSaida = await createCategory({
    organizationId: organization.id,
    name: 'Material',
    type: 'SAIDA',
  });
  const transaction = await createTransaction({
    organizationId: organization.id,
    userId: responsavel.id,
    categoryId: categoriaEntrada.id,
    description: 'Doação inicial',
    source: 'Doador original',
  });
  return {
    responsavel,
    organization,
    categoriaEntrada,
    outraCategoriaEntrada,
    categoriaSaida,
    transaction,
    authorization: createAuthorizationHeader(outroTesoureiro),
  };
}

describe('correção de lançamento (US20)', () => {
  it('permite a outro tesoureiro corrigir descrição e categoria preservando responsável e organização', async () => {
    const ctx = await setup();
    const response = await request(createApp())
      .put(`/transactions/${ctx.transaction.id}`)
      .set('Authorization', ctx.authorization)
      .send({
        description: 'Doação corrigida',
        categoryId: ctx.outraCategoriaEntrada.id.toString(),
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      description: 'Doação corrigida',
      categoryId: ctx.outraCategoriaEntrada.id.toString(),
    });
    const saved = await prisma.transaction.findUniqueOrThrow({ where: { id: ctx.transaction.id } });
    expect(saved.userId).toBe(ctx.responsavel.id);
    expect(saved.organizationId).toBe(ctx.organization.id);
    expect(saved.categoryId).toBe(ctx.outraCategoriaEntrada.id);
    expect(saved.description).toBe('Doação corrigida');
  });

  it('responde 409 para lançamento estornado e orienta registrar outro', async () => {
    const ctx = await setup();
    await prisma.transaction.update({
      where: { id: ctx.transaction.id },
      data: { status: 'ESTORNADO', reversedAt: new Date() },
    });
    const response = await request(createApp())
      .put(`/transactions/${ctx.transaction.id}`)
      .set('Authorization', ctx.authorization)
      .send({ description: 'Correção' });

    expect(response.status).toBe(409);
    expect(response.body.erro).toContain('Registre um novo lançamento');
  });

  it('rejeita alteração do tipo', async () => {
    const ctx = await setup();
    const response = await request(createApp())
      .put(`/transactions/${ctx.transaction.id}`)
      .set('Authorization', ctx.authorization)
      .send({ tipo: 'SAIDA', categoryId: ctx.categoriaSaida.id.toString() });
    expect(response.status).toBe(400);
  });
});
