import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Spinner } from './components/ui/misc';
import { AuthProvider } from './contexts/AuthContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { RequireRole } from './routes/RequireRole';

const L = {
  Landing: lazy(() => import('./pages/public/Landing')),
  Login: lazy(() => import('./pages/public/Login')),
  Register: lazy(() => import('./pages/public/Register')),
  Forgot: lazy(() => import('./pages/public/ForgotPassword')),
  Verify: lazy(() => import('./pages/public/VerifyEmail')),
  NotFound: lazy(() => import('./pages/errors/NotFound')),
  Unauthorized: lazy(() => import('./pages/errors/Unauthorized')),
  PDash: lazy(() => import('./pages/patient/Dashboard')),
  PBook: lazy(() => import('./pages/patient/BookAmbulance')),
  PBookings: lazy(() => import('./pages/patient/MyBookings')),
  PTrack: lazy(() => import('./pages/patient/TrackAmbulance')),
  PProfile: lazy(() => import('./pages/patient/Profile')),
  DDash: lazy(() => import('./pages/driver/Dashboard')),
  DReq: lazy(() => import('./pages/driver/Requests')),
  DActive: lazy(() => import('./pages/driver/ActiveTrip')),
  DHist: lazy(() => import('./pages/driver/TripHistory')),
  DProfile: lazy(() => import('./pages/driver/Profile')),
  ADash: lazy(() => import('./pages/admin/Dashboard')),
  AUsers: lazy(() => import('./pages/admin/Users')),
  ADrivers: lazy(() => import('./pages/admin/Drivers')),
  AAmb: lazy(() => import('./pages/admin/Ambulances')),
  ABook: lazy(() => import('./pages/admin/Bookings')),
  ADispatch: lazy(() => import('./pages/admin/Dispatch')),
  ADemand: lazy(() => import('./pages/admin/DemandPositioning')),
  AReports: lazy(() => import('./pages/admin/Reports')),
  ASettings: lazy(() => import('./pages/admin/Settings')),
};

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<Spinner label="Loading page" />}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<L.Landing />} />
                <Route path="/login" element={<L.Login />} />
                <Route path="/register" element={<L.Register />} />
                <Route path="/forgot-password" element={<L.Forgot />} />
                <Route path="/verify-email" element={<L.Verify />} />
                <Route path="/unauthorized" element={<L.Unauthorized />} />
              </Route>

              <Route element={<RequireRole role="patient" />}>
                <Route path="/patient" element={<DashboardLayout role="patient" />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<L.PDash />} />
                  <Route path="book-ambulance" element={<L.PBook />} />
                  <Route path="bookings" element={<L.PBookings />} />
                  <Route path="track-ambulance" element={<L.PTrack />} />
                  <Route path="profile" element={<L.PProfile />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="driver" />}>
                <Route path="/driver" element={<DashboardLayout role="driver" />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<L.DDash />} />
                  <Route path="requests" element={<L.DReq />} />
                  <Route path="active-trip" element={<L.DActive />} />
                  <Route path="trip-history" element={<L.DHist />} />
                  <Route path="profile" element={<L.DProfile />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<DashboardLayout role="admin" />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<L.ADash />} />
                  <Route path="users" element={<L.AUsers />} />
                  <Route path="drivers" element={<L.ADrivers />} />
                  <Route path="ambulances" element={<L.AAmb />} />
                  <Route path="bookings" element={<L.ABook />} />
                  <Route path="dispatch" element={<L.ADispatch />} />
                  <Route path="demand-positioning" element={<L.ADemand />} />
                  <Route path="reports" element={<L.AReports />} />
                  <Route path="settings" element={<L.ASettings />} />
                </Route>
              </Route>

              <Route path="*" element={<L.NotFound />} />
            </Routes>
          </Suspense>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
