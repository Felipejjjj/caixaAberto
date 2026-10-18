import { useEffect, useId, useState } from 'react';

import { ApiError, apiRequest } from '../lib/httpClient';

type CategoryType = 'ENTRADA' | 'SAIDA';

interface CategoryOption {
  id: string;
  nome: string;
  tipo: CategoryType;
}

interface CategoryListResponse {
  dados: CategoryOption[];
}

interface CategorySelectProps {
  tipo: CategoryType;
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  label?: string;
  name?: string;
  // Na correcao de lancamento, a categoria ja gravada pode ter sido excluida e nao vem na lista
  // de ativas; ela continua como opcao para o lancamento poder ser corrigido sem trocar de
  // categoria.
  categoriaAtual?: { id: string; nome: string };
}

const ROTULO_TIPO: Record<CategoryType, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
};

export function CategorySelect({
  tipo,
  value,
  onChange,
  disabled = false,
  invalid = false,
  required = false,
  label = 'Categoria',
  name = 'categoriaId',
  categoriaAtual,
}: CategorySelectProps) {
  const selectId = useId();
  const [categorias, setCategorias] = useState<CategoryOption[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregarCategorias() {
      setCarregando(true);
      setErro(null);

      try {
        const params = new URLSearchParams({ tipo });
        const resposta = await apiRequest<CategoryListResponse>(`/categorias?${params.toString()}`);

        if (!cancelado) {
          setCategorias(resposta.dados);
        }
      } catch (error) {
        if (!cancelado) {
          setCategorias([]);
          setErro(
            error instanceof ApiError ? error.message : 'Não foi possível carregar categorias',
          );
        }
      } finally {
        if (!cancelado) {
          setCarregando(false);
        }
      }
    }

    void carregarCategorias();

    return () => {
      cancelado = true;
    };
  }, [tipo]);

  const selectDesabilitado = disabled || carregando;
  const atualExcluida =
    categoriaAtual && !carregando && !categorias.some((item) => item.id === categoriaAtual.id)
      ? categoriaAtual
      : null;

  return (
    <label htmlFor={selectId}>
      {label}
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={selectDesabilitado}
        aria-invalid={erro || invalid ? true : undefined}
      >
        <option value="" disabled>
          {carregando
            ? 'Carregando categorias...'
            : erro
              ? 'Não foi possível carregar categorias'
              : categorias.length === 0
                ? 'Nenhuma categoria disponível'
                : 'Selecione uma categoria'}
        </option>
        {atualExcluida && <option value={atualExcluida.id}>{atualExcluida.nome} (excluída)</option>}
        {categorias.map((categoria) => (
          <option key={categoria.id} value={categoria.id}>
            {categoria.nome} ({ROTULO_TIPO[categoria.tipo]})
          </option>
        ))}
      </select>
      {erro && <small role="alert">{erro}</small>}
    </label>
  );
}
