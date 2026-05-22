import React from 'react';
import { 
  LayoutDashboard, 
  Car, 
  Users, 
  FileText, 
  Ticket, 
  LogOut, 
  Menu, 
  X,
  Plus
} from 'lucide-react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  userProfile: any;
  onLogout: () => void;
}

export default function Layout({ children, user, userProfile, onLogout }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();

  const navigation = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/rentals', label: 'Rentals', icon: FileText },
    { path: '/vehicles', label: 'Vehicles', icon: Car },
    { path: '/tickets', label: 'Ticket Management', icon: Ticket },
    { 
      path: '/users', 
      label: 'Users', 
      icon: Users, 
      show: userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN' 
    },
  ].filter(item => item.show !== false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white border-r border-slate-200 transition-transform lg:relative lg:translate-x-0 shadow-sm",
        !isSidebarOpen && "-translate-x-full lg:flex lg:w-64"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center">
              <img 
                src="https://i.imgur.com/gqfWgMx.png" 
                alt="Philly Car Rental Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-800 leading-tight">Philly Car Rental<br/><span className="text-indigo-600 text-sm">Ticket System</span></span>
          </div>
          <button 
            className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-md"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className={({ isActive }) => cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 transition-colors font-medium",
                isActive 
                  ? "bg-slate-100 text-indigo-600" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}

          <div className="pt-4 mt-6 border-t border-slate-100">
             <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Public Links</p>
             <Link to="/rental-form" className="flex w-full items-center gap-3 rounded-md px-3 py-2 transition-colors font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
               <FileText size={20} />
               <span className="text-sm">Intake Form</span>
             </Link>
             <Link to="/ticket-upload" className="flex w-full items-center gap-3 rounded-md px-3 py-2 transition-colors font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
               <Ticket size={20} />
               <span className="text-sm">Upload Tickets</span>
             </Link>
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-4 px-4 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 border-2 border-white text-slate-600 font-bold relative group">
              {userProfile?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[8px] text-white border border-white">
                {userProfile?.role === 'SUPER_ADMIN' ? 'SA' : userProfile?.role === 'ADMIN' ? 'AD' : 'ST'}
              </div>
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-semibold text-slate-800">{userProfile?.displayName || user?.email?.split('@')[0] || 'Administrator'}</p>
              <p className="truncate text-[10px] text-slate-400 font-bold uppercase tracking-wider">{userProfile?.role || 'Staff'}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-500 text-sm font-medium"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="shrink-0 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-8 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-md"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 capitalize truncate max-w-[150px] sm:max-w-none">
              {navigation.find(n => n.path === location.pathname)?.label || 'Philly Car Rental'}
            </h1>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
