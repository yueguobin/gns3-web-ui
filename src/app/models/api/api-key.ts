export interface ApiKey {
  api_key_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export interface ApiKeyCreatedResponse {
  api_key_id: string;
  api_key: string;
  name: string;
  key_prefix: string;
  created_at: string;
}

export interface ApiKeyActionResponse {
  message: string;
}
