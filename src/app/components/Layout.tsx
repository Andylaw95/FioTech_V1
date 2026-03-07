import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import fiotechLogo from '@/assets/fiotech-logo.png';
import fiotechAppLogo from '@/assets/fiotech-applogo.png';
import { 
  Home, 
  Cpu, 
  Bell, 
  Box, 
  Settings, 
  Search, 
  Menu,
  Building2,
  LogOut,
  ChevronDown,
  Droplets,
  Flame,
  Wind,
  Router,
  Layers,
  Sun,
  Moon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useProfile } from '@/app/utils/ProfileContext';
import { useAuth } from '@/app/utils/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';
import { AlarmAlertMonitor } from './AlarmAlertMonitor';
import { useTheme } from '@/app/utils/ThemeContext';
import { ShieldCheck } from 'lucide-react';
import { Toaster } from 'sonner';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [isAlarmsExpanded, setIsAlarmsExpanded] = React.useState(false);
  const { profileName, profileRole, profileAvatar } = useProfile();
  const location = useLocation();
  const { signOut, isAdmin } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();

  // Auto-expand alarms sub-nav when on an alarm sub-page
  const isOnAlarmPage = location.pathname.startsWith('/alarms');
  React.useEffect(() => {
    if (isOnAlarmPage) setIsAlarmsExpanded(true);
  }, [isOnAlarmPage]);

  // Close mobile sidebar on route change
  React.useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const navItems = [
    { icon: Home, label: 'Dashboard', path: '/' },
    { icon: Building2, label: 'Properties', path: '/buildings' },
    { icon: Cpu, label: 'Devices', path: '/devices' },
  ];

  const alarmSubItems = [
    { icon: Droplets, label: 'Water', path: '/alarms/water', color: 'text-blue-500' },
    { icon: Flame, label: 'Fire', path: '/alarms/fire', color: 'text-red-500' },
    { icon: Wind, label: 'Smoke', path: '/alarms/smoke', color: 'text-slate-500' },
  ];

  const monitoringItems = [
    { icon: Router, label: 'Gateways', path: '/gateways' },
  ];

  const visualizationItems = [
    { icon: Layers, label: 'Twin Dashboard', path: '/twin-dashboard' },
    { icon: Box, label: 'Digital Twin', path: '/bim' },
  ];

  const bottomNavItems = [
    ...(isAdmin ? [{ icon: ShieldCheck, label: 'Admin', path: '/admin' }] : []),
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  const getPageTitle = () => {
    if (location.pathname === '/twin-dashboard') return 'Twin Dashboard';
    if (location.pathname === '/gateways') return 'Gateways';
    if (location.pathname === '/alarms/water') return 'Water Alarms';
    if (location.pathname === '/alarms/fire') return 'Fire Alarms';
    if (location.pathname === '/alarms/smoke') return 'Smoke Alarms';
    if (location.pathname === '/alarms') return 'Alarms';
    const all = [...navItems, ...monitoringItems, ...visualizationItems, ...bottomNavItems, { icon: Bell, label: 'Alarms', path: '/alarms' }];
    const current = all.find(item => item.path === location.pathname);
    return current ? current.label : 'FioTec';
  };

  const sidebarContent = (
    <>
      <div className={cn(
        "flex h-14 lg:h-16 shrink-0 items-center justify-center border-b px-4 lg:px-6 transition-colors duration-500",
        isDark ? "border-slate-800" : "border-slate-200"
      )}>
        <div className={cn(
          "flex items-center gap-2 font-semibold text-lg lg:text-xl tracking-tight",
          isDark ? "text-white" : "text-slate-900"
        )}>
          <img
            src={(isSidebarOpen || isMobileSidebarOpen) ? fiotechLogo : fiotechAppLogo}
            alt="FioTec"
            className={cn("object-contain", (isSidebarOpen || isMobileSidebarOpen) ? "h-10" : "h-8")}
          />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 lg:p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                  : isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                !isSidebarOpen && !isMobileSidebarOpen && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {(isSidebarOpen || isMobileSidebarOpen) && <span>{item.label}</span>}
          </NavLink>
        ))}

        {/* Alarms with expandable sub-nav */}
        <div>
          <button
            onClick={() => {
              if (isSidebarOpen || isMobileSidebarOpen) {
                setIsAlarmsExpanded(!isAlarmsExpanded);
              }
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isOnAlarmPage
                ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                : isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              !isSidebarOpen && !isMobileSidebarOpen && "justify-center px-2"
            )}
          >
            <Bell className="h-5 w-5 shrink-0" />
            {(isSidebarOpen || isMobileSidebarOpen) && (
              <>
                <NavLink to="/alarms" className="flex-1 text-left" onClick={(e) => e.stopPropagation()}>
                  Alarms
                </NavLink>
                <ChevronDown className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isAlarmsExpanded && "rotate-180"
                )} />
              </>
            )}
          </button>

          {/* Sub-items */}
          {(isSidebarOpen || isMobileSidebarOpen) && isAlarmsExpanded && (
            <div className={cn(
              "ml-4 mt-0.5 space-y-0.5 border-l-2 pl-4",
              isDark ? "border-slate-700" : "border-slate-100"
            )}>
              {alarmSubItems.map((sub) => (
                <NavLink
                  key={sub.path}
                  to={sub.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? isDark ? "bg-blue-950/30 text-blue-400" : "bg-blue-50/70 text-blue-600"
                        : isDark ? "text-slate-500 hover:bg-slate-800 hover:text-slate-300" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    )
                  }
                >
                  <sub.icon className={cn("h-3.5 w-3.5 shrink-0", sub.color)} />
                  <span>{sub.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {monitoringItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                  : isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                !isSidebarOpen && !isMobileSidebarOpen && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {(isSidebarOpen || isMobileSidebarOpen) && <span>{item.label}</span>}
          </NavLink>
        ))}

        {/* Separator before visualization */}
        {(isSidebarOpen || isMobileSidebarOpen) && (
          <div className={cn("my-2 mx-3 border-t", isDark ? "border-slate-800" : "border-slate-100")} />
        )}

        {visualizationItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                  : isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                !isSidebarOpen && !isMobileSidebarOpen && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {(isSidebarOpen || isMobileSidebarOpen) && <span>{item.label}</span>}
          </NavLink>
        ))}

        {/* Separator before settings */}
        {(isSidebarOpen || isMobileSidebarOpen) && (
          <div className={cn("my-2 mx-3 border-t", isDark ? "border-slate-800" : "border-slate-100")} />
        )}

        {bottomNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                  : isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                !isSidebarOpen && !isMobileSidebarOpen && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {(isSidebarOpen || isMobileSidebarOpen) && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={cn(
        "border-t p-3 lg:p-4 hidden lg:block shrink-0",
        isDark ? "border-slate-800" : "border-slate-100"
      )}>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={cn(
            "flex w-full items-center justify-center rounded-lg p-2",
            isDark ? "text-slate-500 hover:bg-slate-800 hover:text-slate-300" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          )}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </>
  );

  return (
    <div className={cn(
      "flex h-screen font-sans selection:bg-blue-100 selection:text-blue-900 transition-colors duration-500",
      isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
    )}>
      {/* Mobile sidebar overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — mobile: off-canvas, desktop: static */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out",
          isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
          // Mobile: slide in/out
          "lg:static",
          isMobileSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Desktop: collapsible
          isSidebarOpen ? "lg:w-64" : "lg:w-20"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className={cn(
          "flex h-14 lg:h-16 shrink-0 items-center justify-between border-b px-3 sm:px-4 lg:px-8 backdrop-blur-md sticky top-0 z-30 transition-colors duration-500",
          isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white/80"
        )}>
          <div className="flex items-center gap-2 lg:gap-4">
            {/* Mobile hamburger */}
            <button 
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className={cn("rounded-lg p-1.5 lg:hidden", isDark ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100")}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className={cn("text-lg lg:text-xl font-semibold truncate", isDark ? "text-white" : "text-slate-900")}>{getPageTitle()}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:gap-6">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={cn(
                "rounded-full p-2 transition-colors",
                isDark
                  ? "text-amber-400 hover:bg-slate-800"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              )}
              title={isDark ? 'Switch to Day Mode' : 'Switch to Night Mode'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative hidden xl:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className={cn(
                  "h-9 w-48 rounded-full border pl-9 pr-3 text-sm outline-none transition-all",
                  isDark
                    ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                )}
              />
            </div>
            
            <NotificationDropdown />

            <div className="flex items-center gap-2 lg:gap-3">
              {profileAvatar ? (
                <img
                  src={profileAvatar}
                  alt="Profile"
                  className={cn("h-8 w-8 lg:h-9 lg:w-9 rounded-full object-cover ring-2 shadow-sm", isDark ? "ring-slate-700" : "ring-white")}
                />
              ) : (
                <div className={cn("h-8 w-8 lg:h-9 lg:w-9 rounded-full flex items-center justify-center text-sm font-bold ring-2 shadow-sm", isDark ? "ring-slate-700 bg-blue-600 text-white" : "ring-white bg-blue-600 text-white")}>
                  {profileName ? profileName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div className="hidden text-sm lg:block">
                <p className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>{profileName}</p>
                <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-500")}>{profileRole}</p>
              </div>
              <button
                onClick={() => signOut()}
                className={cn(
                  "ml-0.5 lg:ml-1 p-1.5 lg:p-2 rounded-lg transition-colors",
                  isDark ? "text-slate-500 hover:text-red-400 hover:bg-red-950/30" : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                )}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={cn(
          "flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 transition-colors duration-500",
          isDark ? "bg-slate-900" : "bg-slate-50"
        )}>
          <Outlet />
        </main>
      </div>

      {/* Global toast container + real-time alarm monitor */}
      <Toaster position="top-right" richColors />
      <AlarmAlertMonitor />
    </div>
  );
}