import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import mongoose from 'mongoose';

const handleCastError = (err: mongoose.Error.CastError) =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateFields = (err: any) => {
  const value = Object.keys(err.keyValue).join(', ');
  return new AppError(`Duplicate field value: ${value}. Please use another value.`, 400);
};

const handleValidationError = (err: mongoose.Error.ValidationError) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Your token has expired. Please log in again.', 401);

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  let error = { ...err, message: err.message, stack: err.stack };

  if (err instanceof mongoose.Error.CastError) error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateFields(err);
  if (err instanceof mongoose.Error.ValidationError) error = handleValidationError(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  const statusCode = error.statusCode || 500;
  const status = statusCode >= 500 ? 'error' : 'fail';

  res.status(statusCode).json({
    status,
    message: error.isOperational ? error.message : 'Something went very wrong!',
    ...(env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};
