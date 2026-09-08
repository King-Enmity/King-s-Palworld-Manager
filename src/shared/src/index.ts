import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  product: z.string(),
  version: z.string(),
  timestamp: z.string()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
