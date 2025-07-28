const AppError = require("./../utils/appError");

// Handle invalid Mongo ObjectId error (e.g. findById with bad ID)
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

// Handle duplicate fields error (e.g. unique email)
const handleDuplicateFieldsDB = (err) => {
  const keyValue = err.errorResponse?.keyValue || err.keyValue;
  const key = keyValue ? Object.keys(keyValue)[0] : "field";
  const message = `This ${key} already exists`;
  return new AppError(message, 400);
};

// Handle validation errors (e.g. missing required fields)
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

// Handle invalid JWT
const handleJWTError = () =>
  new AppError("Invalid token. Please log in again!", 401);

// Handle expired JWT
const handleJWTExpiredError = () =>
  new AppError("Your token has expired! Please log in again.", 401);

// Development error output
const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith("/api")) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  console.error("ERROR 💥", err);

  return res.status(err.statusCode).render("error", {
    title: "Something went wrong!",
    msg: err.message,
  });
};

// Production error output
const sendErrorProd = (err, req, res) => {
  const showFullError = process.env.SHOW_FULL_ERRORS === "true";

  if (req.originalUrl.startsWith("/api")) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }

    console.error("ERROR 💥💥", err);

    if (showFullError) {
      return res.status(err.statusCode || 500).json({
        status: "error",
        message: err.message,
        error: err,
        stack: err.stack,
        name: err.name,
        code: err.code,
        value: err.value,
        path: err.path,
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Something went wrong.",
    });
  }

  if (err.isOperational) {
    return res.status(err.statusCode).render("error", {
      title: "Something went wrong!",
      msg: err.message,
    });
  }

  console.error("ERROR 💥💥💥", err);

  return res.status(err.statusCode || 500).render("error", {
    title: "Something went wrong!",
    msg: showFullError ? err.message : "Please try again later.",
  });
};

// Main export
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV.trim() === "production") {
    let error = Object.create(err);
    error.message = err.message;

    if (error.name === "CastError") error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
