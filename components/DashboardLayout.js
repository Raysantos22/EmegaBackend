// components/ModernDashboardLayout.js - Fixed Navigation
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function ModernDashboardLayout({ children, session, supabase, currentPage = 'dashboard' }) {
  const router = useRouter()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navigation = [
     { 
      name: 'amazon-products', 
      href: '/amazon-products', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
        </svg>
      ),
      current: currentPage === 'amazon-products' 
    },
    
    { 
      name: 'kogan-scraper', 
      href: '/kogan-scraper', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
        </svg>
      ),
      current: currentPage === 'kogan-scraper' 
    },
    // { 
    //   name: 'Products', 
    //   href: '/products',
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    //     </svg>
    //   ),
    //   current: currentPage === 'products' 
    // },
    // { 
    //   name: 'Banners', 
    //   href: '/banners', 
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    //     </svg>
    //   ),
    //   current: currentPage === 'banners' 
    // },
    // { 
    //   name: 'Notifications', 
    //   href: '/notifications', 
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-3.5-3.5a50.002 50.002 0 00-2.5 0L15 17zm-7.5-7.5a50.002 50.002 0 002.5 0L8 13l-7.5 4h5zm7.5-7.5l1.5 4.5h-3L8 6.5z" />
    //     </svg>
    //   ),
    //   current: currentPage === 'notifications' 
    // },
    //  { 
    //   name: 'Home-layout', 
    //   href: '/home-layout', 
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-3.5-3.5a50.002 50.002 0 00-2.5 0L15 17zm-7.5-7.5a50.002 50.002 0 002.5 0L8 13l-7.5 4h5zm7.5-7.5l1.5 4.5h-3L8 6.5z" />
    //     </svg>
    //   ),
    //   current: currentPage === 'notifications' 
    // },
    // { 
    //   name: 'Orders', 
    //   href: '/orders', 
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    //     </svg>
    //   ),
    //   current: currentPage === 'orders' 
    // },
    // { 
    //   name: 'Analytics', 
    //   href: '/analytics', 
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2 2z" />
    //     </svg>
    //   ),
    //   current: currentPage === 'analytics' 
    // },
    // { 
    //   name: 'Settings', 
    //   href: '/settings', 
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    //     </svg>
    //   ),
    //   current: currentPage === 'settings' 
    // },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`bg-white shadow-lg transition-all duration-300 flex flex-col ${
        isSidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        {/* Logo Section */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center">
            {isSidebarCollapsed ? (
              <img 
                src="https://emega.com.au/wp-content/uploads/2023/10/mega-shop-australia.png" 
                alt="Mega Shop Australia" 
                className="w-8 h-8 transition-all duration-300"
              />
            ) : (
              <img 
                src="https://emega.com.au/wp-content/uploads/2023/10/mega-shop-australia.png" 
                alt="Mega Shop Australia" 
                className="w-40 h-10 object-contain transition-all duration-300"
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${
                item.current
                  ? 'bg-red-50 text-red-700 border-r-2 border-red-600'
                  : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
              }`}
            >
              <span className={`${item.current ? 'text-red-600' : 'text-gray-400 group-hover:text-red-500'}`}>
                {item.icon}
              </span>
              {!isSidebarCollapsed && <span className="ml-3">{item.name}</span>}
            </Link>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full flex items-center justify-center px-3 py-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
          >
            <svg 
              className={`w-5 h-5 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!isSidebarCollapsed && <span className="ml-2 text-sm">Collapse</span>}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <header className="bg-white shadow-sm border-b border-gray-100">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Page Title */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 capitalize">
                  {currentPage === 'dashboard' ? 'Dashboard Overview' : currentPage}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {currentPage === 'dashboard' && 'Welcome to your admin dashboard'}
                  {currentPage === 'products' && 'Manage your product catalog'}
                  {currentPage === 'banners' && 'Create and manage promotional banners'}
                  {currentPage === 'orders' && 'View and process customer orders'}
                  {currentPage === 'analytics' && 'View detailed analytics and reports'}
                  {currentPage === 'settings' && 'Configure system settings'}
                </p>
              </div>

              {/* User Profile Section */}
              <div className="flex items-center space-x-4">
                {/* Notifications */}
                <button className="relative p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-3.5-3.5a50.002 50.002 0 00-2.5 0L15 17zm-7.5-7.5a50.002 50.002 0 002.5 0L8 13l-7.5 4h5zm7.5-7.5l1.5 4.5h-3L8 6.5z" />
                  </svg>
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
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
                    <button className="w-10 h-10 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-lg hover:shadow-xl transition-shadow duration-200">
                      {session?.user?.email?.charAt(0).toUpperCase() || 'A'}
                    </button>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors duration-200"
                    title="Logout"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <p>&copy; 2024 Mega Shop Australia. All rights reserved.</p>
            <div className="flex items-center space-x-4">
              <span>Version 1.0.0</span>
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
              <span>Last updated: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}