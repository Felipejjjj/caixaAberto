import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import {
  passwordResetNotifier,
  type PasswordResetMessage,
} from '../../src/notifications/passwordResetNotifier.js';
import { createMembership, createOrganization, createUser } from '../factories/index.js';
import { createAuthorizationHeader } from '../helpers/auth.js';

const SENHA_ANTIGA = 'senhaAntiga@123';
const SENHA_NOVA = 'senhaNova@456';
const MENSAGEM_GENERICA =
  'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.';
const LINK_INVALIDO = 'Link de redefinição inválido ou expirado. Solicite um novo.';

async function criarUsuario(overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser({ passwordHash: await bcrypt.hash(SENHA_ANTIGA, 10), ...overrides });
}

// O link nao sai da API: ele vai para o envio. O teste fica no lugar de quem recebe a mensagem.
function capturarEnvios() {
  const enviados: PasswordResetMessage[] = [];
  vi.spyOn(passwordResetNotifier, 'send').mockImplementation(async (message) => {
    enviados.push(message);
  });

  return enviados;
}

function tokenDoLink(link: string): string {
  const token = new URL(link).searchParams.get('token');

  if (!token) {
    throw new Error(`Link sem token: ${link}`);
  }

  return token;
}

function solicitar(body: object) {
  return request(createApp()).post('/auth/senha/solicitar').send(body);
}

function redefinir(body: object) {
  return request(createApp()).post('/auth/senha/redefinir').send(body);
}

