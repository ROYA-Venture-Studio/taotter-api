const logger = require('../utils/logger');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Handle Mongoose validation errors
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(val => val.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

// Handle Mongoose duplicate key errors
const handleDuplicateFieldsError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field} '${value}' already exists. Please use another value.`;
  return new AppError(message, 409, 'DUPLICATE_FIELD');
};

// Handle Mongoose cast errors
const handleCastError = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400, 'INVALID_ID');
};

// Handle JWT errors
const handleJWTError = () => 
  new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN');

const handleJWTExpiredError = () =>
  new AppError('Your token has expired. Please log in again.', 401, 'TOKEN_EXPIRED');

// Send error response in development
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message,
      stack: err.stack
    },
    timestamp: new Date().toISOString()
  });
};

// Send error response in production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'OPERATIONAL_ERROR',
        message: err.message
      },
      timestamp: new Date().toISOString()
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('ERROR:', err);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our end. Please try again later.'
      },
      timestamp: new Date().toISOString()
    });
  }
};

// Global error handling middleware
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error details
  logger.logError(err, `${req.method} ${req.originalUrl}`);

  let error = { ...err };
  error.message = err.message;

  // Handle specific error types
  if (error.name === 'ValidationError') {
    error = handleValidationError(error);
  } else if (error.code === 11000) {
    error = handleDuplicateFieldsError(error);
  } else if (error.name === 'CastError') {
    error = handleCastError(error);
  } else if (error.name === 'JsonWebTokenError') {
    error = handleJWTError();
  } else if (error.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  // Send appropriate error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Validation error handler
const handleValidationErrors = (errors) => {
  const formattedErrors = errors.map(error => ({
    field: error.param || error.path,
    message: error.msg || error.message,
    value: error.value
  }));

  return new AppError(
    'Validation failed',
    422,
    'VALIDATION_FAILED'
  );
};

module.exports = {
  AppError,
  globalErrorHandler,
  catchAsync,
  handleValidationErrors
};
