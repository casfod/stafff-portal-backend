const catchAsync = require("../utils/catchAsync");
const authService = require("../services/authService");
const createSendToken = require("../middleware/createSendToken");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/UserByToken");

const signup = catchAsync(async (req, res, next) => {
  const newUser = await authService.signupUserService({
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    // protocol: req.protocol,
    // host: req.get("host"),
  });

  createSendToken(newUser, 201, res);
});

const login = catchAsync(async (req, res, next) => {
  const user = await authService.loginUserService(
    req.body.email,
    req.body.password
  );
  createSendToken(user, 200, res);
});

// Logout user
const logout = (req, res) => {
  console.log("out");
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(Date.now() + 10 * 1000),
  });
  handleResponse(res, 200, "Logged out successfully");
};

const forgotPassword = catchAsync(async (req, res, next) => {
  await authService.forgotPasswordService(
    req.body.email,
    req.protocol,
    req.get("host")
  );
  res.status(200).json({
    status: "success",
    message: "Token sent to email!",
  });
});

const resetPassword = catchAsync(async (req, res, next) => {
  const user = await authService.resetPasswordService(
    req.params.token,
    req.body.password,
    req.body.passwordConfirm
  );
  createSendToken(user, 200, res);
});

const updatePassword = catchAsync(async (req, res, next) => {
  const currentUser = await userByToken(req, res);

  const user = await authService.updatePasswordService(
    currentUser.id,
    req.body.passwordCurrent,
    req.body.password,
    req.body.passwordConfirm
  );

  createSendToken(user, 200, res);
});

module.exports = {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
};
