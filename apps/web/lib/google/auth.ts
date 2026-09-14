import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/google/callback`,
  );
}

export function getAuthUrl(state: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/adwords"],
    state,
  });
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("No refresh token received. Re-authorize with prompt=consent.");
  }

  return {
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token,
  };
}
