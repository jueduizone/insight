import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export interface AuthUser {
  ID: number;
  email: string;
  username: string;
  avatar: string;
  role: string;
  permissions: string[];
}

export function useAuth() {
  const router = useRouter();
  const [token] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem("insight_token");
  });
  const [user] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const u = localStorage.getItem("insight_user");
    if (!u) {
      return null;
    }
    try {
      return JSON.parse(u);
    } catch {
      return null;
    }
  });
  const loading = false;

  useEffect(() => {
    const t = localStorage.getItem("insight_token");

    if (!t) {
      router.replace("/login");
    }
  }, [router]);

  const logout = () => {
    localStorage.removeItem("insight_token");
    localStorage.removeItem("insight_user");
    router.push("/login");
  };

  return { user, token, loading, logout };
}
