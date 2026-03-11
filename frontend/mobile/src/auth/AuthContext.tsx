import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { tokenStore } from './tokenStore';
import { apiClient } from '../api/client';

interface AuthContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  setLoggedIn: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  isReady: false,
  isLoggedIn: false,
  setLoggedIn: () => {},
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

  return (
    <AuthContext.Provider value={{ isReady, isLoggedIn, setLoggedIn: setIsLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
