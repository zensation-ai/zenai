import type { InjectionScreeningData } from '../../middleware/input-screening';

declare global {
  namespace Express {
    interface Request {
      injectionScreening?: InjectionScreeningData;
    }
  }
}
