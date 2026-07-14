/** True when Next.js can mount ClerkProvider (publishable key present). */
export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}
