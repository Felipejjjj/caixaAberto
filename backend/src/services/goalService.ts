import { formatCivilDate, todayCivilDate } from '../domain/civil-date.js';
import { AppError } from '../errors/app-error.js';
import { Prisma } from '../generated/prisma/client.js';
import * as goalRepository from '../repositories/goalRepository.js';
import type { GoalRecord } from '../repositories/goalRepository.js';

const STATUS_LABELS = {
  EM_ANDAMENTO: 'Em andamento',
  PRAZO_ENCERRADO: 'Prazo encerrado',
  CONCLUIDA: 'Concluída',
};

type GoalStatus = keyof typeof STATUS_LABELS;

export interface GoalResponse {
  id: string;
  descricao: string;
  valorAlvo: string;
  prazo: string;
  valorArrecadado: string;
  percentual: number;
  situacao: GoalStatus;
  situacaoDescricao: string;
}

function getStatus(raised: Prisma.Decimal, goal: GoalRecord, today: Date): GoalStatus {
  if (raised.gte(goal.targetAmount)) return 'CONCLUIDA';
  return goal.deadline < today ? 'PRAZO_ENCERRADO' : 'EM_ANDAMENTO';
}

async function toResponse(organizationId: bigint, goal: GoalRecord, today: Date) {
  // A meta soma as entradas válidas da organização entre o dia em que foi criada e o prazo.
  const raised = await goalRepository.sumValidIncome(
    organizationId,
    todayCivilDate(goal.createdAt),
    goal.deadline,
  );
  const status = getStatus(raised, goal, today);
  const percentage = goal.targetAmount.gt(0)
    ? raised.div(goal.targetAmount).times(100).toDecimalPlaces(2).toNumber()
    : 0;

  return {
    id: goal.id.toString(),
    descricao: goal.description,
    valorAlvo: goal.targetAmount.toFixed(2),
    prazo: formatCivilDate(goal.deadline),
    valorArrecadado: raised.toFixed(2),
    percentual: percentage,
    situacao: status,
    situacaoDescricao: STATUS_LABELS[status],
  };
}

export async function listGoals(organizationId: bigint, today: Date = todayCivilDate()) {
  const goals = await goalRepository.findGoalsByOrganization(organizationId);
  const dados = await Promise.all(goals.map((goal) => toResponse(organizationId, goal, today)));

  return { dados };
}

function toGoalResponse(goal: GoalRecord) {
  return {
    id: goal.id.toString(),
    descricao: goal.description,
    valorAlvo: goal.targetAmount.toFixed(2),
    prazo: formatCivilDate(goal.deadline),
  };
}

export async function createGoal(
  organizationId: bigint,
  input: { description: string; targetAmount: string; deadline: Date },
) {
  const goal = await goalRepository.createGoal({
    organizationId,
    description: input.description,
    targetAmount: new Prisma.Decimal(input.targetAmount),
    deadline: input.deadline,
    createdAt: new Date(),
  });
  return toGoalResponse(goal);
}

export async function updateGoal(
  organizationId: bigint,
  id: bigint,
  changes: { description?: string; targetAmount?: string; deadline?: Date },
) {
  const current = await goalRepository.findGoalByIdInOrganization(id, organizationId);
  if (!current) throw new AppError(404, 'Meta não encontrada');

  const goal = await goalRepository.updateGoal(id, organizationId, {
    ...(changes.description !== undefined ? { description: changes.description } : {}),
    ...(changes.targetAmount !== undefined
      ? { targetAmount: new Prisma.Decimal(changes.targetAmount) }
      : {}),
    ...(changes.deadline !== undefined ? { deadline: changes.deadline } : {}),
  });
  if (!goal) throw new AppError(404, 'Meta não encontrada');
  return toGoalResponse(goal);
}
