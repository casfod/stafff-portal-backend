const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db.js");
const userRouter = require("./routes/UserRoutes.js");
const projectRoutes = require("./routes/projectRoutes.js");
const purchaseRequestRoutes = require("./routes/purchaseRequestRoutes.js");
const advanceRequestRoutes = require("./routes/advanceRequestRoutes.js");
const travelRequestRoutes = require("./routes/travelRequestRoutes.js");
const expenseClaimRoutes = require("./routes/expenseClaimRoutes.js");
const paymentRequestRoutes = require("./routes/paymentRequestRoutes.js");
const conceptNoteRoutes = require("./routes/conceptNoteRoutes.js");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const swaggerDocument = require("../swagger.json");
const swaggerUi = require("swagger-ui-express");
const globalErrorHandler = require("./controllers/errorController");
const AppError = require("./utils/appError.js");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

// Limit requests from same API (bruteforce and denial of service attacks protection)
const limiter = rateLimit({
  max: 5000,
  windowMs: 0.5 * 0.5 * 1000,
  message: "Too many requests from this IP, please try again in an hour!",
});
// app.use("/api", limiter);

// Swagger Documentation
app.use("/casfod/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use("/api/v1/casfod/users", userRouter);
app.use("/api/v1/casfod/projects", projectRoutes);
app.use("/api/v1/casfod/purchase-requests", purchaseRequestRoutes);
app.use("/api/v1/casfod/advance-requests", advanceRequestRoutes);
app.use("/api/v1/casfod/travel-requests", travelRequestRoutes);
app.use("/api/v1/casfod/expense-claims", expenseClaimRoutes);
app.use("/api/v1/casfod/payment-requests", paymentRequestRoutes);
app.use("/api/v1/casfod/concept-notes", conceptNoteRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation available at https://..../api-docs`);
});

// Handle undefined routes
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Error Handling Middleware
app.use(globalErrorHandler);
