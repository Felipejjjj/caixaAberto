import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UserRegistrationPage } from '../src/pages/UserRegistrationPage';
import { autenticar, stubApi } from './helpers/api';

function renderizar() {
  return render(
    <MemoryRouter>
      <UserRegistrationPage />
    </MemoryRouter>,
  );
}

async function preencher(usuario: ReturnType<typeof userEvent.setup>, email = 'maria@grupo.org') {
  await usuario.type(screen.getByLabelText('Nome'), 'Maria');
  await usuario.type(screen.getByLabelText('E-mail'), email);
  await usuario.type(screen.getByLabelText('Senha'), 'senha-segura');
  await usuario.type(screen.getByLabelText('Confirmar senha'), 'senha-segura');
}

// A conta nasce vinculada a organizacao de quem cadastra; a tela escolhe o papel.
describe('UserRegistrationPage', () => {
  it('cadastra com o papel escolhido e confirma o vínculo', async () => {
    autenticar();
    const api = stubApi({ '/users': { status: 201, body: { id: '9', email: 'maria@grupo.org' } } });
    const usuario = userEvent.setup();
    renderizar();

    await preencher(usuario);
    await usuario.selectOptions(screen.getByLabelText('Papel na organização'), 'TESOUREIRO');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar usuário' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Conta de Maria criada e vinculada à organização como tesoureiro.',
    );
    expect(api.chamadasPara('/users')[0]!.body).toEqual({
      name: 'Maria',
      email: 'maria@grupo.org',
      password: 'senha-segura',
      papel: 'TESOUREIRO',
    });
  });

  it('não chama a API com e-mail inválido', async () => {
    autenticar();
    const api = stubApi({});
    const usuario = userEvent.setup();
    renderizar();

    await preencher(usuario, 'maria-sem-arroba');
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar usuário' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(api.chamadasPara('/users')).toHaveLength(0);
  });

  it('mostra a recusa da API para e-mail já cadastrado', async () => {
    autenticar();
    stubApi({ '/users': { status: 400, body: { erro: 'E-mail já cadastrado' } } });
    const usuario = userEvent.setup();
    renderizar();

    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar usuário' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado');
  });
});
