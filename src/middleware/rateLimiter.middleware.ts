import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";
import { env } from "../config/env";

const redisClient = new Redis(env.REDIS_URL);

export const authLimiter = rateLimit({
  store: new RedisStore({
    // @ts-ignore - Type issue with rate-limit-redis
    client: redisClient,
    prefix: "rl:auth:",
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 requests per windowMs (use 'limit' instead of 'max' for newer versions)
  message: "Too many authentication attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  store: new RedisStore({
    // @ts-ignore - Type issue with rate-limit-redis
    client: redisClient,
    prefix: "rl:api:",
  }),
  windowMs: 60 * 1000, // 1 minute
  limit: 100, // 100 requests per minute (use 'limit' instead of 'max')
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});
