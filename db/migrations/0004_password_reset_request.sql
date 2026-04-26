-- 0004_password_reset_request.sql
-- ---------------------------------------------------------------------
-- Adds a "user requested a password reset" timestamp on `users`. The
-- self-serve /forgot-password screen flips this on so the PM team page
-- can show a queue of pending requests; the field is cleared the moment
-- a new password is issued.
-- ---------------------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_reset_requested_at" timestamp with time zone;
