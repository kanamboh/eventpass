import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { LikesProvider } from './context/LikesContext';
import ProtectedRoute from './components/ProtectedRoute';
import RootLayout from './layouts/RootLayout';

import HomePage from './pages/HomePage';
import EventsPage from './pages/EventsPage';
import EventDetailsPage from './pages/EventDetailsPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import MyTicketsPage from './pages/MyTicketsPage';
import MyOrdersPage from './pages/MyOrdersPage';
import TicketDetailsPage from './pages/TicketDetailsPage';
import AdminEventsPage from './pages/admin/AdminEventsPage';
import AdminEventCreatePage from './pages/admin/AdminEventCreatePage';
import AdminEventEditPage from './pages/admin/AdminEventEditPage';
import AdminPromoCodesPage from './pages/admin/AdminPromoCodesPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <LikesProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<RootLayout />}>
                <Route index element={<HomePage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="events/:id" element={<EventDetailsPage />} />
                <Route path="cart" element={<CartPage />} />
                <Route 
                  path="checkout" 
                  element={
                    <ProtectedRoute>
                      <CheckoutPage />
                    </ProtectedRoute>
                  } 
                />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="verify-email" element={<VerifyEmailPage />} />
                <Route 
                  path="my-tickets" 
                  element={
                    <ProtectedRoute>
                      <MyTicketsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="my-tickets/:ticketId" 
                  element={
                    <ProtectedRoute>
                      <TicketDetailsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="my-orders" 
                  element={
                    <ProtectedRoute>
                      <MyOrdersPage />
                    </ProtectedRoute>
                  } 
                />
                {/* Admin Operational Management Routes (ADMIN and SUPER_ADMIN) */}
                <Route 
                  path="admin" 
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                      <AdminEventsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="admin/events" 
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                      <AdminEventsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="admin/events/new" 
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                      <AdminEventCreatePage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="admin/events/:id/edit" 
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                      <AdminEventEditPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="admin/promocodes" 
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                      <AdminPromoCodesPage />
                    </ProtectedRoute>
                  } 
                />
                {/* Super Admin Owner Management Route (SUPER_ADMIN only) */}
                <Route 
                  path="admin/users" 
                  element={
                    <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                      <AdminUsersPage />
                    </ProtectedRoute>
                  } 
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </LikesProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
