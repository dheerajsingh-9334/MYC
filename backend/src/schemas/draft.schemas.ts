import { z } from 'zod';

// Per-kind draft payload schemas. Keep these loose — the only invariant
// we enforce at the API edge is that the payload is an object with a
// `schemaVersion` field. The hook on the frontend owns the shape.

// Generic object schema with a schemaVersion. Allows arbitrary fields.
const objectWithVersion = z.object({
  schemaVersion: z.number().int().min(1),
}).passthrough();

// Top-level draft write body
export const draftWriteSchema = z.object({
  kind: z.enum([
    'onboard_application',
    'application_review_note',
    'add_client',
    'add_task',
    'send_invite',
    'move_client_step',
    'raise_blocker',
    'request_extension',
  ]),
  contextId: z.string().min(1).max(200),
  data: objectWithVersion,
  revision: z.number().int().min(0).optional().default(0),
});

export type DraftWriteBody = z.infer<typeof draftWriteSchema>;

// Per-kind expiry windows (ms). Used by the route to set `expiresAt`.
export const DRAFT_TTL_MS: Record<DraftWriteBody['kind'], number> = {
  onboard_application: 7 * 24 * 60 * 60 * 1000, // 7 days
  application_review_note: 24 * 60 * 60 * 1000, // 24 hours
  add_client: 60 * 60 * 1000,                   // 1 hour
  add_task: 60 * 60 * 1000,                     // 1 hour
  send_invite: 60 * 60 * 1000,                  // 1 hour
  move_client_step: 60 * 60 * 1000,             // 1 hour
  raise_blocker: 24 * 60 * 60 * 1000,           // 24 hours
  request_extension: 24 * 60 * 60 * 1000,       // 24 hours
};

// Max body size for the data payload (bytes, after JSON.stringify).
// Enforced at the route via Content-Length / raw length check.
export const MAX_DRAFT_DATA_BYTES = 64 * 1024; // 64 KB
