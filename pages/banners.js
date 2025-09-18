// pages/banners.js - Updated with Visual Banner Creator
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import BannerCreator from '../components/BannerCreator'

export default function BannerManagement() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [session, setSession] = useState(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
    }
  }, [router])

  const fetchBanners = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/banners')
      const result = await response.json()
      
      if (result.success) {
        setBanners(result.banners)
      } else {
        console.error('Failed to fetch banners:', result.error)
      }
    } catch (error) {
      console.error('Error fetching banners:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkUser()
    fetchBanners()
  }, [checkUser, fetchBanners])

  const resetForm = () => {
    setEditingBanner(null)
    setShowModal(false)
  }

  const handleSubmit = async (formData) => {
    setSubmitLoading(true)

    try {
      const url = editingBanner ? `/api/banners/${editingBanner.id}` : '/api/banners'
      const method = editingBanner ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        resetForm()
        fetchBanners()
        // Show success notification
        const notification = document.createElement('div')
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50'
        notification.textContent = editingBanner ? 'Banner updated successfully!' : 'Banner created successfully!'
        document.body.appendChild(notification)
        setTimeout(() => {
          document.body.removeChild(notification)
        }, 3000)
      } else {
        alert('Error saving banner: ' + result.error)
      }
    } catch (error) {
      console.error('Error saving banner:', error)
      alert('Error saving banner: ' + error.message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleEdit = (banner) => {
    setEditingBanner(banner)
    setShowModal(true)
  }

  const handleDelete = async (bannerId) => {
    if (!confirm('Are you sure you want to delete this banner?')) return

    try {
      const response = await fetch(`/api/banners/${bannerId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        fetchBanners()
        // Show success notification
        const notification = document.createElement('div')
        notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50'
        notification.textContent = 'Banner deleted successfully!'
        document.body.appendChild(notification)
        setTimeout(() => {
          document.body.removeChild(notification)
        }, 3000)
      } else {
        alert('Error deleting banner: ' + result.error)
      }
    } catch (error) {
      console.error('Error deleting banner:', error)
      alert('Error deleting banner: ' + error.message)
    }
  }

  const handleToggleActive = async (banner) => {
    try {
      const response = await fetch(`/api/banners/${banner.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !banner.is_active
        }),
      })

      const result = await response.json()

      if (result.success) {
        fetchBanners()
        // Show success notification
        const notification = document.createElement('div')
        notification.className = 'fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50'
        notification.textContent = `Banner ${!banner.is_active ? 'activated' : 'deactivated'} successfully!`
        document.body.appendChild(notification)
        setTimeout(() => {
          document.body.removeChild(notification)
        }, 3000)
      } else {
        alert('Error updating banner: ' + result.error)
      }
    } catch (error) {
      console.error('Error updating banner:', error)
      alert('Error updating banner: ' + error.message)
    }
  }

  const getActionTypeColor = (type) => {
    switch (type) {
      case 'category': return 'bg-blue-100 text-blue-800'
      case 'product': return 'bg-green-100 text-green-800'
      case 'url': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading && !banners.length) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="banners">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="banners">
      {/* Page Header */}
      <div className="bg-white shadow-lg rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Banner Management</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create and manage promotional banners for your mobile app with our visual editor
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Create Banner</span>
            </button>
          </div>
        </div>

        {/* Enhanced Stats */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg">
                    <span className="text-white text-lg font-bold">{banners.length}</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-blue-900">Total Banners</p>
                  <p className="text-xs text-blue-600">All banners in system</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center shadow-lg">
                    <span className="text-white text-lg font-bold">
                      {banners.filter(b => b.is_active).length}
                    </span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-green-900">Active Banners</p>
                  <p className="text-xs text-green-600">Currently displayed</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center shadow-lg">
                    <span className="text-white text-lg font-bold">
                      {banners.filter(b => !b.is_active).length}
                    </span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-yellow-900">Inactive Banners</p>
                  <p className="text-xs text-yellow-600">Not displayed</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-purple-900">Performance</p>
                  <p className="text-xs text-purple-600">Click tracking ready</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Banners Grid */}
      <div className="bg-white shadow-lg rounded-lg">
        <div className="px-6 py-4">
          {banners.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="mt-2 text-lg font-medium text-gray-900">No banners created yet</h3>
              <p className="mt-2 text-sm text-gray-500">Get started by creating your first promotional banner with our visual editor.</p>
              <div className="mt-8">
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all duration-200"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create Your First Banner
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {banners.map((banner) => (
                <div key={banner.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-200 group">
                  {/* Banner Image */}
                  <div className="relative h-48 bg-gray-200 overflow-hidden">
                    <img
                      src={banner.image_url}
                      alt={banner.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x200/f0f0f0/999999?text=Image+Not+Found'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-4">
                      <div>
                        <h3 className={`text-lg font-bold ${banner.text_color === 'white' ? 'text-white' : 'text-black'}`}>
                          {banner.title}
                        </h3>
                        {banner.subtitle && (
                          <p className={`text-sm ${banner.text_color === 'white' ? 'text-white/90' : 'text-black/90'}`}>
                            {banner.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full shadow-lg ${
                        banner.is_active 
                          ? 'bg-green-500 text-white' 
                          : 'bg-red-500 text-white'
                      }`}>
                        {banner.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Banner Details */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${getActionTypeColor(banner.action_type)}`}>
                        {banner.action_type.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        Order: {banner.display_order}
                      </span>
                    </div>
                    
                    {banner.action_value && (
                      <p className="text-sm text-gray-600 mb-3 truncate">
                        <span className="font-medium">Target:</span> {banner.action_value}
                      </p>
                    )}

                    {/* Date Range */}
                    {(banner.start_date || banner.end_date) && (
                      <div className="text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded-lg">
                        {banner.start_date && (
                          <div className="flex justify-between">
                            <span>Start:</span>
                            <span className="font-medium">{new Date(banner.start_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {banner.end_date && (
                          <div className="flex justify-between">
                            <span>End:</span>
                            <span className="font-medium">{new Date(banner.end_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleToggleActive(banner)}
                        className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
                          banner.is_active 
                            ? 'text-red-600 hover:bg-red-50' 
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {banner.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(banner)}
                          className="text-indigo-600 hover:bg-indigo-50 text-sm font-medium px-3 py-1 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(banner.id)}
                          className="text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visual Banner Creator Modal */}
      <BannerCreator
        isOpen={showModal}
        onClose={resetForm}
        onSubmit={handleSubmit}
        editingBanner={editingBanner}
        loading={submitLoading}
      />
    </DashboardLayout>
  )
}