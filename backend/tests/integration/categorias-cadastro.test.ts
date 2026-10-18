import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import {
  createCategory,
  createMembership,
  createOrganization,
  createUser,
} from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

async function criarOrganizacao(role: 'TESOUREIRO' | 'CONSULTOR' = 'TESOUREIRO') {
  const user = await createUser();
  const organization = await createOrganization();
  await createMembership({ userId: user.id, organizationId: organization.id, role });

  return { organization, authorization: createAuthorizationHeader(user) };
}

function cadastrar(authorization: string, body: object) {
  return request(createApp()).post('/categorias').set('Authorization', authorization).send(body);
}

async function contarCategorias(organizationId: bigint) {
  return prisma.category.count({ where: { organizationId } });
}

describe('cadastro de categoria (US14)', () => {
  it('Cenário 1 - cadastrar categoria de saída', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const response = await cadastrar(authorization, {
      nome: 'Transporte',
      descricao: 'Ônibus e combustível das viagens',
      tipo: 'SAIDA',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      nome: 'Transporte',
      descricao: 'Ônibus e combustível das viagens',
      tipo: 'SAIDA',
    });

    const categoria = await prisma.category.findUniqueOrThrow({
      where: { id: BigInt(response.body.id) },
    });
    expect(categoria).toMatchObject({ organizationId: organization.id, active: true });

    const saidas = await request(createApp())
      .get('/categorias')
      .query({ tipo: 'SAIDA' })
      .set('Authorization', authorization);
    expect(saidas.body.dados).toEqual([
      {
        id: response.body.id,
        nome: 'Transporte',
        descricao: 'Ônibus e combustível das viagens',
        tipo: 'SAIDA',
      },
    ]);
  });

  it('Cenário 2 - nome duplicado na mesma organização', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createCategory({ organizationId: organization.id, name: 'Transporte', type: 'SAIDA' });

    const response = await cadastrar(authorization, { nome: 'Transporte', tipo: 'SAIDA' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ erro: 'Já existe uma categoria com esse nome e tipo' });
    expect(await contarCategorias(organization.id)).toBe(1);
  });

  it('compara o nome sem diferenciar maiúsculas nem espaços nas pontas', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createCategory({ organizationId: organization.id, name: 'Transporte', type: 'SAIDA' });

    const response = await cadastrar(authorization, { nome: '  transporte ', tipo: 'SAIDA' });

    expect(response.status).toBe(409);
    expect(await contarCategorias(organization.id)).toBe(1);
  });

  it('avisa quando o nome pertence a uma categoria desativada', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createCategory({
      organizationId: organization.id,
      name: 'Transporte',
      type: 'SAIDA',
      active: false,
    });

    const response = await cadastrar(authorization, { nome: 'Transporte', tipo: 'SAIDA' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      erro: 'Já existe uma categoria desativada com esse nome e tipo',
    });
  });

  it('aceita o mesmo nome com o outro tipo', async () => {
    const { organization, authorization } = await criarOrganizacao();
    await createCategory({ organizationId: organization.id, name: 'Eventos', type: 'SAIDA' });

    const response = await cadastrar(authorization, { nome: 'Eventos', tipo: 'ENTRADA' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ nome: 'Eventos', tipo: 'ENTRADA' });
  });

  it('aceita o mesmo nome em outra organização', async () => {
    const { authorization } = await criarOrganizacao();
    const outra = await createOrganization();
    await createCategory({ organizationId: outra.id, name: 'Transporte', type: 'SAIDA' });

    const response = await cadastrar(authorization, { nome: 'Transporte', tipo: 'SAIDA' });

    expect(response.status).toBe(201);
  });

  it('grava o nome sem os espaços das pontas e a descrição vazia quando omitida', async () => {
    const { authorization } = await criarOrganizacao();

    const response = await cadastrar(authorization, { nome: '  Transporte  ', tipo: 'SAIDA' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ nome: 'Transporte', descricao: '' });
  });

  it('cadastra uma única vez quando dois pedidos chegam juntos', async () => {
    const { organization, authorization } = await criarOrganizacao();

    const respostas = await Promise.all([
      cadastrar(authorization, { nome: 'Transporte', tipo: 'SAIDA' }),
      cadastrar(authorization, { nome: 'Transporte', tipo: 'SAIDA' }),
    ]);

    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 409]);
    expect(await contarCategorias(organization.id)).toBe(1);
  });

  it('recusa o cadastro feito por CONSULTOR', async () => {
    const { organization, authorization } = await criarOrganizacao('CONSULTOR');

    const response = await cadastrar(authorization, { nome: 'Transporte', tipo: 'SAIDA' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ erro: 'Acesso permitido apenas para TESOUREIRO' });
    expect(await contarCategorias(organization.id)).toBe(0);
  });

  it('rejeita tipo inválido', async () => {
    const { authorization } = await criarOrganizacao();

    const response = await cadastrar(authorization, { nome: 'Transporte', tipo: 'AMBOS' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { tipo: 'Opção inválida: esperava uma das seguintes opções: "ENTRADA"|"SAIDA"' },
    });
  });

  it('rejeita nome vazio ou só com espaços', async () => {
    const { authorization } = await criarOrganizacao();

    const response = await cadastrar(authorization, { nome: '   ', tipo: 'SAIDA' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { nome: 'Informe o nome da categoria' },
    });
  });

  it('rejeita nome acima do tamanho da coluna', async () => {
    const { authorization } = await criarOrganizacao();

    const response = await cadastrar(authorization, { nome: 'a'.repeat(101), tipo: 'SAIDA' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { nome: 'O nome deve ter no máximo 100 caracteres' },
    });
  });

  it('rejeita organizacaoId no corpo', async () => {
    const { authorization } = await criarOrganizacao();
    const outra = await createOrganization();

    const response = await cadastrar(authorization, {
      nome: 'Transporte',
      tipo: 'SAIDA',
      organizacaoId: outra.id.toString(),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { requisicao: 'Chave inválida: "organizacaoId"' },
    });
    expect(await contarCategorias(outra.id)).toBe(0);
  });

  it('rejeita requisição sem token de autenticação', async () => {
    const response = await request(createApp())
      .post('/categorias')
      .send({ nome: 'Transporte', tipo: 'SAIDA' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ erro: 'Token de autenticação não fornecido.' });
  });
});
