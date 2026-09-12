import { z } from "zod";
export const GoalSchema = z.enum([
  "hair",
  "skin",
  "facial-hair",
  "presentation",
]);
export type Goal = z.infer<typeof GoalSchema>;
export const ProfileSchema = z
  .object({
    version: z.literal(1),
    adultConfirmed: z.literal(true),
    goals: z
      .array(GoalSchema)
      .min(1)
      .max(4)
      .refine((a) => new Set(a).size === a.length),
    dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]),
    budget: z.enum(["minimal", "moderate", "flexible"]),
    experience: z.enum(["starting", "established"]),
  })
  .strict();
export type Profile = z.infer<typeof ProfileSchema>;
export const PhotoMetricsSchema = z
  .object({
    version: z.literal(1),
    outlineHeightToWidth: z.number().finite().positive(),
    eyeSpacingToWidth: z.number().finite().positive(),
    rollDegrees: z.number().finite().min(-90).max(90),
    meanLuminance: z.number().finite().min(0).max(255),
  })
  .strict();
export type PhotoMetrics = z.infer<typeof PhotoMetricsSchema>;
export const QualityIssueSchema = z.enum([
  "small-face",
  "cropped-face",
  "tilted-photo",
  "dark-photo",
  "bright-photo",
]);
export type QualityIssue = z.infer<typeof QualityIssueSchema>;
export const AnalysisMetadataSchema = z
  .object({
    profile: ProfileSchema,
    metrics: PhotoMetricsSchema,
    warnings: z.array(QualityIssueSchema).max(5),
    consent: z
      .object({
        version: z.literal(2),
        provider: z.literal("gemini"),
        remoteAnalysis: z.literal(true),
        adultOwnPhoto: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type AnalysisMetadata = z.infer<typeof AnalysisMetadataSchema>;
const text = z.string().max(1000);
export const AdviceProviderSchema = z
  .object({
    status: z.enum(["ok", "retake"]),
    retakeReason: text.nullable(),
    summary: z.string().max(1500),
    observations: z
      .array(
        z
          .object({ category: GoalSchema, observation: text, suggestion: text })
          .strict(),
      )
      .max(8),
    routine: z
      .array(
        z
          .object({
            title: text,
            instruction: text,
            category: GoalSchema,
            frequency: z.enum(["daily", "weekly", "once"]),
            minutes: z.number().int().min(1).max(30),
          })
          .strict(),
      )
      .max(8),
    limitations: z.array(text).max(6),
  })
  .strict();
export const AdviceSchema = AdviceProviderSchema.superRefine((a, c) => {
  if (
    a.status === "ok"
      ? !a.summary.trim() ||
        !a.observations.length ||
        !a.routine.length ||
        a.retakeReason !== null
      : !a.retakeReason?.trim() ||
        a.observations.length > 0 ||
        a.routine.length > 0
  )
    c.addIssue({ code: "custom", message: "Inconsistent advice status" });
});
export type Advice = z.infer<typeof AdviceSchema>;
export const ScanSchema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    profile: ProfileSchema,
    metrics: PhotoMetricsSchema,
    warnings: z.array(QualityIssueSchema).max(5),
    advice: AdviceSchema.refine((a) => a.status === "ok"),
    model: z.string().max(200),
  })
  .strict();
export type Scan = z.infer<typeof ScanSchema>;
export const ErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "IMAGE_TOO_LARGE",
  "INVALID_IMAGE",
  "CONSENT_REQUIRED",
  "AI_NOT_CONFIGURED",
  "LIMIT_REACHED",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_INVALID_RESPONSE",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ApiError = { error: { code: ErrorCode; message: string } };
