import { NextFunction, Request, Response } from 'express'

export function validateJsonSchema(_schema: unknown) {
  return (_req: Request, _res: Response, next: NextFunction) => next()
}