function entrar(email: string, password: string) {
  return request(createApp()).post('/auth/login').send({ email, password });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('redefinição de senha (US02)', () => {
  it('Cenário 1 - redefinir senha com token', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();

    const pedido = await solicitar({ email: usuario.email });

    expect(pedido.status).toBe(202);
    expect(pedido.body).toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ name: usuario.name, email: usuario.email });
    expect(enviados[0]?.link).toMatch(/\/redefinir-senha\?token=[\w-]+$/);

    const redefinicao = await redefinir({
      token: tokenDoLink(enviados[0]!.link),
      novaSenha: SENHA_NOVA,
    });

    expect(redefinicao.status).toBe(200);
    expect(redefinicao.body).toEqual({ mensagem: 'Senha redefinida. Entre com a nova senha.' });
    expect((await entrar(usuario.email, SENHA_NOVA)).status).toBe(200);
    expect((await entrar(usuario.email, SENHA_ANTIGA)).status).toBe(401);
  });

  it('Cenário 2 - e-mail não cadastrado', async () => {
    const enviados = capturarEnvios();

    const response = await solicitar({ email: 'ninguem@example.test' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(enviados).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('conta inativa recebe a mesma resposta e nenhum link', async () => {
    const usuario = await criarUsuario({ active: false });
    const enviados = capturarEnvios();

    const response = await solicitar({ email: usuario.email });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(enviados).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('encontra a conta mesmo com maiúsculas e espaços no e-mail', async () => {
    const usuario = await criarUsuario({ email: 'ana.souza@example.test' });
    const enviados = capturarEnvios();

    const response = await solicitar({ email: '  Ana.Souza@Example.TEST ' });

    expect(response.status).toBe(202);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.email).toBe(usuario.email);
  });

  it('guarda só o hash do token, com validade de uma hora', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();
    const antes = Date.now();

    await solicitar({ email: usuario.email });

    const token = tokenDoLink(enviados[0]!.link);
    const registro = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: usuario.id },
    });
    expect(registro.tokenHash).not.toBe(token);
    expect(registro.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(registro.usedAt).toBeNull();
    expect(registro.expiresAt.getTime() - antes).toBeGreaterThan(59 * 60 * 1000);
    expect(registro.expiresAt.getTime() - antes).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  it('recusa token expirado e mantém a senha', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();
    await solicitar({ email: usuario.email });
    await prisma.passwordResetToken.updateMany({
      where: { userId: usuario.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await redefinir({
      token: tokenDoLink(enviados[0]!.link),
      novaSenha: SENHA_NOVA,
    });

    expect(response.status).toBe(400);
    expect(response.body.erro).toBe(LINK_INVALIDO);
    expect((await entrar(usuario.email, SENHA_ANTIGA)).status).toBe(200);
  });

  it('aceita o link uma vez só', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();
    await solicitar({ email: usuario.email });
    const token = tokenDoLink(enviados[0]!.link);

    const primeira = await redefinir({ token, novaSenha: SENHA_NOVA });
    const segunda = await redefinir({ token, novaSenha: 'outraSenha@789' });

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(400);
    expect(segunda.body.erro).toBe(LINK_INVALIDO);
    expect((await entrar(usuario.email, SENHA_NOVA)).status).toBe(200);
  });

  it('um pedido novo invalida o link anterior', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();
    await solicitar({ email: usuario.email });
    await solicitar({ email: usuario.email });

    const antigo = await redefinir({
      token: tokenDoLink(enviados[0]!.link),
      novaSenha: SENHA_NOVA,
    });
    const novo = await redefinir({ token: tokenDoLink(enviados[1]!.link), novaSenha: SENHA_NOVA });

    expect(antigo.status).toBe(400);
    expect(novo.status).toBe(200);
  });

  it('recusa token desconhecido', async () => {
    const response = await redefinir({ token: 'token-que-nunca-existiu', novaSenha: SENHA_NOVA });

    expect(response.status).toBe(400);
    expect(response.body.erro).toBe(LINK_INVALIDO);
  });

  it('recusa conta desativada depois do pedido', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();
    await solicitar({ email: usuario.email });
    await prisma.user.update({ where: { id: usuario.id }, data: { active: false } });

    const response = await redefinir({
      token: tokenDoLink(enviados[0]!.link),
      novaSenha: SENHA_NOVA,
    });

    expect(response.status).toBe(400);
  });

  it('senha inválida não consome o link', async () => {
    const usuario = await criarUsuario();
    const enviados = capturarEnvios();
    await solicitar({ email: usuario.email });
    const token = tokenDoLink(enviados[0]!.link);

    const curta = await redefinir({ token, novaSenha: 'curta' });
    const longa = await redefinir({ token, novaSenha: 'a'.repeat(73) });
    const valida = await redefinir({ token, novaSenha: SENHA_NOVA });

    expect(curta.status).toBe(400);
    expect(curta.body.campos).toHaveProperty('novaSenha');
    expect(longa.status).toBe(400);
    expect(longa.body.campos).toHaveProperty('novaSenha');
    expect(valida.status).toBe(200);
  });

  it('rejeita e-mail inválido e propriedade não reconhecida', async () => {
    const enviados = capturarEnvios();

    const semEmail = await solicitar({});
    const emailInvalido = await solicitar({ email: 'nao-e-email' });
    const extra = await solicitar({ email: 'ana@example.test', organizacaoId: '1' });
    const redefinicaoExtra = await redefinir({
      token: 'qualquer',
      novaSenha: SENHA_NOVA,
      email: 'ana@example.test',
    });

    expect(semEmail.status).toBe(400);
    expect(emailInvalido.status).toBe(400);
    expect(emailInvalido.body.campos).toHaveProperty('email');
    expect(extra.status).toBe(400);
    expect(redefinicaoExtra.status).toBe(400);
    expect(enviados).toHaveLength(0);
  });

  it('falha no envio não muda a resposta', async () => {
    const usuario = await criarUsuario();
    vi.spyOn(passwordResetNotifier, 'send').mockRejectedValue(new Error('envio fora do ar'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await solicitar({ email: usuario.email });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ mensagem: MENSAGEM_GENERICA });
  });
});

// Sessao aberta um minuto antes: o iat do JWT tem precisao de segundos, e um token emitido no mesmo
// segundo da troca continuaria valendo. Assinar no passado deixa o teste independente do relogio.
function sessaoAbertaHaUmMinuto(user: { id: bigint; email: string }): string {
  const token = jwt.sign(
    { email: user.email, iat: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET!,
    { subject: user.id.toString(), expiresIn: '1d', jwtid: randomUUID() },
  );

  return `Bearer ${token}`;
}

function consultarContexto(authorization: string) {
  return request(createApp()).get('/test/contexto').set('Authorization', authorization);
}

async function redefinirSenhaDe(email: string) {
  const enviados = capturarEnvios();
  await solicitar({ email });

  return redefinir({ token: tokenDoLink(enviados[0]!.link), novaSenha: SENHA_NOVA });
}

describe('sessões abertas na redefinição de senha (US02)', () => {
  it('encerra as sessões abertas com a senha antiga', async () => {
    const organization = await createOrganization();
    const usuario = await criarUsuario();
    await createMembership({ userId: usuario.id, organizationId: organization.id });
    const sessaoAntiga = sessaoAbertaHaUmMinuto(usuario);
    expect((await consultarContexto(sessaoAntiga)).status).toBe(200);

    expect((await redefinirSenhaDe(usuario.email)).status).toBe(200);

    const depois = await consultarContexto(sessaoAntiga);
    expect(depois.status).toBe(401);
    expect(depois.body.erro).toBe('Sessão encerrada pela troca de senha. Entre novamente.');
  });

  it('aceita o login feito logo depois da troca', async () => {
    const organization = await createOrganization();
    const usuario = await criarUsuario();
    await createMembership({ userId: usuario.id, organizationId: organization.id });

    await redefinirSenhaDe(usuario.email);
    const login = await entrar(usuario.email, SENHA_NOVA);

    expect(login.status).toBe(200);
    expect((await consultarContexto(`Bearer ${login.body.token}`)).status).toBe(200);
  });

  it('não encerra sessões de outros usuários', async () => {
    const organization = await createOrganization();
    const usuario = await criarUsuario();
    const colega = await criarUsuario();
    await createMembership({ userId: usuario.id, organizationId: organization.id });
    await createMembership({ userId: colega.id, organizationId: organization.id });
    const sessaoDoColega = sessaoAbertaHaUmMinuto(colega);

    await redefinirSenhaDe(usuario.email);

    expect((await consultarContexto(sessaoDoColega)).status).toBe(200);
  });

  it('sem redefinição, sessões antigas seguem valendo', async () => {
    const organization = await createOrganization();
    const usuario = await criarUsuario();
    await createMembership({ userId: usuario.id, organizationId: organization.id });
    capturarEnvios();

    // So pedir o link nao derruba nada: a senha antiga ainda vale ate a troca.
    await solicitar({ email: usuario.email });

    expect((await consultarContexto(sessaoAbertaHaUmMinuto(usuario))).status).toBe(200);
    expect((await consultarContexto(createAuthorizationHeader(usuario))).status).toBe(200);
  });
});
