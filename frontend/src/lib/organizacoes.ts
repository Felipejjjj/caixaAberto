import type { Papel } from './session';

export interface OrganizacaoResumo {
  id: string;
  nome: string;
  descricao: string;
  inicioGestao: string;
  fimGestao: string;
  linkPublico: string | null;
  transparenciaAtiva: boolean;
}

export interface OrganizacaoDoUsuario {
  vinculoId: string;
  papel: Papel;
  dataVinculo: string;
  organizacao: OrganizacaoResumo;
}

export interface OrganizacoesDoUsuarioResponse {
  dados: OrganizacaoDoUsuario[];
}

export interface OrganizacaoResponse {
  organizacao: OrganizacaoResumo;
  vinculoCriador?: {
    id: string;
    papel: Papel;
    dataVinculo: string;
    ativo: boolean;
  };
}
