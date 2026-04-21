export class AppError extends Error {
  readonly code: string;

  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const notFound = (code: string, message: string): AppError =>
  new AppError(code, message, 404);

export const badRequest = (code: string, message: string): AppError =>
  new AppError(code, message, 400);

export const unauthorized = (code: string, message: string): AppError =>
  new AppError(code, message, 401);

export const forbidden = (code: string, message: string): AppError =>
  new AppError(code, message, 403);

export const conflict = (code: string, message: string): AppError =>
  new AppError(code, message, 409);
