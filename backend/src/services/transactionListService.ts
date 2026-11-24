import { formatCivilDate } from '../domain/civil-date.js';
import type { TransactionType } from '../domain/transaction.js';
import * as transactionListRepository from '../repositories/transactionListRepository.js';
import type { TransactionListRecord } from '../repositories/transactionListRepository.js';

export interface TransactionListQuery {
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  categoryId?: bigint;
  userId?: bigint;
  page: number;
  pageSize: number;
}

export interface TransactionListItem {
  id: string;
  data: string;
  descricao: string;
  categoria: { id: string; nome: string };
  valor: string;
  tipo: string;
  status: string;
  possuiComprovante: boolean;
}

export interface TransactionListResponse {
  dados: TransactionListItem[];
  paginacao: {
    pagina: number;
    tamanhoPagina: number;
    total: number;
    totalPaginas: number;
  };
}

function toListItem(record: TransactionListRecord): TransactionListItem {
  return {
    id: record.id.toString(),
    data: formatCivilDate(record.date),
    descricao: record.description,
    categoria: {
      id: record.category.id.toString(),
      nome: record.category.name,
    },
    valor: record.amount.toFixed(2),
    tipo: record.type,
    status: record.status,
    possuiComprovante: record.receipt !== null,
  };
}

export async function listTransactions(
  organizationId: bigint,
  query: TransactionListQuery,
): Promise<TransactionListResponse> {
  const { page, pageSize, ...filters } = query;

  const { items, total } = await transactionListRepository.findTransactionsPage(
    { organizationId, ...filters },
    { skip: (page - 1) * pageSize, take: pageSize },
  );

  return {
    dados: items.map(toListItem),
    paginacao: {
      pagina: page,
      tamanhoPagina: pageSize,
      total,
      totalPaginas: Math.ceil(total / pageSize),
    },
  };
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function exportTransactionsCsv(
  organizationId: bigint,
  filters: Omit<TransactionListQuery, 'page' | 'pageSize'>,
): Promise<string> {
  const rows = await transactionListRepository.findTransactionsForExport({
    organizationId,
    ...filters,
  });
  const header = [
    'id',
    'data',
    'descricao',
    'categoria_id',
    'categoria',
    'valor',
    'tipo',
    'status',
    'usuario_id',
    'possui_comprovante',
  ];
  const lines = rows.map((row) => [
    row.id.toString(),
    formatCivilDate(row.date),
    row.description,
    row.category.id.toString(),
    row.category.name,
    row.amount.toFixed(2),
    row.type,
    row.status,
    row.userId.toString(),
    row.receipt !== null ? 'sim' : 'nao',
  ]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(csvField).join(',')).join('\r\n')}\r\n`;
}
