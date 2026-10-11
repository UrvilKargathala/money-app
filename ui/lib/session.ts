import { cookies } from "next/headers";

export const SESSION_COOKIE = "mm_session";

export async function setSessionCookie(token: string, maxAge: number) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}
