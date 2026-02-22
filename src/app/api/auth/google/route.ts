import { NextResponse } from "next/server";

export async function GET() {
    // TODO: Implement Google OAuth redirect
    // This will redirect to Google's OAuth consent page
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;
    const scope = "email profile";

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

    return NextResponse.redirect(url);
}
