import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { formatCivilDate, todayCivilDate } from '../../src/domain/civil-date.js';
import { createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

const atletica = {
  nome: 'Atlética TSI',
  descricao: 'Gestão 2026/2027',
  inicioGestao: '2026-09-01',
  fimGestao: '2027-08-31',
};

function cadastrar(authorization: string, body: object) {
  return request(createApp()).post('/organizacoes').set('Authorization', authorization).send(body);
}

describe('cadastro de organização (US07)', () => {
  it('Cenário 1 - cadastrar organização válida', async () => {
    const user = await createUser();
    const authorization = createAuthorizationHeader(user);

    const response = await cadastrar(authorization, atletica);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      organizacao: {
        id: expect.any(String),
        nome: 'Atlética TSI',
        descricao: 'Gestão 2026/2027',
        inicioGestao: '2026-09-01',
        fimGestao: '2027-08-31',
        linkPublico: null,
        transparenciaAtiva: false,
      },
      vinculoCriador: {
        id: expect.any(String),
        papel: 'TESOUREIRO',
        dataVinculo: formatCivilDate(todayCivilDate()),
        ativo: true,
      },
    });

    // O criador passa a trabalhar no contexto da organizacao nova, ja como tesoureiro.
    const contexto = await request(createApp())
      .get('/test/contexto')
      .set('Authorization', authorization);

    expect(contexto.status).toBe(200);
    expect(contexto.body).toEqual({
      usuarioId: user.id.toString(),
      organizacaoId: response.body.organizacao.id,
      papel: 'TESOUREIRO',
    });
  });

  it('Cenário 2 - período de gestão inválido', async () => {
    const user = await createUser();

    const response = await cadastrar(createAuthorizationHeader(user), {
      ...atletica,
      inicioGestao: '2027-09-01',
    });

    expect(response.status).toBe(400);
    expect(response.body.erro).toBe(
      'A data inicial da gestão deve ser anterior ou igual à data final.',
    );
    expect(await prisma.organization.count()).toBe(0);
    expect(await prisma.membership.count()).toBe(0);
  });

  it('aceita gestão que começa e termina no mesmo dia', async () => {
    const user = await createUser();

    const response = await cadastrar(createAuthorizationHeader(user), {
      ...atletica,
      inicioGestao: '2026-09-01',
      fimGestao: '2026-09-01',
    });

    expect(response.status).toBe(201);
  });

  it('rejeita data inexistente, campo ausente e propriedade não reconhecida', async () => {
    const authorization = createAuthorizationHeader(await createUser());

    const dataInexistente = await cadastrar(authorization, {
      ...atletica,
      fimGestao: '2027-02-30',
    });
    const semNome = await cadastrar(authorization, { ...atletica, nome: '   ' });
    const emIngles = await cadastrar(authorization, { ...atletica, name: 'Atlética TSI' });

    expect(dataInexistente.status).toBe(400);
    expect(dataInexistente.body.campos).toHaveProperty('fimGestao');
    expect(semNome.status).toBe(400);
    expect(semNome.body.campos).toHaveProperty('nome');
    expect(emIngles.status).toBe(400);
    expect(await prisma.organization.count()).toBe(0);
  });

  it('exige autenticação', async () => {
    const response = await request(createApp()).post('/organizacoes').send(atletica);

    expect(response.status).toBe(401);
    expect(await prisma.organization.count()).toBe(0);
  });

  it('recusa conta inativa', async () => {
    const user = await createUser({ active: false });

    const response = await cadastrar(createAuthorizationHeader(user), atletica);

    expect(response.status).toBe(401);
    expect(await prisma.organization.count()).toBe(0);
  });
});
