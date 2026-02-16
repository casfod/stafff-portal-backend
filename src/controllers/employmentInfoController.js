const EmploymentInfoService = require("../services/employmentInfoService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

// SUPER-ADMIN: Update any user's employment info
const superAdminUpdateEmploymentInfo = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { userId } = req.params;

  if (!userId) {
    return handleResponse(res, 400, "User ID is required");
  }

  const updatedUser =
    await EmploymentInfoService.superAdminUpdateEmploymentInfo(
      currentUser.id,
      userId,
      req.body
    );

  handleResponse(
    res,
    200,
    "Employment information updated successfully by super admin",
    {
      userId: userId,
      isProfileComplete: updatedUser.employmentInfo?.isProfileComplete,
      isLocked: updatedUser.employmentInfo?.isEmploymentInfoLocked,
    }
  );
});

// SUPER-ADMIN: Get any user's employment info
const superAdminGetEmploymentInfo = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return handleResponse(res, 400, "User ID is required");
  }

  const userInfo = await EmploymentInfoService.getUserEmploymentInfo(userId);

  handleResponse(
    res,
    200,
    "Employment information fetched successfully",
    userInfo
  );
});

// Regular user: Update own employment info
const updateEmploymentInfo = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const updatedUser = await EmploymentInfoService.updateEmploymentInfo(
    currentUser.id,
    req.body
  );

  handleResponse(res, 200, "Employment information updated successfully", {
    isProfileComplete: updatedUser.employmentInfo?.isProfileComplete,
    canUpdate: !updatedUser.employmentInfo?.isEmploymentInfoLocked,
    isLocked: updatedUser.employmentInfo?.isEmploymentInfoLocked,
  });
});

// Regular user: Get own employment info
const getEmploymentInfo = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const userInfo = await EmploymentInfoService.getUserEmploymentInfo(
    currentUser.id
  );

  handleResponse(
    res,
    200,
    "Employment information fetched successfully",
    userInfo
  );
});

// Admin: Toggle global employment info lock
const toggleGlobalEmploymentInfoLock = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const settings = await EmploymentInfoService.toggleGlobalLock(
    currentUser.id,
    req.body.locked
  );

  handleResponse(
    res,
    200,
    `Employment information updates ${
      req.body.locked ? "locked" : "unlocked"
    } globally`,
    { globalEmploymentInfoLock: settings.globalEmploymentInfoLock }
  );
});

// Admin: Toggle user-specific employment info lock
const toggleUserEmploymentInfoLock = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const user = await EmploymentInfoService.toggleUserLock(
    currentUser.id,
    req.params.userId,
    req.body.locked
  );

  handleResponse(
    res,
    200,
    `Employment information ${
      req.body.locked ? "locked" : "unlocked"
    } for user`,
    { isLocked: user.employmentInfo?.isEmploymentInfoLocked }
  );
});

// Admin: Get all users' employment info status
const getAllEmploymentInfoStatus = catchAsync(async (req, res) => {
  const users = await EmploymentInfoService.getAllEmploymentInfoStatus();

  handleResponse(
    res,
    200,
    "Employment info status fetched successfully",
    users
  );
});

// Get global settings
const getGlobalSettings = catchAsync(async (req, res) => {
  const settings = await EmploymentInfoService.getGlobalSettings();

  handleResponse(res, 200, "Global settings fetched successfully", settings);
});

module.exports = {
  updateEmploymentInfo,
  getEmploymentInfo,
  toggleGlobalEmploymentInfoLock,
  toggleUserEmploymentInfoLock,
  getAllEmploymentInfoStatus,
  getGlobalSettings,
  superAdminUpdateEmploymentInfo,
  superAdminGetEmploymentInfo,
};
