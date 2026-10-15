import type { UpdateOrganizationData } from '../repositories/organizationRepository.js';
import { formatCivilDate, todayCivilDate } from '../domain/civil-date.js';
import { AppError } from '../errors/app-error.js';
import * as organizationRepository from '../repositories/organizationRepository.js';

const INVALID_PERIOD = 'A data inicial da gestão deve ser anterior ou igual à data final.';
const ORGANIZATION_NOT_FOUND = 'Organização não encontrada.';
const INACTIVE_CREATOR = 'Somente um usuário ativo pode criar uma organização.';
const TRANSACTIONS_OUTSIDE_PERIOD =
  'Existem lançamentos fora do novo período de gestão. Ajuste o período para incluí-los.';

type CreateOrganizationInput = {
  name: string;
  description: string;
  managementStart: Date;
  managementEnd: Date;
  creatorUserId: bigint;
};

export type UpdateOrganizationInput = {
  name?: string;
  description?: string;
  managementStart?: Date;
  managementEnd?: Date;
};

function formatOrganization(organization: {
  id: bigint;
  name: string;
  description: string;
  managementStart: Date;
  managementEnd: Date;
  transparencyActive: boolean;
  publicLink: string | null;
}) {
  return {
    id: organization.id.toString(),
    nome: organization.name,
    descricao: organization.description,
    inicioGestao: formatCivilDate(organization.managementStart),
    fimGestao: formatCivilDate(organization.managementEnd),
    linkPublico: organization.publicLink,
    transparenciaAtiva: organization.transparencyActive,
  };
}

function validatePeriod(start: Date, end: Date): void {
  if (start > end) {
    throw new AppError(400, INVALID_PERIOD);
  }
}

export async function createOrganization(input: CreateOrganizationInput) {
  const creator = await organizationRepository.findActiveUserById(input.creatorUserId);

  if (!creator) {
    throw new AppError(401, INACTIVE_CREATOR);
  }

  validatePeriod(input.managementStart, input.managementEnd);

  const created = await organizationRepository.createWithTreasurer({
    name: input.name,
    description: input.description,
    managementStart: input.managementStart,
    managementEnd: input.managementEnd,
    creatorUserId: input.creatorUserId,
    linkedAt: todayCivilDate(),
  });

  return {
    organizacao: formatOrganization(created.organization),
    vinculoCriador: {
      id: created.membership.id.toString(),
      papel: created.membership.role,
      dataVinculo: formatCivilDate(created.membership.linkedAt),
      ativo: created.membership.active,
    },
  };
}

export async function updateOrganization(organizationId: bigint, input: UpdateOrganizationInput) {
  const current = await organizationRepository.findById(organizationId);

  if (!current) {
    throw new AppError(404, ORGANIZATION_NOT_FOUND);
  }

  const managementStart = input.managementStart ?? current.managementStart;
  const managementEnd = input.managementEnd ?? current.managementEnd;

  validatePeriod(managementStart, managementEnd);

  /*
   * Lançamento nunca é apagado e precisa continuar dentro da gestão: fora dela ele não pode mais
   * ser corrigido, porque a data é revalidada contra o período. Por isso o período só encolhe até
   * o primeiro e o último lançamento, estornados inclusive.
   */
  if (input.managementStart !== undefined || input.managementEnd !== undefined) {
    const outside = await organizationRepository.countTransactionsOutsidePeriod(
      organizationId,
      managementStart,
      managementEnd,
    );

    if (outside > 0) {
      throw new AppError(409, TRANSACTIONS_OUTSIDE_PERIOD);
    }
  }

  const data: UpdateOrganizationData = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.managementStart !== undefined) {
    data.managementStart = managementStart;
  }

  if (input.managementEnd !== undefined) {
    data.managementEnd = managementEnd;
  }

  const updated = await organizationRepository.updateById(organizationId, data);

  return formatOrganization(updated);
}
