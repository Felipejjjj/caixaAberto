import type { ChangeEvent } from 'react';

import type { OrganizacaoDoUsuario } from '../lib/organizacoes';

interface OrganizationSelectorProps {
  organizacoes: OrganizacaoDoUsuario[];
  organizacaoId: string | null;
  onChange: (organizacaoId: string) => void;
}

export function OrganizationSelector({
  organizacoes,
  organizacaoId,
  onChange,
}: OrganizationSelectorProps) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.target.value);
  }

  return (
    <label className="seletor-organizacao">
      <span className="apenas-leitor">Organização de trabalho</span>
      <select
        aria-label="Organização de trabalho"
        value={organizacaoId ?? ''}
        onChange={handleChange}
      >
        <option value="" disabled>
          Selecione uma organização
        </option>
        {organizacoes.map((item) => (
          <option key={item.organizacao.id} value={item.organizacao.id}>
            {item.organizacao.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
