const { AppError } = require('./errorHandler');

const notFound = (req, res, next) => {
  const error = new AppError(
    `Cannot find ${req.originalUrl} on this server`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

module.exports = { notFound };
