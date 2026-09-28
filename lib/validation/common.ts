import { z } from "zod";

/**
 * A Postgres `uuid`, validated the way Postgres itself validates it.
 *
 * Deliberately NOT `z.uuid()`. Zod 4's `z.uuid()` enforces the RFC 4122
 * version and variant bits (`[1-8]` and `[89ab]` in the third and fourth
 * groups), but the Postgres `uuid` type accepts ANY 128-bit value -- and this
 * application is full of them: every seeded staff account uses an id like
 * `00000000-0000-0000-0000-0000000000a1`, which is a perfectly valid column
 * value and not a valid RFC 4122 UUID.
 *
 * Validating more strictly than the database rejects real, already-stored
 * rows. It shipped that way once and made the whole practitioner list
 * unpublishable with "Invalid UUID" -- which then read as "Online booking
 * isn't set up yet" on the public page, because no practitioner could be
 * switched on. Every other schema in lib/validation/ uses a plain
 * `z.string().min(1)` for ids for the same reason; this keeps the shape check
 * while matching what the column actually stores.
 */
export const uuidLike = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid id",
  );
