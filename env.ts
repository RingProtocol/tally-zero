/* eslint-disable no-process-env */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_BLAST_RPC_URL: z.string().url().optional(),
    NEXT_PUBLIC_NODE_ENV: z.string().default("development"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID:
      process.env.NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID,
    NEXT_PUBLIC_BLAST_RPC_URL: process.env.NEXT_PUBLIC_BLAST_RPC_URL,
  },
});
