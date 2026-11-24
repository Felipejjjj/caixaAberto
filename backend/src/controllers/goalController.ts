import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { getContexto } from '../middlewares/load-context.js';
import * as goalService from '../services/goalService.js';

const listGoalsQuerySchema = z.object({}).strict();

export async function listGoals(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    listGoalsQuerySchema.parse(request.query);
    const result = await goalService.listGoals(getContexto(request).organizacaoId);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
