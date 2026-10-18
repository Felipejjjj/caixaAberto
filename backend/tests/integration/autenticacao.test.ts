import bcrypt from 'bcrypt';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createUser } from '../factories/index.js';

const SENHA_VALIDA = 'SenhaForte@123';

async function criarUsuarioComSenha(senha: string, overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash(senha, 10);

  return createUser({ passwordHash, ...overrides });
}

describe('autenticação da sessão', () => {
  it('Cenário 1 - login com credenciais válidas retorna o token e os dados do usuário', async () => {
    const usuario = await criarUsuarioComSenha(SENHA_VALIDA);

    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: usuario.email, password: SENHA_VALIDA });

    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe('string');
    expect(response.body.token.length).toBeGreaterThan(0);
    expect(response.body.user).toMatchObject({
      id: usuario.id.toString(),
      name: usuario.name,
      email: usuario.email,
      active: true,
    });
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('Cenário 2 - login com senha incorreta retorna 401', async () => {
    const usuario = await criarUsuarioComSenha(SENHA_VALIDA);

    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: usuario.email, password: 'senhaErrada@123' });

    expect(response.status).toBe(401);
    expect(response.body.erro).toBe('E-mail ou senha inválidos');
  });

  it('Cenário 3 - login com email inexistente retorna 401', async () => {
    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: 'ninguem@example.test', password: SENHA_VALIDA });

    expect(response.status).toBe(401);
    expect(response.body.erro).toBe('E-mail ou senha inválidos');
  });

  it('aceita senha e devolve o usuário com propriedades em português', async () => {
    const usuario = await criarUsuarioComSenha(SENHA_VALIDA);

    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: usuario.email, senha: SENHA_VALIDA });

    expect(response.status).toBe(200);
    expect(response.body.usuario).toEqual({
      id: usuario.id.toString(),
      nome: usuario.name,
      email: usuario.email,
      ativo: true,
    });
  });

  // CA-F01-03: a conta inativa so e revelada a quem acerta a senha.
  it('responde 401 genérico para conta inativa com senha errada', async () => {
    const usuario = await criarUsuarioComSenha(SENHA_VALIDA, { active: false });

    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: usuario.email, senha: 'senhaErrada@123' });

    expect(response.status).toBe(401);
    expect(response.body.erro).toBe('E-mail ou senha inválidos');
  });

  it('Cenário 4 - login de usuário inativo retorna 403', async () => {
    const usuario = await criarUsuarioComSenha(SENHA_VALIDA, { active: false });

    const response = await request(createApp())
      .post('/auth/login')
      .send({ email: usuario.email, password: SENHA_VALIDA });

    expect(response.status).toBe(403);
    expect(response.body.erro).toBe('Usuário inativo');
  });

  it('Cenário 5 - login sem e-mail ou sem senha retorna 400', async () => {
    const semSenha = await request(createApp())
      .post('/auth/login')
      .send({ email: 'usuario@example.test' });

    expect(semSenha.status).toBe(400);
    expect(semSenha.body.erro).toBe('Preencha e-mail e senha');

    const semEmail = await request(createApp())
      .post('/auth/login')
      .send({ password: SENHA_VALIDA });

    expect(semEmail.status).toBe(400);
    expect(semEmail.body.erro).toBe('Preencha e-mail e senha');
  });

  it('Cenário 6 - logout retorna sucesso', async () => {
    const usuario = await criarUsuarioComSenha(SENHA_VALIDA);
    const login = await request(createApp())
      .post('/auth/login')
      .send({ email: usuario.email, password: SENHA_VALIDA });

    const response = await request(createApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send();

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });
});
