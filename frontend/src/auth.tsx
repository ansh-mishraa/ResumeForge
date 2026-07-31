import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apiErrorMessage,
  getMe,
  getStoredToken,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
} from './api';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await apiRegister(email, password, name);
      setUser(res.user);
    },
    []
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { apiErrorMessage };
