import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import {
  createCategory,
  createGoal,
  createMembership,
  createOrganization,
  createTransaction,
  createUser,
} from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

// Prazos bem distantes de hoje, para a situação não depender de quando o teste roda.
const FUTURE_DEADLINE = new Date('2999-12-31T00:00:00.000Z');
const PAST_DEADLINE = new Date('2020-12-31T00:00:00.000Z');
const GOAL_CREATED_AT = new Date('2019-12-01T12:00:00.000Z');

async function setup(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const user = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: user.id, organizationId: organization.id, role });
  const incomeCategory = await createCategory({
    organizationId: organization.id,
    type: 'ENTRADA',
    name: 'Mensalidades',
  });
  const expenseCategory = await createCategory({
    organizationId: organization.id,
    type: 'SAIDA',
    name: 'Material',
  });
  return {
    user,
    organization,
    incomeCategory,
    expenseCategory,
    authorization: createAuthorizationHeader(user),
  };
}

type Context = Awaited<ReturnType<typeof setup>>;

function entrada(ctx: Context, amount: string, date: string, overrides: object = {}) {
  return createTransaction({
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    categoryId: ctx.incomeCategory.id,
    amount: new Prisma.Decimal(amount),
    date: new Date(`${date}T00:00:00.000Z`),
    type: 'ENTRADA',
    ...overrides,
  });
}

function listar(authorization: string) {
  return request(createApp()).get('/metas').set('Authorization', authorization);
}

