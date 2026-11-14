/** Fehler mit Code für die Oberfläche (Texte stehen in der Übersetzung unter errors.<code>). */

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export class AppError extends Error {
  override readonly name = 'AppError';
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export const badRequest = (code: string): AppError => new AppError(HTTP_BAD_REQUEST, code);
export const unauthorized = (code = 'unauthorized'): AppError => new AppError(HTTP_UNAUTHORIZED, code);
export const forbidden = (code = 'forbidden'): AppError => new AppError(HTTP_FORBIDDEN, code);
export const notFound = (code = 'not_found'): AppError => new AppError(HTTP_NOT_FOUND, code);
export const conflict = (code: string): AppError => new AppError(HTTP_CONFLICT, code);
