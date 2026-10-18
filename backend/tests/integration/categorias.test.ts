import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import {
  createCategory,
  createMembership,
  createOrganization,
  createUser,
} from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

const DESCRICAO_DA_FACTORY = 'Categoria criada por uma factory de integração';

describe('consulta de categorias', () => {
  // CA-F11-06: a tela de categorias edita nome, descricao e tipo a partir da listagem.
  it('devolve a descrição de cada categoria', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });
    const transporte = await createCategory({
      organizationId: organization.id,
      name: 'Transporte',
      description: 'Ônibus e combustível',
      type: 'SAIDA',
    });

    const response = await request(createApp())
      .get('/categorias')
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dados: [
        {
          id: transporte.id.toString(),
          nome: 'Transporte',
          descricao: 'Ônibus e combustível',
          tipo: 'SAIDA',
        },
      ],
    });
  });

  it('Cenário 1 - listar categorias por tipo', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });

    await createCategory({
      organizationId: organization.id,
      name: 'Doações',
      type: 'ENTRADA',
    });
    const alimentacao = await createCategory({
      organizationId: organization.id,
      name: 'Alimentação',
      type: 'SAIDA',
    });
    const material = await createCategory({
      organizationId: organization.id,
      name: 'Material',
      type: 'SAIDA',
    });

    const response = await request(createApp())
      .get('/categorias')
      .query({ tipo: 'SAIDA' })
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dados: [
        {
          id: alimentacao.id.toString(),
          nome: 'Alimentação',
          tipo: 'SAIDA',
          descricao: DESCRICAO_DA_FACTORY,
        },
        {
          id: material.id.toString(),
          nome: 'Material',
          tipo: 'SAIDA',
          descricao: DESCRICAO_DA_FACTORY,
        },
      ],
    });
  });

  it('Cenário 2 - isolamento entre organizações', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    const otherOrganization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });

    const mensalidades = await createCategory({
      organizationId: organization.id,
      name: 'Mensalidades',
      type: 'ENTRADA',
    });
    await createCategory({
      organizationId: otherOrganization.id,
      name: 'Aluguel',
      type: 'SAIDA',
    });
    await createCategory({
      organizationId: otherOrganization.id,
      name: 'Patrocínio',
      type: 'ENTRADA',
    });

    const response = await request(createApp())
      .get('/categorias')
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dados: [
        {
          id: mensalidades.id.toString(),
          nome: 'Mensalidades',
          tipo: 'ENTRADA',
          descricao: DESCRICAO_DA_FACTORY,
        },
      ],
    });
  });

  it('não lista categoria inativa', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });

    const ativa = await createCategory({
      organizationId: organization.id,
      name: 'Categoria ativa',
      type: 'SAIDA',
      active: true,
    });
    await createCategory({
      organizationId: organization.id,
      name: 'Categoria inativa',
      type: 'SAIDA',
      active: false,
    });

    const response = await request(createApp())
      .get('/categorias')
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dados: [
        {
          id: ativa.id.toString(),
          nome: 'Categoria ativa',
          tipo: 'SAIDA',
          descricao: DESCRICAO_DA_FACTORY,
        },
      ],
    });
  });

  it('lista entradas e saídas quando o tipo não é informado', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });

    const aluguel = await createCategory({
      organizationId: organization.id,
      name: 'Aluguel',
      type: 'SAIDA',
    });
    const doacoes = await createCategory({
      organizationId: organization.id,
      name: 'Doações',
      type: 'ENTRADA',
    });

    const response = await request(createApp())
      .get('/categorias')
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dados: [
        {
          id: aluguel.id.toString(),
          nome: 'Aluguel',
          tipo: 'SAIDA',
          descricao: DESCRICAO_DA_FACTORY,
        },
        {
          id: doacoes.id.toString(),
          nome: 'Doações',
          tipo: 'ENTRADA',
          descricao: DESCRICAO_DA_FACTORY,
        },
      ],
    });
  });

  it('ordena as categorias por nome', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });

    await createCategory({ organizationId: organization.id, name: 'Transporte', type: 'SAIDA' });
    await createCategory({ organizationId: organization.id, name: 'Aluguel', type: 'SAIDA' });
    await createCategory({ organizationId: organization.id, name: 'Material', type: 'SAIDA' });

    const response = await request(createApp())
      .get('/categorias')
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(200);
    expect(response.body.dados.map((categoria: { nome: string }) => categoria.nome)).toEqual([
      'Aluguel',
      'Material',
      'Transporte',
    ]);
  });

  it('rejeita tipo inválido com mensagem em português', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });
    await createCategory({ organizationId: organization.id, name: 'Material', type: 'SAIDA' });

    const response = await request(createApp())
      .get('/categorias')
      .query({ tipo: 'OUTRO' })
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { tipo: 'Opção inválida: esperava uma das seguintes opções: "ENTRADA"|"SAIDA"' },
    });
  });

  it('rejeita organizacaoId na query com mensagem em português', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    const otherOrganization = await createOrganization();
    await createMembership({ userId: user.id, organizationId: organization.id });
    await createCategory({
      organizationId: otherOrganization.id,
      name: 'Aluguel',
      type: 'SAIDA',
    });

    const response = await request(createApp())
      .get('/categorias')
      .query({ organizacaoId: otherOrganization.id.toString() })
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      erro: 'Dados inválidos',
      campos: { requisicao: 'Chave inválida: "organizacaoId"' },
    });
  });

  it('rejeita requisição sem token de autenticação', async () => {
    const response = await request(createApp()).get('/categorias');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ erro: 'Token de autenticação não fornecido.' });
  });

  it('responde 403 para usuário sem vínculo ativo', async () => {
    const user = await createUser();
    const organization = await createOrganization();
    await createMembership({
      userId: user.id,
      organizationId: organization.id,
      active: false,
    });
    await createCategory({ organizationId: organization.id, name: 'Material', type: 'SAIDA' });

    const response = await request(createApp())
      .get('/categorias')
      .set('Authorization', createAuthorizationHeader(user));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      erro: 'Usuário não possui vínculo ativo com uma organização',
    });
  });
});
