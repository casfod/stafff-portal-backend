import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";
import { runAllSeeders } from "../services/seed.service";

export const connectDB = async (): Promise<void> => {
  try {
    mongoose.set("strictQuery", true);

    const conn = await mongoose.connect(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`📦 MongoDB Connected: ${conn.connection.host}`);

    // Run database seeders after connection
    // await runAllSeeders();

    // Handle connection events
    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected");
    });
  } catch (error) {
    logger.error("❌ MongoDB connection failed:", error);
    process.exit(1);
  }
};