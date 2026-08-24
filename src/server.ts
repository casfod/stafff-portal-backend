import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { connectDB } from "./config/database";
import { errorHandler } from "./middleware/error.middleware";
import { AppError } from "./utils/AppError";
import routes from "./routes";

export function createApp(): Express {
  const app = express();

  // Security
  app.use(helmet());

  // CORS configuration
  const corsOptions = {
    origin: function (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) {
      if (!origin) return callback(null, true);

      if (env.NODE_ENV === "development") {
        return callback(null, true);
      }

      if (env.CORS_ORIGIN.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    message: "Too many requests from this IP, please try again later.",
  });
  app.use("/api/v1", limiter);

  // Body parsing
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  // Compression
  app.use(compression());

  // Logging
  if (env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  } else {
    app.use(morgan("combined"));
  }

  // Health check
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API routes
  app.use("/api/v1", routes);

  // 404 handler
  app.all("*", (req, _res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}

const app = createApp();

export async function startServer() {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    console.log(`🌐 CORS enabled for origins:`, env.CORS_ORIGIN);
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
}

export default app;
