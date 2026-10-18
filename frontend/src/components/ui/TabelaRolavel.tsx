import type { ReactNode } from 'react';

interface TabelaRolavelProps {
  titulo: string;
  // No celular cada linha vira um cartao, com o arranjo definido pelo data-campo das celulas.
  cartoes?: boolean;
  children: ReactNode;
}

// Tabelas de extrato e listagem passam de 6 colunas em fonte monoespacada.
// O contorno rolavel evita que a pagina inteira role de lado e recebe foco de
// teclado para quem navega sem mouse.
export function TabelaRolavel({ titulo, cartoes = false, children }: TabelaRolavelProps) {
  return (
    <div
      className="tabela-rolavel"
      role="region"
      aria-label={titulo}
      tabIndex={0}
      data-cartoes={cartoes || undefined}
    >
      {children}
    </div>
  );
}