describe('consultar metas e progresso (US27)', () => {
  it('Cenário 1 - R$ 8.000 de R$ 20.000 dá 40% e situação "Em andamento"', async () => {
    const ctx = await setup();
    const meta = await createGoal({
      organizationId: ctx.organization.id,
      description: 'Reforma da sede',
      targetAmount: new Prisma.Decimal('20000.00'),
      deadline: FUTURE_DEADLINE,
      createdAt: GOAL_CREATED_AT,
    });
    await entrada(ctx, '5000.00', '2026-09-10');
    await entrada(ctx, '3000.00', '2026-09-20');

    const response = await listar(ctx.authorization);

    expect(response.status).toBe(200);
    expect(response.body.dados).toEqual([
      {
        id: meta.id.toString(),
        descricao: 'Reforma da sede',
        valorAlvo: '20000.00',
        prazo: '2999-12-31',
        valorArrecadado: '8000.00',
        percentual: 40,
        situacao: 'EM_ANDAMENTO',
        situacaoDescricao: 'Em andamento',
      },
    ]);
  });

  it('Cenário 2 - prazo encerrado com progresso abaixo de 100% é "Prazo encerrado"', async () => {
    const ctx = await setup();
    await createGoal({
      organizationId: ctx.organization.id,
      targetAmount: new Prisma.Decimal('1000.00'),
      deadline: PAST_DEADLINE,
      createdAt: GOAL_CREATED_AT,
    });
    await entrada(ctx, '250.00', '2020-06-10');

    const response = await listar(ctx.authorization);

    expect(response.body.dados[0]).toMatchObject({
      valorArrecadado: '250.00',
      percentual: 25,
      situacao: 'PRAZO_ENCERRADO',
      situacaoDescricao: 'Prazo encerrado',
    });
  });

  it('meta que atingiu o valor-alvo fica "Concluída", mesmo com o prazo vencido', async () => {
    const ctx = await setup();
    await createGoal({
      organizationId: ctx.organization.id,
      targetAmount: new Prisma.Decimal('1000.00'),
      deadline: PAST_DEADLINE,
      createdAt: GOAL_CREATED_AT,
    });
    await entrada(ctx, '1500.00', '2020-03-10');

    const response = await listar(ctx.authorization);

    expect(response.body.dados[0]).toMatchObject({
      valorArrecadado: '1500.00',
      percentual: 150,
      situacao: 'CONCLUIDA',
      situacaoDescricao: 'Concluída',
    });
  });

  it('meta sem entradas mostra 0% e arredonda o percentual em duas casas', async () => {
    const ctx = await setup();
    await createGoal({
      organizationId: ctx.organization.id,
      description: 'Sem entradas',
      targetAmount: new Prisma.Decimal('300.00'),
      deadline: FUTURE_DEADLINE,
      createdAt: GOAL_CREATED_AT,
    });
    await createGoal({
      organizationId: ctx.organization.id,
      description: 'Um terço',
      targetAmount: new Prisma.Decimal('300.00'),
      deadline: new Date('3000-01-31T00:00:00.000Z'),
      createdAt: GOAL_CREATED_AT,
    });
    await entrada(ctx, '100.00', '2026-09-10');

    const response = await listar(ctx.authorization);

    expect(response.body.dados.map((meta: { percentual: number }) => meta.percentual)).toEqual([
      33.33, 33.33,
    ]);
  });

  it('só conta entrada válida: estorno, saída e datas fora da janela da meta ficam de fora', async () => {
    const ctx = await setup();
    await createGoal({
      organizationId: ctx.organization.id,
      targetAmount: new Prisma.Decimal('1000.00'),
      deadline: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
    });
    await entrada(ctx, '100.00', '2026-09-01'); // no dia da criação conta
    await entrada(ctx, '200.00', '2026-12-31'); // no dia do prazo conta
    await entrada(ctx, '400.00', '2026-10-10', { status: 'ESTORNADO' });
    await entrada(ctx, '800.00', '2026-08-31'); // anterior à meta
    await entrada(ctx, '900.00', '2027-01-01'); // depois do prazo
    await createTransaction({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      categoryId: ctx.expenseCategory.id,
      amount: new Prisma.Decimal('700.00'),
      date: new Date('2026-10-10T00:00:00.000Z'),
      type: 'SAIDA',
    });

    const response = await listar(ctx.authorization);

    expect(response.body.dados[0]).toMatchObject({ valorArrecadado: '300.00', percentual: 30 });
  });

  it('lista só as metas da organização do contexto e só soma as entradas dela', async () => {
    const ctx = await setup();
    await createGoal({
      organizationId: ctx.organization.id,
      description: 'Minha meta',
      targetAmount: new Prisma.Decimal('1000.00'),
      deadline: FUTURE_DEADLINE,
      createdAt: GOAL_CREATED_AT,
    });
    await entrada(ctx, '100.00', '2026-09-10');

    const outra = await createOrganization();
    const outroUsuario = await createUser();
    const outraCategoria = await createCategory({ organizationId: outra.id, type: 'ENTRADA' });
    await createGoal({
      organizationId: outra.id,
      description: 'Meta alheia',
      deadline: FUTURE_DEADLINE,
      createdAt: GOAL_CREATED_AT,
    });
    await createTransaction({
      organizationId: outra.id,
      userId: outroUsuario.id,
      categoryId: outraCategoria.id,
      amount: new Prisma.Decimal('5000.00'),
      date: new Date('2026-09-10T00:00:00.000Z'),
      type: 'ENTRADA',
    });

    const response = await listar(ctx.authorization);

    expect(response.body.dados).toHaveLength(1);
    expect(response.body.dados[0]).toMatchObject({
      descricao: 'Minha meta',
      valorArrecadado: '100.00',
    });
  });

  it('ordena pelo prazo mais próximo e devolve lista vazia sem metas', async () => {
    const ctx = await setup();
    const vazio = await listar(ctx.authorization);
    expect(vazio.status).toBe(200);
    expect(vazio.body).toEqual({ dados: [] });

    await createGoal({
      organizationId: ctx.organization.id,
      description: 'Depois',
      deadline: new Date('3000-01-01T00:00:00.000Z'),
      createdAt: GOAL_CREATED_AT,
    });
    await createGoal({
      organizationId: ctx.organization.id,
      description: 'Antes',
      deadline: new Date('2999-01-01T00:00:00.000Z'),
      createdAt: GOAL_CREATED_AT,
    });

    const response = await listar(ctx.authorization);

    expect(response.body.dados.map((meta: { descricao: string }) => meta.descricao)).toEqual([
      'Antes',
      'Depois',
    ]);
  });

  it('qualquer membro ativo consulta, inclusive o consultor', async () => {
    const ctx = await setup('CONSULTOR');

    const response = await listar(ctx.authorization);

    expect(response.status).toBe(200);
  });

  it('exige autenticação e vínculo ativo', async () => {
    const semToken = await request(createApp()).get('/metas');
    expect(semToken.status).toBe(401);

    const semVinculo = await createUser();
    const response = await listar(createAuthorizationHeader(semVinculo));
    expect(response.status).toBe(403);
  });

  it('rejeita parâmetro de consulta desconhecido', async () => {
    const ctx = await setup();

    const response = await request(createApp())
      .get('/metas')
      .query({ qualquer: 'coisa' })
      .set('Authorization', ctx.authorization);

    expect(response.status).toBe(400);
  });
});
