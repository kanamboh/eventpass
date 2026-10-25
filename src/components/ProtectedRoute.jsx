import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requireRole = null, allowedRoles = null }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7fbd52]"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const effectiveRoles = allowedRoles || (requireRole ? (Array.isArray(requireRole) ? requireRole : [requireRole]) : null);

  if (effectiveRoles && !effectiveRoles.includes(user?.role)) {
    // If an ADMIN tries to access a SUPER_ADMIN route, redirect them to /admin
    if (user?.role === 'ADMIN') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
