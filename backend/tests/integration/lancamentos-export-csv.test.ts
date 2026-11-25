import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import {
  createCategory,
  createMembership,
  createOrganization,
  createTransaction,
  createUser,
} from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function context() {
  const user = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: user.id, organizationId: organization.id });
  return { user, organization, authorization: createAuthorizationHeader(user) };
}

describe('exportação CSV de lançamentos', () => {
  it('exporta lançamentos filtrados da organização como CSV baixável', async () => {
    const ctx = await context();
    const category = await createCategory({
      organizationId: ctx.organization.id,
      name: 'Doações; gerais',
      type: 'ENTRADA',
    });
    const row = await createTransaction({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      categoryId: category.id,
      date: new Date('2026-09-10T00:00:00Z'),
      description: '=1+1',
      amount: '25.50',
    });
    const foreignUser = await createUser();
    const foreignOrg = await createOrganization();
    await createMembership({ userId: foreignUser.id, organizationId: foreignOrg.id });
    const foreignCat = await createCategory({ organizationId: foreignOrg.id, type: 'ENTRADA' });
    await createTransaction({
      organizationId: foreignOrg.id,
      userId: foreignUser.id,
      categoryId: foreignCat.id,
      description: 'SEGREDO-OUTRA-ORGANIZACAO',
    });

    const response = await request(createApp())
      .get('/lancamentos/export.csv')
      .query({ dataInicio: '2026-09-01', dataFim: '2026-09-30', tipo: 'ENTRADA' })
      .set('Authorization', ctx.authorization);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="lancamentos.csv"',
    );
    expect(response.text).toContain('"id";"data";"descricao"');
    expect(response.text).toContain(`"${row.id}";"2026-09-10";"'=1+1"`);
    expect(response.text).toContain('"Doações; gerais"');
    expect(response.text).not.toContain('SEGREDO-OUTRA-ORGANIZACAO');
  });

  it('aplica filtros por categoria e usuário e exclui lançamentos fora do período', async () => {
    const ctx = await context();
    const otherUser = await createUser();
    await createMembership({
      userId: otherUser.id,
      organizationId: ctx.organization.id,
      role: 'CONSULTOR',
    });
    const selectedCategory = await createCategory({
      organizationId: ctx.organization.id,
      name: 'Selecionada',
      type: 'ENTRADA',
    });
    const otherCategory = await createCategory({
      organizationId: ctx.organization.id,
      name: 'Outra',
      type: 'ENTRADA',
    });
    const matching = await createTransaction({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      categoryId: selectedCategory.id,
      date: new Date('2026-09-10T00:00:00Z'),
      description: 'CORRESPONDENTE',
    });
    await createTransaction({
      organizationId: ctx.organization.id,
      userId: otherUser.id,
      categoryId: selectedCategory.id,
      date: new Date('2026-09-10T00:00:00Z'),
      description: 'OUTRO-USUARIO',
    });
    await createTransaction({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      categoryId: otherCategory.id,
      date: new Date('2026-09-10T00:00:00Z'),
      description: 'OUTRA-CATEGORIA',
    });
    await createTransaction({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      categoryId: selectedCategory.id,
      date: new Date('2026-10-01T00:00:00Z'),
      description: 'FORA-DO-PERIODO',
    });

    const response = await request(createApp())
      .get('/lancamentos/export.csv')
      .query({
        dataInicio: '2026-09-01',
        dataFim: '2026-09-30',
        categoriaId: selectedCategory.id.toString(),
        usuarioId: ctx.user.id.toString(),
      })
      .set('Authorization', ctx.authorization);
    expect(response.status).toBe(200);
    expect(response.text).toContain(`"${matching.id}"`);
    expect(response.text).not.toContain('OUTRO-USUARIO');
    expect(response.text).not.toContain('OUTRA-CATEGORIA');
    expect(response.text).not.toContain('FORA-DO-PERIODO');
  });

  it.each([
    { dataInicio: '2026-09-30', dataFim: '2026-09-01' },
    { dataInicio: '2026-02-30', dataFim: '2026-03-01' },
    { tipo: 'OUTRO' },
  ])('rejeita filtro/período inválido', async (query) => {
    const ctx = await context();
    const response = await request(createApp())
      .get('/lancamentos/export.csv')
      .query(query)
      .set('Authorization', ctx.authorization);
    expect(response.status).toBe(400);
  });
});
