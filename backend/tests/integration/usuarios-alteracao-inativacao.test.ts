import bcrypt from 'bcrypt';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function setup() {
  const owner = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: owner.id, organizationId: organization.id, role: 'TESOUREIRO' });
  return { organization, authorization: createAuthorizationHeader(owner) };
}

describe('alteração e inativação de usuários', () => {
  it('altera nome e e-mail com validação e mantém o e-mail único sem diferenciar caixa', async () => {
    const ctx = await setup();
    const user = await createUser();
    await createMembership({
      userId: user.id,
      organizationId: ctx.organization.id,
      role: 'CONSULTOR',
    });
    const conflict = await createUser({ email: 'ocupado@example.test' });
    await createMembership({
      userId: conflict.id,
      organizationId: ctx.organization.id,
      role: 'CONSULTOR',
    });
    const changed = await request(createApp())
      .put(`/users/${user.id}`)
      .set('Authorization', ctx.authorization)
      .send({ name: '  Nome atualizado  ', email: 'novo@example.test' });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'Nome atualizado', email: 'novo@example.test' });
    const duplicate = await request(createApp())
      .put(`/users/${user.id}`)
      .set('Authorization', ctx.authorization)
      .send({ email: 'OCUPADO@example.test' });
    expect(duplicate.status).toBe(400);
    const invalid = await request(createApp())
      .put(`/users/${user.id}`)
      .set('Authorization', ctx.authorization)
      .send({ name: ' ' });
    expect(invalid.status).toBe(400);
  });

  it('inativa a conta preservando vínculo e histórico e bloqueia login e sessão existente', async () => {
    const ctx = await setup();
    const password = 'senha-segura';
    const user = await createUser({
      email: 'inativado@example.test',
      passwordHash: await bcrypt.hash(password, 10),
    });
    const membership = await createMembership({
      userId: user.id,
      organizationId: ctx.organization.id,
      role: 'CONSULTOR',
    });
    const login = await request(createApp())
      .post('/auth/login')
      .send({ email: user.email, password });
    expect(login.status).toBe(200);
    const deactivated = await request(createApp())
      .delete(`/users/${user.id}`)
      .set('Authorization', ctx.authorization);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } })).active,
    ).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(false);
    expect(
      (await request(createApp()).post('/auth/login').send({ email: user.email, password })).status,
    ).toBe(403);
    expect(
      (await request(createApp()).get('/users').set('Authorization', `Bearer ${login.body.token}`))
        .status,
    ).toBe(403);
  });
});
