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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("insight_token");
    const u = localStorage.getItem("insight_user");

    if (!t) {
      router.replace("/login");
      return;
    }

    setToken(t);
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        // ignore parse error
      }
    }
    setLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem("insight_token");
    localStorage.removeItem("insight_user");
    router.push("/login");
  };

  return { user, token, loading, logout };
}
