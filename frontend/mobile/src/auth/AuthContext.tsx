import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { tokenStore } from './tokenStore';

interface AuthContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  setLoggedIn: (v: boolean) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isReady: false,
  isLoggedIn: false,
  setLoggedIn: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    tokenStore.getAccessToken().then((token) => {
      setIsLoggedIn(!!token);
      setIsReady(true);
    });
  }, []);

  const logout = async () => {
    await tokenStore.clearTokens();
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isReady, isLoggedIn, setLoggedIn: setIsLoggedIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
