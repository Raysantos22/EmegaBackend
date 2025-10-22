import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function ModernDashboardLayout({ children, session, supabase, currentPage = 'amazon-products' }) {
  const router = useRouter()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navigation = [
    { 
      name: 'Amazon Products', 
      href: '/amazon-products', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      current: currentPage === 'amazon-products' 
    },
    { 
      name: 'Stores & Affiliate Links', 
      href: '/stores', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      current: currentPage === 'stores' 
    },
    { 
      name: 'Emega Database', 
      href: '/emega-database', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      current: currentPage === 'emega-database' 
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex">
      {/* Sidebar */}
      <div className={`bg-white shadow-xl transition-all duration-300 ease-in-out flex flex-col relative ${
        isSidebarCollapsed ? 'w-20' : 'w-72'
      }`}>
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-orange-500/5 pointer-events-none"></div>
        
        {/* Logo Section */}
        <div className="relative p-6 border-b border-gray-100">
          <div className="flex items-center justify-center">
            {isSidebarCollapsed ? (
              <img 
                src="/megam.png" 
                alt="M" 
                className="w-10 h-10 object-contain transition-all duration-300"
              />
            ) : (
              <img 
                src="https://emega.com.au/wp-content/uploads/2023/10/mega-shop-australia.png" 
                alt="Mega Shop Australia" 
                className="w-48 h-12 object-contain transition-all duration-300"
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 relative">
          {navigation.map((item, index) => (
            <Link
              key={item.name}
              href={item.href}
              className={`relative flex items-center px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-300 group overflow-hidden ${
                item.current
                  ? 'bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg shadow-red-500/30 scale-105'
                  : 'text-gray-600 hover:text-red-600 hover:bg-red-50/80'
              }`}
              style={{
                transitionDelay: `${index * 50}ms`
              }}
            >
              {/* Active indicator */}
              {item.current && (
                <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-orange-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
              )}
              
              {/* Icon with glow effect */}
              <span className={`relative z-10 ${item.current ? 'text-white' : 'text-gray-400 group-hover:text-red-500'} transition-colors duration-300`}>
                {item.icon}
                {item.current && (
                  <span className="absolute inset-0 blur-md opacity-50">{item.icon}</span>
                )}
              </span>
              
              {/* Text with smooth fade */}
              <span className={`ml-4 relative z-10 whitespace-nowrap transition-all duration-300 ${
                isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'
              }`}>
                {item.name}
              </span>
              
              {/* Hover effect shine */}
              {!item.current && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="relative p-4 border-t border-gray-100 space-y-3">
          {/* User Info Card */}
          {!isSidebarCollapsed && (
            <div className="flex items-center space-x-3">
              <div className="flex-1 min-w-0">
                {/* User info commented out as in original */}
              </div>
            </div>
          )}
          
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/5 to-red-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <svg 
              className={`w-5 h-5 transition-all duration-300 relative z-10 ${
                isSidebarCollapsed ? 'rotate-0' : 'rotate-180'
              } group-hover:scale-110`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span className={`ml-3 text-sm font-medium relative z-10 transition-all duration-300 ${
              isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'
            }`}>
              Collapse
            </span>
          </button>
        </div>

        {/* Collapsed tooltip */}
        {isSidebarCollapsed && (
          <div className="absolute -right-2 top-1/2 transform -translate-y-1/2">
            <div className="w-1 h-16 bg-gradient-to-b from-red-500 to-orange-600 rounded-full shadow-lg shadow-red-500/30"></div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Page Title */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 capitalize">
                  {currentPage === 'amazon-products' ? 'Amazon Products' : 
                   currentPage === 'emega-database' ? 'Emega Database Viewer' : currentPage}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {currentPage === 'emega-database' && 'View and manage your Emega database tables'}
                </p>
              </div>

              {/* User Profile Section */}
              <div className="flex items-center space-x-4">
                {/* Notifications */}
                <button className="relative p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 group">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                </button>

                {/* User Menu */}
                <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {session?.user?.email?.split('@')[0] || 'Admin'}
                    </p>
                    <p className="text-xs text-gray-500">Administrator</p>
                  </div>
                  
                  <div className="relative">
                    <button className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110">
                      {session?.user?.email?.charAt(0).toUpperCase() || 'A'}
                    </button>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all duration-200 group"
                    title="Logout"
                  >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-100 px-6 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}