/**
 * Parameter Validation Middleware
 *
 * Validates route params (UUIDs) and throws through the central errorHandler.
 * Unlike middleware/validation.ts:validateUUID which sends inline responses,
 * this version throws ValidationError for consistent error handling.
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errorHandler';
import { isValidUUID } from '../utils/validation';

/**
 * Middleware that validates one or more route params as UUIDs.
 * Throws ValidationError (400) for invalid UUIDs — caught by asyncHandler/errorHandler.
 *
 * @example
 * router.get('/:id', requireUUID('id'), asyncHandler(async (req, res) => { ... }));
 * router.delete('/:id/deps/:depId', requireUUID('id', 'depId'), asyncHandler(...));
 */
export function requireUUID(...paramNames: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value !== undefined && !isValidUUID(value)) {
        throw new ValidationError(
          `Invalid ${name}`,
          { [name]: 'must be a valid UUID' }
        );
      }
    }
    next();
  };
}
