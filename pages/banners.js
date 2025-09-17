// pages/banners.js - Updated with Navigation Layout
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function BannerManagement() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [session, setSession] = useState(null)
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    text_color: 'white',
    action_type: 'category',
    action_value: '',
    is_active: true,
    display_order: 0,
    start_date: '',
    end_date: ''
  })

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
    setFormData({
      title: '',
      subtitle: '',
      image_url: '',
      text_color: 'white',
      action_type: 'category',
      action_value: '',
      is_active: true,
      display_order: 0,
      start_date: '',
      end_date: ''
    })
    setEditingBanner(null)
    setShowModal(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

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
        alert(editingBanner ? 'Banner updated successfully!' : 'Banner created successfully!')
      } else {
        alert('Error saving banner: ' + result.error)
      }
    } catch (error) {
      console.error('Error saving banner:', error)
      alert('Error saving banner: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (banner) => {
    setEditingBanner(banner)
    setFormData({
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      image_url: banner.image_url || '',
      text_color: banner.text_color || 'white',
      action_type: banner.action_type || 'category',
      action_value: banner.action_value || '',
      is_active: banner.is_active !== undefined ? banner.is_active : true,
      display_order: banner.display_order || 0,
      start_date: banner.start_date ? banner.start_date.split('T')[0] : '',
      end_date: banner.end_date ? banner.end_date.split('T')[0] : ''
    })
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
        alert('Banner deleted successfully!')
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
        alert(`Banner ${!banner.is_active ? 'activated' : 'deactivated'} successfully!`)
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
          <div className="text-xl">Loading...</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="banners">
      {/* Page Header */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Banner Management</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create and manage promotional banners for your mobile app
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium transition-colors duration-200"
            >
              + Add Banner
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{banners.length}</span>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-900">Total Banners</p>
                  <p className="text-xs text-blue-600">All banners in system</p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {banners.filter(b => b.is_active).length}
                    </span>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-900">Active Banners</p>
                  <p className="text-xs text-green-600">Currently displayed</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {banners.filter(b => !b.is_active).length}
                    </span>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Inactive Banners</p>
                  <p className="text-xs text-gray-600">Not displayed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Banners Grid */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4">
          {banners.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No banners</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your first banner.</p>
              <div className="mt-6">
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Add Banner
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {banners.map((banner) => (
                <div key={banner.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
                  {/* Banner Image */}
                  <div className="relative h-48 bg-gray-200">
                    <img
                      src={banner.image_url}
                      alt={banner.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x200/f0f0f0/999999?text=Image+Not+Found'
                      }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-30 flex items-end p-4">
                      <div>
                        <h3 className={`text-lg font-bold ${banner.text_color === 'white' ? 'text-white' : 'text-black'}`}>
                          {banner.title}
                        </h3>
                        {banner.subtitle && (
                          <p className={`text-sm ${banner.text_color === 'white' ? 'text-white' : 'text-black'}`}>
                            {banner.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Status Badge */}
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        banner.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {banner.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Banner Details */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getActionTypeColor(banner.action_type)}`}>
                        {banner.action_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        Order: {banner.display_order}
                      </span>
                    </div>
                    
                    {banner.action_value && (
                      <p className="text-sm text-gray-600 mb-3">
                        Target: {banner.action_value}
                      </p>
                    )}

                    {/* Date Range */}
                    {(banner.start_date || banner.end_date) && (
                      <div className="text-xs text-gray-500 mb-3">
                        {banner.start_date && (
                          <div>Start: {new Date(banner.start_date).toLocaleDateString()}</div>
                        )}
                        {banner.end_date && (
                          <div>End: {new Date(banner.end_date).toLocaleDateString()}</div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => handleToggleActive(banner)}
                        className={`text-sm font-medium ${
                          banner.is_active 
                            ? 'text-red-600 hover:text-red-800' 
                            : 'text-green-600 hover:text-green-800'
                        }`}
                      >
                        {banner.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(banner)}
                          className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(banner.id)}
                          className="text-red-600 hover:text-red-900 text-sm font-medium"
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

      {/* Modal - same as before but with better styling */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingBanner ? 'Edit Banner' : 'Add New Banner'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Title *</label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Subtitle</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.subtitle}
                      onChange={(e) => setFormData({...formData, subtitle: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Image URL *</label>
                    <input
                      type="url"
                      required
                      placeholder="https://example.com/image.jpg"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.image_url}
                      onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Text Color</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.text_color}
                      onChange={(e) => setFormData({...formData, text_color: e.target.value})}
                    >
                      <option value="white">White</option>
                      <option value="black">Black</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Action Type</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.action_type}
                      onChange={(e) => setFormData({...formData, action_type: e.target.value})}
                    >
                      <option value="category">Category</option>
                      <option value="product">Product</option>
                      <option value="url">External URL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Action Value</label>
                    <input
                      type="text"
                      placeholder="electronics, product-123, or https://..."
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.action_value}
                      onChange={(e) => setFormData({...formData, action_value: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Display Order</label>
                    <input
                      type="number"
                      min="0"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.display_order}
                      onChange={(e) => setFormData({...formData, display_order: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Start Date (Optional)</label>
                    <input
                      type="date"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.start_date}
                      onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">End Date (Optional)</label>
                    <input
                      type="date"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.end_date}
                      onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                      />
                      <span className="ml-2 text-sm text-gray-700">Active</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 mt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (editingBanner ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}