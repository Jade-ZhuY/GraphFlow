let accessToken: string | null = null;

export function getAuthAccessToken(): string | null {
  return accessToken;
}

export function setAuthAccessToken(token: string): void {
  accessToken = token;
}

export function clearAuthAccessToken(): void {
  accessToken = null;
}
