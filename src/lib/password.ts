export async function hashPassword(password: string, email: string): Promise<string> {
  const data = new TextEncoder().encode(`${email.trim().toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(
  password: string,
  email: string,
  passwordHash: string | undefined
): Promise<boolean> {
  if (!passwordHash) return false;
  const h = await hashPassword(password, email);
  return h === passwordHash;
}
