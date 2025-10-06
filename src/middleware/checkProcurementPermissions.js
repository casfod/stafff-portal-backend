const AppError = require("../utils/appError");

// Individual permission check functions with proper error handling
const checkViewPermission = (req, res, next) => {
  // Check if User is defined
  if (!req.User) {
    return next(new AppError("Authentication required", 401));
  }

  // SUPER-ADMIN has full access
  if (req.User.role === "SUPER-ADMIN") {
    return next();
  }

  // Check if procurementRole exists and has view permission
  if (!req.User.procurementRole?.canView) {
    return next(new AppError("You do not have permission to view", 403));
  }

  next();
};

const checkCreatePermission = (req, res, next) => {
  // Check if User is defined
  if (!req.User) {
    return next(new AppError("Authentication required", 401));
  }

  // SUPER-ADMIN has full access
  if (req.User.role === "SUPER-ADMIN") {
    return next();
  }

  // Check if procurementRole exists and has create permission
  if (!req.User.procurementRole?.canCreate) {
    return next(new AppError("You do not have permission to create", 403));
  }

  next();
};

const checkUpdatePermission = (req, res, next) => {
  // Check if User is defined
  if (!req.User) {
    return next(new AppError("Authentication required", 401));
  }

  // SUPER-ADMIN has full access
  if (req.User.role === "SUPER-ADMIN") {
    return next();
  }

  // Check if procurementRole exists and has update permission
  if (!req.User.procurementRole?.canUpdate) {
    return next(new AppError("You do not have permission to update", 403));
  }

  next();
};

const checkDeletePermission = (req, res, next) => {
  // Check if User is defined
  if (!req.User) {
    return next(new AppError("Authentication required", 401));
  }

  // SUPER-ADMIN has full access
  if (req.User.role === "SUPER-ADMIN") {
    return next();
  }

  // Check if procurementRole exists and has delete permission
  if (!req.User.procurementRole?.canDelete) {
    return next(new AppError("You do not have permission to delete", 403));
  }

  next();
};

module.exports = {
  checkViewPermission,
  checkCreatePermission,
  checkUpdatePermission,
  checkDeletePermission,
};
