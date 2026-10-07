import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Particles from "./components/ParticleBackground/Particles";
import CheckInPage from "./pages/CheckInPage";
import LoginPage from "./pages/LoginPage";
import CustomerDashboard from "./pages/CustomerDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import "./styles/variables.css";
import "./App.css";

/**
 * RootRoute — renders customer check-in for unauthenticated visitors,
 * or routes authenticated users directly to their active role dashboard.
 */
function RootRoute() {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <CheckInPage />;
    const isStaff = user.role === "STAFF" || user.role === "ADMIN";
    return <Navigate to={isStaff ? "/staff" : "/dashboard"} replace />;
}

/**
 * AppShell — atmospheric particle background sits behind auth & customer waiting views
 */
function AppShell() {
    const { user } = useAuth();
    const isStaff = user?.role === "STAFF" || user?.role === "ADMIN";

    return (
        <div className="app-shell">
            {/* Atmospheric background — only for auth/customer views */}
            {!isStaff && (
                <Particles
                    particleCount={85}
                    particleSpread={20}
                    speed={0.02}
                    particleColors={["#ffffff", "#f1f5f9", "#e2e8f0", "#94a3b8"]}
                    particleBaseSize={2.0}
                    alphaParticles={true}
                    moveParticlesOnHover={true}
                    particleHoverFactor={0.15}
                />
            )}

            <Routes>
                {/* Root customer waiting room check-in */}
                <Route path="/" element={<RootRoute />} />
                <Route path="/check-in" element={<CheckInPage />} />
                <Route path="/register" element={<Navigate to="/" replace />} />

                {/* Staff / Admin sign in */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/staff/login" element={<LoginPage />} />

                {/* Customer dashboard */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute roles={["CUSTOMER", "USER"]}>
                            <CustomerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route path="/customer" element={<Navigate to="/dashboard" replace />} />

                {/* Staff / Admin operational dashboard */}
                <Route
                    path="/staff"
                    element={
                        <ProtectedRoute roles={["STAFF", "ADMIN"]}>
                            <StaffDashboard />
                        </ProtectedRoute>
                    }
                />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <SocketProvider>
                    <AppShell />
                </SocketProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
