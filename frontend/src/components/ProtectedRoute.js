import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Tenant users live only in /workspace; Goa users never see it.
const ProtectedRoute = ({ children, tenantWorkspace = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (Boolean(user.is_tenant_user) !== tenantWorkspace) {
    return <Navigate to={user.is_tenant_user ? '/workspace' : '/'} replace />;
  }

  return children;
};

export default ProtectedRoute;
