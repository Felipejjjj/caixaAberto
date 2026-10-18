import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function tesoureiro() {
  const user = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: user.id, organizationId: organization.id, role: 'TESOUREIRO' });

  return { organization, authorization: createAuthorizationHeader(user) };
}

function emailUnico(prefixo = 'maria') {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@grupo.org`;
}

async function vinculos(email: string) {
  return prisma.membership.findMany({
    where: { user: { email } },
    select: { organizationId: true, role: true, active: true },
  });
}

describe('cadastro de usuário (US03)', () => {
  it('Cenário 1 - cria a conta ativa, vinculada como consultor, e ela consegue entrar', async () => {
    const ctx = await tesoureiro();
    const email = emailUnico();

    const response = await request(createApp())
      .post('/users')
      .set('Authorization', ctx.authorization)
      .send({ name: 'Maria', email, password: 'senha-segura' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Maria', email, active: true });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(await vinculos(email)).toEqual([
      { organizationId: ctx.organization.id, role: 'CONSULTOR', active: true },
    ]);

    const login = await request(createApp())
      .post('/auth/login')
      .send({ email, password: 'senha-segura' });
    expect(login.status).toBe(200);
  });

  it('vincula com o papel escolhido por quem cadastra', async () => {
    const ctx = await tesoureiro();
    const email = emailUnico();

    const response = await request(createApp())
      .post('/users')
      .set('Authorization', ctx.authorization)
      .send({ name: 'Maria', email, password: 'senha-segura', papel: 'TESOUREIRO' });

    expect(response.status).toBe(201);
    expect(await vinculos(email)).toEqual([
      { organizationId: ctx.organization.id, role: 'TESOUREIRO', active: true },
    ]);
  });

  // CA-F03-03: a conta nasce ativa; o corpo nao escolhe a situacao.
  it('ignora active: false e cria a conta ativa', async () => {
    const ctx = await tesoureiro();
    const email = emailUnico();

    const response = await request(createApp())
      .post('/users')
      .set('Authorization', ctx.authorization)
      .send({ name: 'Maria', email, password: 'senha-segura', active: false });

    expect(response.status).toBe(201);
    expect(response.body.active).toBe(true);
  });

  it('Cenário 2 - recusa e-mail já cadastrado, mesmo com outra caixa', async () => {
    const ctx = await tesoureiro();
    const email = emailUnico();
    await createUser({ email });

    const response = await request(createApp())
      .post('/users')
      .set('Authorization', ctx.authorization)
      .send({ name: 'Outra Maria', email: email.toUpperCase(), password: 'senha-segura' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ erro: 'E-mail já cadastrado' });
    expect(await prisma.user.count({ where: { name: 'Outra Maria' } })).toBe(0);
  });

  // CA-F03-04: dados invalidos nao sao gravados e dizem o que corrigir.
  it.each([
    ['e-mail inválido', { email: 'maria-sem-arroba' }, 'email', 'Informe um e-mail válido'],
    ['senha curta', { password: '1234567' }, 'password', 'A senha deve ter no mínimo 8 caracteres'],
    ['nome em branco', { name: '   ' }, 'name', 'Informe o nome'],
    ['papel desconhecido', { papel: 'ADMIN' }, 'papel', expect.any(String)],
  ])('recusa %s sem gravar nada', async (_caso, alteracao, campo, mensagem) => {
    const ctx = await tesoureiro();
    const corpo = { name: 'Maria', email: emailUnico(), password: 'senha-segura', ...alteracao };

    const response = await request(createApp())
      .post('/users')
      .set('Authorization', ctx.authorization)
      .send(corpo);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ erro: 'Dados inválidos', campos: { [campo]: mensagem } });
    expect(await prisma.user.count({ where: { email: corpo.email } })).toBe(0);
  });

  it('cadastra pela rota antiga /auth/register com o mesmo vínculo', async () => {
    const ctx = await tesoureiro();
    const email = emailUnico();

    const response = await request(createApp())
      .post('/auth/register')
      .set('Authorization', ctx.authorization)
      .send({ name: 'Maria', email, password: 'senha-segura' });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email, active: true });
    expect(await vinculos(email)).toEqual([
      { organizationId: ctx.organization.id, role: 'CONSULTOR', active: true },
    ]);
  });
});
