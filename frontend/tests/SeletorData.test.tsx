import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SeletorData } from '../src/components/ui/SeletorData';

function Hospedeiro({
  inicial = '2026-09-17',
  limpavel = false,
  aoSelecionar,
}: {
  inicial?: string;
  limpavel?: boolean;
  aoSelecionar?: (data: string) => void;
}) {
  const [data, setData] = useState(inicial);

  return (
    <SeletorData
      rotulo="De"
      valor={data}
      limpavel={limpavel}
      aoSelecionar={(nova) => {
        setData(nova);
        aoSelecionar?.(nova);
      }}
    />
  );
}

function painel() {
  return screen.getByRole('dialog', { name: 'Escolher de' });
}

// O calendario nativo so existia em alguns navegadores. Estes testes cobrem o gesto que
// substituiu ele: escolher, nunca digitar, com o mesmo valor saindo para a API.
describe('SeletorData', () => {
  it('mostra a data escolhida em DD/MM/AAAA e o marcador quando está vazia', () => {
    const { unmount } = render(<Hospedeiro />);

    expect(screen.getByLabelText('De')).toHaveTextContent('17/09/2026');
    unmount();

    render(<Hospedeiro inicial="" />);

    expect(screen.getByLabelText('De')).toHaveTextContent('dd/mm/aaaa');
  });

  it('não aceita digitação no campo', async () => {
    const usuario = userEvent.setup();
    render(<Hospedeiro />);

    const campo = screen.getByLabelText('De');

    expect(campo.tagName).toBe('BUTTON');

    await usuario.click(campo);
    await usuario.keyboard('31/02/2026');

    expect(screen.getByLabelText('De')).toHaveTextContent('17/09/2026');
  });

  it('emite YYYY-MM-DD ao escolher um dia e fecha o painel', async () => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    render(<Hospedeiro aoSelecionar={aoSelecionar} />);

    await usuario.click(screen.getByLabelText('De'));
    await usuario.click(within(painel()).getByRole('button', { name: '3 de setembro de 2026' }));

    expect(aoSelecionar).toHaveBeenCalledWith('2026-09-03');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('De')).toHaveTextContent('03/09/2026');
  });

  it('anda de mês pelas setas e respeita o tamanho do mês', async () => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    render(<Hospedeiro inicial="2026-01-31" aoSelecionar={aoSelecionar} />);

    await usuario.click(screen.getByLabelText('De'));
    await usuario.click(screen.getByRole('button', { name: 'Próximo mês' }));

    // Fevereiro de 2026 nao tem 31 dias, entao o foco cai no ultimo dia existente.
    expect(within(painel()).getByText('fevereiro de 2026')).toBeInTheDocument();
    expect(within(painel()).queryByRole('button', { name: '29 de fevereiro de 2026' })).toBeNull();

    await usuario.click(within(painel()).getByRole('button', { name: '28 de fevereiro de 2026' }));

    expect(aoSelecionar).toHaveBeenCalledWith('2026-02-28');
  });

  it('salta para outro mês pela grade de meses no cabeçalho', async () => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    render(<Hospedeiro aoSelecionar={aoSelecionar} />);

    await usuario.click(screen.getByLabelText('De'));
    await usuario.click(within(painel()).getByRole('button', { name: 'setembro de 2026' }));
    await usuario.click(within(painel()).getByRole('button', { name: 'dez' }));
    await usuario.click(within(painel()).getByRole('button', { name: '1 de dezembro de 2026' }));

    expect(aoSelecionar).toHaveBeenCalledWith('2026-12-01');
  });

  it('navega pelo teclado e seleciona com Enter', async () => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    render(<Hospedeiro aoSelecionar={aoSelecionar} />);

    await usuario.click(screen.getByLabelText('De'));
    // Uma semana para tras e um dia para frente, a partir de 17/09.
    await usuario.keyboard('{ArrowUp}{ArrowRight}{Enter}');

    expect(aoSelecionar).toHaveBeenCalledWith('2026-09-11');
  });

  it('atravessa a virada de mês pelas setas do teclado', async () => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    render(<Hospedeiro inicial="2026-09-01" aoSelecionar={aoSelecionar} />);

    await usuario.click(screen.getByLabelText('De'));
    await usuario.keyboard('{ArrowLeft}{Enter}');

    expect(aoSelecionar).toHaveBeenCalledWith('2026-08-31');
  });

  it('limpa o filtro quando o campo permite, e não oferece isso quando não permite', async () => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    const { unmount } = render(<Hospedeiro limpavel aoSelecionar={aoSelecionar} />);

    await usuario.click(screen.getByLabelText('De'));
    await usuario.click(within(painel()).getByRole('button', { name: 'Limpar' }));

    expect(aoSelecionar).toHaveBeenCalledWith('');
    expect(screen.getByLabelText('De')).toHaveTextContent('dd/mm/aaaa');
    unmount();

    render(<Hospedeiro />);

    await usuario.click(screen.getByLabelText('De'));

    expect(within(painel()).queryByRole('button', { name: 'Limpar' })).toBeNull();
  });

  it('fecha com Escape e devolve o foco ao campo', async () => {
    const usuario = userEvent.setup();
    render(<Hospedeiro />);

    const campo = screen.getByLabelText('De');

    await usuario.click(campo);
    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(campo).toHaveFocus();
  });

  // No celular o "Ate" fica na coluna da direita, e o painel ancorado pela esquerda passava da
  // borda da tela. O jsdom nao faz layout, entao a medida do painel e simulada.
  it('ancora o painel pela direita quando ele passaria da borda da tela', async () => {
    const usuario = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      right: 495,
    } as DOMRect);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(360);

    render(<Hospedeiro />);
    await usuario.click(screen.getByLabelText('De'));

    expect(painel()).toHaveAttribute('data-alinhamento', 'direita');
  });

  it('mantém o painel ancorado pela esquerda quando ele cabe na tela', async () => {
    const usuario = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      right: 340,
    } as DOMRect);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(360);

    render(<Hospedeiro />);
    await usuario.click(screen.getByLabelText('De'));

    expect(painel()).not.toHaveAttribute('data-alinhamento');
  });
});
