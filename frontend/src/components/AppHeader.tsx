import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

import type { OrganizacaoDoUsuario } from '../lib/organizacoes';
import { podeEscrever } from '../lib/session';
import { OrganizationSelector } from './OrganizationSelector';

// Os grupos so aparecem com titulo no celular, onde o menu vira uma lista recolhivel. No desktop
// a navegacao continua numa linha so, com um respiro maior entre os grupos.
const GRUPOS = [
  {
    titulo: 'Movimento',
    links: [
      { to: '/lancamentos', rotulo: 'Lançamentos' },
      { to: '/extrato', rotulo: 'Extrato' },
      { to: '/resumo', rotulo: 'Resumo' },
      { to: '/relatorios/categorias', rotulo: 'Relatório' },
    ],
  },
  {
    titulo: 'Organização',
    links: [
      { to: '/organizacao/membros', rotulo: 'Membros' },
      { to: '/organizacao/categorias', rotulo: 'Categorias' },
      { to: '/organizacao/editar', rotulo: 'Organização', somenteEscrita: true },
      { to: '/organizacao/link-publico', rotulo: 'Link público', somenteEscrita: true },
    ],
  },
];

interface AppHeaderProps {
  // Telas sem sessao (login e transparencia publica) mostram so a assinatura.
  comNavegacao?: boolean;
  acoes?: ReactNode;
  organizacoes?: OrganizacaoDoUsuario[];
  organizacaoId?: string | null;
  onSelecionarOrganizacao?: (organizacaoId: string) => void;
}

export function AppHeader({
  comNavegacao = false,
  acoes,
  organizacoes = [],
  organizacaoId = null,
  onSelecionarOrganizacao,
}: AppHeaderProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  function fecharComEsc(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !menuAberto) return;
    setMenuAberto(false);
    botaoMenu.current?.focus();
  }

  return (
    <header className="marca" onKeyDown={fecharComEsc}>
      <div className="marca__interno">
        {comNavegacao ? (
          <Link to="/lancamentos" className="marca__nome">
            Caixa Aberto
          </Link>
        ) : (
          <span className="marca__nome">Caixa Aberto</span>
        )}

        {comNavegacao ? (
          <>
            {organizacoes.length > 0 && onSelecionarOrganizacao && (
              <OrganizationSelector
                organizacoes={organizacoes}
                organizacaoId={organizacaoId}
                onChange={onSelecionarOrganizacao}
              />
            )}
            <nav
              id="navegacao-principal"
              className="navegacao"
              aria-label="Navegação principal"
              data-aberto={menuAberto}
            >
              {GRUPOS.map((grupo) => (
                <div key={grupo.titulo} className="navegacao__grupo">
                  <span className="navegacao__titulo">{grupo.titulo}</span>
                  {grupo.links
                    .filter((link) => !link.somenteEscrita || podeEscrever())
                    .map((link) => (
                      <NavLink key={link.to} to={link.to} onClick={() => setMenuAberto(false)}>
                        {link.rotulo}
                      </NavLink>
                    ))}
                </div>
              ))}
            </nav>
          </>
        ) : (
          <p className="marca__legenda">Prestação de contas</p>
        )}

        {(comNavegacao || acoes) && (
          <div className="marca__fim">
            {comNavegacao && (
              <button
                ref={botaoMenu}
                type="button"
                className="marca__menu"
                data-variante="quieto"
                aria-expanded={menuAberto}
                aria-controls="navegacao-principal"
                onClick={() => setMenuAberto((aberto) => !aberto)}
              >
                {menuAberto ? 'Fechar' : 'Menu'}
              </button>
            )}
            {acoes}
          </div>
        )}
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="rodape">
      <span>Caixa Aberto</span>
      <span>Datas e horários em America/Fortaleza</span>
    </footer>
  );
}
