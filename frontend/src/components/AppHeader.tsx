import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { podeEscrever } from '../lib/session';

const LINKS = [
  { to: '/lancamentos', rotulo: 'Lançamentos' },
  { to: '/extrato', rotulo: 'Extrato' },
  { to: '/resumo', rotulo: 'Resumo' },
  { to: '/relatorios/categorias', rotulo: 'Relatório' },
  { to: '/organizacao/membros', rotulo: 'Membros' },
  { to: '/organizacao/link-publico', rotulo: 'Link público', somenteEscrita: true },
];

interface AppHeaderProps {
  // Telas sem sessao (login e transparencia publica) mostram so a assinatura.
  comNavegacao?: boolean;
  acoes?: ReactNode;
}

export function AppHeader({ comNavegacao = false, acoes }: AppHeaderProps) {
  return (
    <header className="marca">
      <div className="marca__interno">
        {comNavegacao ? (
          <Link to="/lancamentos" className="marca__nome">
            Caixa Aberto
          </Link>
        ) : (
          <span className="marca__nome">Caixa Aberto</span>
        )}

        {comNavegacao ? (
          <nav className="navegacao" aria-label="Navegação principal">
            {LINKS.filter((link) => !link.somenteEscrita || podeEscrever()).map((link) => (
              <NavLink key={link.to} to={link.to}>
                {link.rotulo}
              </NavLink>
            ))}
          </nav>
        ) : (
          <p className="marca__legenda">Prestação de contas</p>
        )}

        {acoes && <div className="marca__fim">{acoes}</div>}
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
