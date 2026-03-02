import { google } from "googleapis";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

function decodeServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }
  const json = Buffer.from(raw, "base64").toString("utf-8");
  const parsed = JSON.parse(json) as {
    client_email: string;
    private_key: string;
  };
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key?.replace(/\\n/g, "\n"),
  };
}

export function getGoogleAuthClient() {
  const { client_email, private_key } = decodeServiceAccount();
  return new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: [DRIVE_SCOPE, DOCS_SCOPE],
  });
}

export function getGoogleDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuthClient() });
}

export function getGoogleDocsClient() {
  return google.docs({ version: "v1", auth: getGoogleAuthClient() });
}
