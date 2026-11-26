import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function criarOrganizacao(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const responsavel = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: responsavel.id, organizationId: organization.id, role });

  return { organization, authorization: createAuthorizationHeader(responsavel) };
}

function vincular(organizationId: bigint | string, authorization: string, body: object) {
  return request(createApp())
    .post(`/organizacoes/${organizationId.toString()}/membros`)
    .set('Authorization', authorization)
    .send(body);
}

async function contarVinculos(organizationId: bigint) {
  return prisma.membership.count({ where: { organizationId } });
}

// So o Date fica parado: rede, banco e timers continuam reais.
function fixarAgora(instante: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instante));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('vincular usuário à organização (US09)', () => {
  it('Cenário 1 - vincular membro', async () => {
    fixarAgora('2026-09-24T15:00:00.000Z');
    const { organization, authorization } = await criarOrganizacao();
    const maria = await createUser({ name: 'Maria', email: 'maria@grupo.org' });

    const response = await vincular(organization.id, authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      usuario: { id: maria.id.toString(), nome: 'Maria', email: 'maria@grupo.org', ativo: true },
      papel: 'CONSULTOR',
      dataVinculo: '2026-09-24',
      ativo: true,
    });

    const vinculo = await prisma.membership.findUniqueOrThrow({
      where: { id: BigInt(response.body.id) },
    });
    expect(vinculo).toMatchObject({
      userId: maria.id,
      organizationId: organization.id,
      role: 'CONSULTOR',
      linkedAt: new Date('2026-09-24T00:00:00.000Z'),
      active: true,
    });

    // O vinculo e o que da acesso: Maria passa a trabalhar no contexto da organizacao.
    const contexto = await request(createApp())
      .get('/organizacoes/atual/contexto')
      .set('Authorization', createAuthorizationHeader(maria));
    expect(contexto.status).toBe(200);
    expect(contexto.body).toEqual({
      organizacaoId: organization.id.toString(),
      papel: 'CONSULTOR',
    });
  });

  it('Cenário 2 - vínculo duplicado', async () => {
    const { organization, authorization } = await criarOrganizacao();
    const maria = await createUser({ email: 'maria@grupo.org' });
    await createMembership({
      userId: maria.id,
      organizationId: organization.id,
      role: 'CONSULTOR',
    });

    const response = await vincular(organization.id, authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ erro: 'Usuário já é membro ativo da organização' });
    expect(await contarVinculos(organization.id)).toBe(2);
  });

  it('reativa o vínculo desativado como consultor e com a data de hoje', async () => {
    fixarAgora('2026-09-24T15:00:00.000Z');
    const { organization, authorization } = await criarOrganizacao();
    const maria = await createUser({ email: 'maria@grupo.org' });
    const antigo = await createMembership({
      userId: maria.id,
      organizationId: organization.id,
      role: 'TESOUREIRO',
      linkedAt: new Date('2026-01-10T00:00:00.000Z'),
      active: false,
    });

    const response = await vincular(organization.id, authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: antigo.id.toString(),
      papel: 'CONSULTOR',
      dataVinculo: '2026-09-24',
      ativo: true,
    });
    expect(await contarVinculos(organization.id)).toBe(2);
  });

  it('registra a data do vínculo pelo dia em Fortaleza, e não pelo dia em UTC', async () => {
    // 02h em UTC do dia 25 ainda sao 23h do dia 24 em Fortaleza.
    fixarAgora('2026-09-25T02:00:00.000Z');
    const { organization, authorization } = await criarOrganizacao();
    await createUser({ email: 'maria@grupo.org' });

    const response = await vincular(organization.id, authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(201);
    expect(response.body.dataVinculo).toBe('2026-09-24');
  });

  it('vincula uma única vez quando dois pedidos chegam juntos', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createUser({ email: 'maria@grupo.org' });

    const respostas = await Promise.all([
      vincular(organization.id, authorization, { email: 'maria@grupo.org' }),
      vincular(organization.id, authorization, { email: 'maria@grupo.org' }),
    ]);

    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 409]);
    expect(await contarVinculos(organization.id)).toBe(2);
  });

  it('ignora espaços nas pontas do e-mail', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createUser({ email: 'maria@grupo.org' });

    const response = await vincular(organization.id, authorization, {
      email: '  maria@grupo.org ',
    });

    expect(response.status).toBe(201);
    expect(response.body.usuario.email).toBe('maria@grupo.org');
  });

  it('encontra o usuário pelo e-mail digitado com outras maiúsculas', async () => {
    const { organization, authorization } = await criarOrganizacao();
    const maria = await createUser({ email: 'maria@grupo.org' });

    const response = await vincular(organization.id, authorization, {
      email: 'Maria@Grupo.ORG',
    });

    expect(response.status).toBe(201);
    expect(response.body.usuario).toMatchObject({
      id: maria.id.toString(),
      email: 'maria@grupo.org',
    });
  });

  it('recusa vincular conta inativa', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createUser({ email: 'maria@grupo.org', active: false });

    const response = await vincular(organization.id, authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ erro: 'Usuário inativo não pode ser vinculado' });
    expect(await contarVinculos(organization.id)).toBe(1);
  });

  it('responde 404 para e-mail sem usuário cadastrado', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const response = await vincular(organization.id, authorization, { email: 'joao@grupo.org' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ erro: 'Usuário não encontrado' });
    expect(await contarVinculos(organization.id)).toBe(1);
  });

  it('recusa o vínculo feito por CONSULTOR', async () => {
    const { organization, authorization } = await criarOrganizacao('CONSULTOR');
    await createUser({ email: 'maria@grupo.org' });

    const response = await vincular(organization.id, authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ erro: 'Acesso permitido apenas para TESOUREIRO' });
    expect(await contarVinculos(organization.id)).toBe(1);
  });

  it('trata outra organização no caminho como inexistente e não cria vínculo nela', async () => {
    const { authorization } = await criarOrganizacao();
    const outra = await criarOrganizacao();
    await createUser({ email: 'maria@grupo.org' });

    const response = await vincular(outra.organization.id, authorization, {
      email: 'maria@grupo.org',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ erro: 'Organização não encontrada' });
    expect(await contarVinculos(outra.organization.id)).toBe(1);
  });

  it('rejeita identificador de organização inválido', async () => {
    const { authorization } = await criarOrganizacao();

    const response = await vincular('abc', authorization, { email: 'maria@grupo.org' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { id: 'Informe um identificador numérico' },
    });
  });

  it('rejeita e-mail em formato inválido', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const response = await vincular(organization.id, authorization, { email: 'maria' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { email: 'Formato do endereço de e-mail inválido' },
    });
  });

  it('rejeita corpo sem e-mail', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const response = await vincular(organization.id, authorization, {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { email: 'Informe o e-mail do usuário' },
    });
  });

  it('rejeita propriedade desconhecida, como um papel escolhido pelo cliente', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createUser({ email: 'maria@grupo.org' });

    const response = await vincular(organization.id, authorization, {
      email: 'maria@grupo.org',
      papel: 'TESOUREIRO',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { requisicao: 'Chave inválida: "papel"' },
    });
    expect(await contarVinculos(organization.id)).toBe(1);
  });

  it('rejeita requisição sem token de autenticação', async () => {
    const { organization } = await criarOrganizacao();

    const response = await request(createApp())
      .post(`/organizacoes/${organization.id}/membros`)
      .send({ email: 'maria@grupo.org' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ erro: 'Token de autenticação não fornecido.' });
  });
});
