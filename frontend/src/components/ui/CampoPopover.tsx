import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ContextoPopover } from './contextoPopover';

interface CampoPopoverProps {
  rotulo: string;
  texto: string;
  vazio?: boolean;
  invalido?: boolean;
  rotuloDoPainel: string;
  mensagem?: ReactNode;
  children: ReactNode;
}

// A casca comum dos campos que se escolhe em vez de digitar. O gesto e o mesmo do
// calendario que o navegador abria sozinho: o campo vira botao, o painel ancora nele,
// Escape e clique fora fecham e o foco volta para o campo.
export function CampoPopover({
  rotulo,
  texto,
  vazio = false,
  invalido = false,
  rotuloDoPainel,
  mensagem,
  children,
}: CampoPopoverProps) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);

  function fechar() {
    setAberto(false);
    campo.current?.focus();
  }

  // O foco entra no painel assim que ele abre, para que as setas funcionem sem exigir
  // um Tab antes. A ordem importa: o painel diz onde o foco pousa com data-foco, e o
  // primeiro botao e so o ultimo recurso, porque na arvore ele e a seta de navegacao.
  useEffect(() => {
    if (!aberto) return;

    const procurar = (seletor: string) => painel.current?.querySelector<HTMLElement>(seletor);
    const alvo =
      procurar('[data-foco="true"]') ?? procurar('[aria-pressed="true"]') ?? procurar('button');

    alvo?.focus();
  }, [aberto]);

  // O painel ancora pela esquerda do campo. Num campo da coluna direita, como o "Ate" ao lado do
  // "De" no celular, ele passaria da borda da tela; nesse caso ancora pela direita. A medida vem
  // antes da pintura para o painel nao aparecer no lugar errado por um quadro.
  useLayoutEffect(() => {
    const elemento = painel.current;
    if (!aberto || !elemento) return;

    const passaDaBorda =
      elemento.getBoundingClientRect().right > document.documentElement.clientWidth;
    if (passaDaBorda) elemento.dataset.alinhamento = 'direita';
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }

    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  return (
    <div
      className="campo-popover"
      ref={raiz}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && aberto) {
          evento.preventDefault();
          fechar();
        }
      }}
    >
      <label htmlFor={id}>{rotulo}</label>

      <button
        type="button"
        id={id}
        ref={campo}
        className="campo-popover__campo"
        data-vazio={vazio || undefined}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-invalid={invalido || undefined}
        onClick={() => setAberto(!aberto)}
      >
        <span>{texto}</span>
        <IconeCalendario />
      </button>

      {aberto && (
        <div
          className="campo-popover__painel"
          role="dialog"
          aria-label={rotuloDoPainel}
          ref={painel}
        >
          <ContextoPopover.Provider value={fechar}>{children}</ContextoPopover.Provider>
        </div>
      )}

      {mensagem}
    </div>
  );
}

function IconeCalendario() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="3.5" width="12" height="10.5" rx="1" />
      <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" />
    </svg>
  );
}

interface CabecalhoPainelProps {
  rotuloAnterior: string;
  rotuloProximo: string;
  aoVoltar: () => void;
  aoAvancar: () => void;
  children: ReactNode;
}

export function CabecalhoPainel({
  rotuloAnterior,
  rotuloProximo,
  aoVoltar,
  aoAvancar,
  children,
}: CabecalhoPainelProps) {
  return (
    <div className="campo-popover__cabecalho">
      <button
        type="button"
        className="campo-popover__navegar"
        aria-label={rotuloAnterior}
        onClick={aoVoltar}
      >
        <IconeSeta direcao="anterior" />
      </button>

      {children}

      <button
        type="button"
        className="campo-popover__navegar"
        aria-label={rotuloProximo}
        onClick={aoAvancar}
      >
        <IconeSeta direcao="proximo" />
      </button>
    </div>
  );
}

function IconeSeta({ direcao }: { direcao: 'anterior' | 'proximo' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direcao === 'anterior' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} />
    </svg>
  );
}
