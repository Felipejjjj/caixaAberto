import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function setup(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const actor = await createUser();
  const organization = await createOrganization();
  const actorMembership = await createMembership({
    userId: actor.id,
    organizationId: organization.id,
    role,
  });
  const member = await createUser();
  const membership = await createMembership({
    userId: member.id,
    organizationId: organization.id,
    role: 'CONSULTOR',
  });
  return {
    actor,
    organization,
    actorMembership,
    member,
    membership,
    authorization: createAuthorizationHeader(actor),
  };
}

function alterar(id: bigint | string, authorization: string, body: object) {
  return request(createApp())
    .put(`/membros/${id.toString()}/papel`)
    .set('Authorization', authorization)
    .send(body);
}

describe('alterar papel de membro (US10)', () => {
  it('promove o consultor e a mudança vale na requisição seguinte', async () => {
    const ctx = await setup();
    const promoted = await alterar(ctx.membership.id, ctx.authorization, { papel: 'TESOUREIRO' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.papel).toBe('TESOUREIRO');

    const newUser = await createUser();
    const nextRequest = await request(createApp())
      .post(`/organizacoes/${ctx.organization.id}/membros`)
      .set('Authorization', createAuthorizationHeader(ctx.member))
      .send({ email: newUser.email });
    expect(nextRequest.status).toBe(201);
  });

  it('impede rebaixar o último tesoureiro ativo', async () => {
    const ctx = await setup();
    const lastTreasurer = await alterar(ctx.actorMembership.id, ctx.authorization, {
      papel: 'CONSULTOR',
    });
    expect(lastTreasurer.status).toBe(409);

    const addTreasurer = await alterar(ctx.membership.id, ctx.authorization, {
      papel: 'TESOUREIRO',
    });
    expect(addTreasurer.status).toBe(200);
    const demote = await alterar(ctx.actorMembership.id, ctx.authorization, { papel: 'CONSULTOR' });
    expect(demote.status).toBe(200);
  });

  it('serializa rebaixamentos simultâneos e mantém ao menos um tesoureiro', async () => {
    const ctx = await setup();
    const secondTreasurer = await createUser();
    const secondMembership = await createMembership({
      userId: secondTreasurer.id,
      organizationId: ctx.organization.id,
      role: 'TESOUREIRO',
    });

    const [first, second] = await Promise.all([
      alterar(ctx.actorMembership.id, ctx.authorization, { papel: 'CONSULTOR' }),
      alterar(secondMembership.id, ctx.authorization, { papel: 'CONSULTOR' }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    expect(
      await prisma.membership.count({
        where: { organizationId: ctx.organization.id, active: true, role: 'TESOUREIRO' },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('responde 404 para vínculo de outra organização', async () => {
    const ctx = await setup();
    const otherOrganization = await createOrganization();
    const otherUser = await createUser();
    const otherMembership = await createMembership({
      userId: otherUser.id,
      organizationId: otherOrganization.id,
      role: 'CONSULTOR',
    });
    const response = await alterar(otherMembership.id, ctx.authorization, { papel: 'TESOUREIRO' });
    expect(response.status).toBe(404);
  });

  it('responde 403 quando consultor tenta alterar papel', async () => {
    const ctx = await setup('CONSULTOR');
    const response = await alterar(ctx.membership.id, ctx.authorization, { papel: 'TESOUREIRO' });
    expect(response.status).toBe(403);
  });

  it('responde 400 para papel inválido', async () => {
    const ctx = await setup();
    const response = await alterar(ctx.membership.id, ctx.authorization, { papel: 'ADMIN' });
    expect(response.status).toBe(400);
  });
});
