import { Link, NavLink, Outlet } from 'react-router-dom';

import { useOrganizationContext } from '../contexts/useOrganizacao';
import { podeEscrever } from '../lib/session';

// Dados e link publico sao escrita do tesoureiro: o consultor so ve as abas que pode abrir.
const SECOES = [
  { to: '/organizacao/membros', rotulo: 'Membros' },
  { to: '/organizacao/categorias', rotulo: 'Categorias' },
  { to: '/organizacao/metas', rotulo: 'Metas' },
  { to: '/organizacao/editar', rotulo: 'Dados', somenteEscrita: true },
  { to: '/organizacao/link-publico', rotulo: 'Link público', somenteEscrita: true },
];

// Faixa comum as telas de administracao da organizacao, entre o cabecalho e a pagina. Cada tela
// continua com o proprio <main>; esta faixa so diz de qual organizacao se trata e leva as abas.
export function OrganizationArea() {
  const { organizacaoSelecionada } = useOrganizationContext();

  return (
    <div className="area-organizacao">
      <div className="area-organizacao__topo">
        <div>
          <p className="area-organizacao__rotulo">Organização</p>
          <p className="area-organizacao__nome">{organizacaoSelecionada?.organizacao.nome}</p>
        </div>
        <Link className="acao" data-variante="secundario" to="/organizacao/nova">
          Nova organização
        </Link>
      </div>

      <nav className="subnavegacao" aria-label="Seções da organização">
        {SECOES.filter((secao) => !secao.somenteEscrita || podeEscrever()).map((secao) => (
          <NavLink key={secao.to} to={secao.to}>
            {secao.rotulo}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
