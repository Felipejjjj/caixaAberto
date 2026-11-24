import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

interface UsuarioResposta {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

async function setup() {
  const admin = await createUser({ name: 'Admin Geral', email: 'admin@grupo.org' });
  const organization = await createOrganization();
  await createMembership({
    userId: admin.id,
    organizationId: organization.id,
    role: 'TESOUREIRO',
  });

  async function adicionar(
    dados: { name: string; email: string; active?: boolean },
    vinculoAtivo = true,
  ) {
    const user = await createUser(dados);
    await createMembership({
      userId: user.id,
      organizationId: organization.id,
      role: 'CONSULTOR',
      active: vinculoAtivo,
    });
    return user;
  }

  return { admin, organization, adicionar, authorization: createAuthorizationHeader(admin) };
}

function buscar(authorization: string, busca?: string) {
  const chamada = request(createApp()).get('/users').set('Authorization', authorization);
  return busca === undefined ? chamada : chamada.query({ busca });
}

function emails(response: { body: unknown }): string[] {
  return (response.body as UsuarioResposta[]).map((usuario) => usuario.email).sort();
}

describe('listar e buscar usuários (US06)', () => {
  it('BDD - buscar "maria" traz quem tem "maria" no nome OU no e-mail, com a situação', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Maria Souza', email: 'souza@grupo.org' });
    await ctx.adicionar({ name: 'João Lima', email: 'joao@maria-grupo.org' });
    await ctx.adicionar({ name: 'Pedro Alves', email: 'pedro@grupo.org' });
    await ctx.adicionar({ name: 'Ana Maria Dias', email: 'ana@grupo.org', active: false });

    const response = await buscar(ctx.authorization, 'maria');

    expect(response.status).toBe(200);
    expect(emails(response)).toEqual(['ana@grupo.org', 'joao@maria-grupo.org', 'souza@grupo.org']);

    const porEmail = Object.fromEntries(
      (response.body as UsuarioResposta[]).map((usuario) => [usuario.email, usuario.active]),
    );
    expect(porEmail).toEqual({
      'ana@grupo.org': false,
      'joao@maria-grupo.org': true,
      'souza@grupo.org': true,
    });
  });

  it('a busca não diferencia maiúsculas de minúsculas', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Maria Souza', email: 'souza@grupo.org' });
    await ctx.adicionar({ name: 'Pedro', email: 'PEDRO.Maria@Grupo.org' });

    const minuscula = await buscar(ctx.authorization, 'maria');
    const maiuscula = await buscar(ctx.authorization, 'MARIA');
    const mista = await buscar(ctx.authorization, 'mArIa');

    expect(emails(minuscula)).toEqual(['PEDRO.Maria@Grupo.org', 'souza@grupo.org']);
    expect(emails(maiuscula)).toEqual(emails(minuscula));
    expect(emails(mista)).toEqual(emails(minuscula));
  });

  it('busca parcial localiza por trecho do e-mail', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Carlos', email: 'carlos.pereira@grupo.org' });
    await ctx.adicionar({ name: 'Bia', email: 'bia@grupo.org' });

    const response = await buscar(ctx.authorization, 'pereira@gru');

    expect(emails(response)).toEqual(['carlos.pereira@grupo.org']);
  });

  it('sem busca, ou com busca vazia ou só espaços, lista todos', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Maria', email: 'maria@grupo.org' });
    await ctx.adicionar({ name: 'Pedro', email: 'pedro@grupo.org' });
    const todos = ['admin@grupo.org', 'maria@grupo.org', 'pedro@grupo.org'];

    expect(emails(await buscar(ctx.authorization))).toEqual(todos);
    expect(emails(await buscar(ctx.authorization, ''))).toEqual(todos);
    expect(emails(await buscar(ctx.authorization, '   '))).toEqual(todos);
  });

  it('devolve os dados de identificação e nunca a senha', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Maria Souza', email: 'souza@grupo.org' });

    const response = await buscar(ctx.authorization, 'souza');

    expect(response.body).toHaveLength(1);
    expect(Object.keys(response.body[0]).sort()).toEqual([
      'active',
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/senha|password|hash/i);
  });

  it('não devolve quem não pertence à organização nem quem foi desvinculado', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Maria Desvinculada', email: 'desvinculada@grupo.org' }, false);

    const outra = await createOrganization();
    const forasteira = await createUser({ name: 'Maria Forasteira', email: 'fora@outro.org' });
    await createMembership({ userId: forasteira.id, organizationId: outra.id });

    const response = await buscar(ctx.authorization, 'maria');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('busca sem resultado devolve lista vazia', async () => {
    const ctx = await setup();

    const response = await buscar(ctx.authorization, 'ninguem-com-este-nome');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('trata % e _ como texto comum, não como curinga', async () => {
    const ctx = await setup();
    await ctx.adicionar({ name: 'Maria', email: 'maria@grupo.org' });

    const porcentagem = await buscar(ctx.authorization, '%');
    const sublinhado = await buscar(ctx.authorization, '_');

    expect(porcentagem.body).toEqual([]);
    expect(sublinhado.body).toEqual([]);

    await ctx.adicionar({ name: 'Ana Paula', email: 'ana_paula@grupo.org' });
    const literal = await buscar(ctx.authorization, 'a_p');
    expect(emails(literal)).toEqual(['ana_paula@grupo.org']);
  });

  it('rejeita parâmetro desconhecido e busca longa demais', async () => {
    const ctx = await setup();

    const desconhecido = await request(createApp())
      .get('/users')
      .query({ nome: 'maria' })
      .set('Authorization', ctx.authorization);
    const longa = await buscar(ctx.authorization, 'a'.repeat(151));

    expect(desconhecido.status).toBe(400);
    expect(longa.status).toBe(400);
  });

  it('exige autenticação', async () => {
    const response = await request(createApp()).get('/users').query({ busca: 'maria' });

    expect(response.status).toBe(401);
  });
});
