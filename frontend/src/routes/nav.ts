import { Activity, BarChart3, Bell, CalendarClock, ClipboardList, Gauge, History, LayoutDashboard, MapPin, Navigation, Radar, Settings, Truck, User, Users, type LucideIcon } from 'lucide-react';
import type { UserRole } from '../types';

export interface NavItem { to: string; label: string; icon: LucideIcon }

/** Centralised route/navigation map per role. */
export const NAV: Record<UserRole, NavItem[]> = {
  patient: [
    { to: '/patient/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/patient/book-ambulance', label: 'Book Ambulance', icon: Truck },
    { to: '/patient/bookings', label: 'My Bookings', icon: ClipboardList },
    { to: '/patient/track-ambulance', label: 'Track Ambulance', icon: Navigation },
    { to: '/patient/profile', label: 'Profile', icon: User },
  ],
  driver: [
    { to: '/driver/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/driver/requests', label: 'Assigned Requests', icon: Bell },
    { to: '/driver/active-trip', label: 'Active Trip', icon: Navigation },
    { to: '/driver/trip-history', label: 'Trip History', icon: History },
    { to: '/driver/profile', label: 'Profile', icon: User },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/drivers', label: 'Drivers', icon: Activity },
    { to: '/admin/ambulances', label: 'Ambulances', icon: Truck },
    { to: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
    { to: '/admin/dispatch', label: 'Dispatch Monitoring', icon: Radar },
    { to: '/admin/demand-positioning', label: 'Demand Positioning', icon: MapPin },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
};
export const ROLE_LABEL: Record<UserRole, string> = { patient: 'Patient', driver: 'Ambulance Driver', admin: 'Administrator' };
export { Gauge, CalendarClock };
