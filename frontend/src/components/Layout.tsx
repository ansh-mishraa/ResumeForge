import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, loading } = useAuth();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';

  return (
    <div className={`shell${isAuthPage ? ' auth-shell' : ''}`}>
      <header className="topbar">
        <Link to={user ? '/' : '/login'} className="brand">
          <span className="brand-mark">RF</span>
          <span className="brand-name">ResumeForge</span>
        </Link>
        <div className="topbar-right">
          {!loading && user ? (
            <>
              <Link to="/history" className="topbar-link">
                Sessions
              </Link>
              <span className="topbar-note">{user.email}</span>
              <button type="button" className="btn btn-ghost" onClick={() => logout()}>
                Sign out
              </button>
            </>
          ) : (
            !isAuthPage && (
              <p className="topbar-note">ATS-first · LaTeX · private accounts</p>
            )
          )}
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
