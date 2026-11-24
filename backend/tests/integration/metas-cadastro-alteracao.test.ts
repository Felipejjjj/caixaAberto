import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function member(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const user = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: user.id, organizationId: organization.id, role });
  return { organization, authorization: createAuthorizationHeader(user) };
}

const validGoal = { descricao: 'Reforma da sede', valorAlvo: '12000.50', prazo: '2999-12-31' };

describe('cadastro e alteração de metas', () => {
  it('cadastra meta associada à organização do contexto', async () => {
    const ctx = await member();
    const response = await request(createApp()).post('/metas').set('Authorization', ctx.authorization).send(validGoal);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ...validGoal, id: expect.any(String) });
    const list = await request(createApp()).get('/metas').set('Authorization', ctx.authorization);
    expect(list.body.dados.map((goal: { id: string }) => goal.id)).toContain(response.body.id);
  });

  it.each([
    [{ ...validGoal, valorAlvo: '0' }],
    [{ ...validGoal, valorAlvo: '10.999' }],
    [{ ...validGoal, prazo: '2026-02-30' }],
    [{ ...validGoal, descricao: '  ' }],
  ])('rejeita dados inválidos no cadastro', async (body) => {
    const ctx = await member();
    const response = await request(createApp()).post('/metas').set('Authorization', ctx.authorization).send(body);
    expect(response.status).toBe(400);
  });

  it('altera campos e persiste somente na organização da meta', async () => {
    const ctx = await member();
    const created = await request(createApp()).post('/metas').set('Authorization', ctx.authorization).send(validGoal);
    const updated = await request(createApp()).put(`/metas/${created.body.id}`).set('Authorization', ctx.authorization).send({ descricao: 'Nova descrição', valorAlvo: '250.00', prazo: '2999-11-30' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ descricao: 'Nova descrição', valorAlvo: '250.00', prazo: '2999-11-30' });
  });

  it('rejeita corpo vazio e meta inexistente ou de outra organização', async () => {
    const ctx = await member();
    const other = await member();
    const created = await request(createApp()).post('/metas').set('Authorization', other.authorization).send(validGoal);
    const foreign = await request(createApp()).put(`/metas/${created.body.id}`).set('Authorization', ctx.authorization).send({ descricao: 'Alteração indevida' });
    const empty = await request(createApp()).put('/metas/999999').set('Authorization', ctx.authorization).send({});
    expect(foreign.status).toBe(404);
    expect(empty.status).toBe(400);
  });

  it('restringe escrita ao tesoureiro', async () => {
    const ctx = await member('CONSULTOR');
    const response = await request(createApp()).post('/metas').set('Authorization', ctx.authorization).send(validGoal);
    expect(response.status).toBe(403);
  });
});
