const { promisify } = require("util");

const jwt = require("jsonwebtoken");
const { getStationByIdService } = require("../services/stationService");
const handleResponse = require("./handleResponse");

const stationByToken = async (req, res) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return handleResponse(res, 401, "Invalid Token");
  }

  // 2) Verifying the token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    return handleResponse(res, 401, "Token verification failed");
  }

  // 3) Checking if the station still exists

  const currentStation = await getStationByIdService(decoded.id);

  if (!currentStation) {
    return handleResponse(res, 401, "station no longer exists");
  }

  return currentStation;
};

module.exports = stationByToken;
