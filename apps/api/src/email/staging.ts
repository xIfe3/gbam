import type { SendEmailInput } from "@gbam/integrations";

/**
 * On the staging copy of Gbam (APP_ENV=staging), every email's subject starts with
 * "[Staging]", so a test email is never mistaken for a real one.
 */
export function markStaging(message: SendEmailInput): SendEmailInput {
  if (process.env.APP_ENV !== "staging") {
    return message;
  }
  return { ...message, subject: `[Staging] ${message.subject}` };
}
