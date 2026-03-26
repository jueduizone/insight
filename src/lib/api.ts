const API_BASE = "http://localhost:8080";

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("insight_token")
      : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Allow caller to override headers
  if (options?.headers) {
    const incoming = options.headers as Record<string, string>;
    Object.assign(headers, incoming);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("insight_token");
      localStorage.removeItem("insight_user");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  const data = await response.json();
  return data as ApiResponse<T>;
}
