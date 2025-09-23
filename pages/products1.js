// pages/products.js - Enhanced Products Management with Token Management
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function ProductsManagement() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [session, setSession] = useState(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [syncInterval, setSyncInterval] = useState(null)
  const [tokenStatus, setTokenStatus] = useState(null)
  const [tokenForm, setTokenForm] = useState('')
  const [tokenLoading, setTokenLoading] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  })
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    quantity: '',
    sku: '',
    main_picture_url: '',
    shipping_price: '',
    tags: [],
    status: 2
  })

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
    }
  }, [router])

  const fetchProducts = useCallback(async (page = 1, search = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        status: '2',
        sort_by: 'modified_at',
        sort_order: 'desc'
      })

      if (search) {
        params.append('search', search)
      }

      const response = await fetch(`/api/products?${params}`)
      const result = await response.json()
      
      if (result.success) {
        setProducts(result.products)
        setPagination(result.pagination)
      } else {
        console.error('Failed to fetch products:', result.error)
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.limit])

  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync-status')
      const result = await response.json()
      setSyncStatus(result)
      setLastSyncTime(result.last_sync)
    } catch (error) {
      console.error('Error fetching sync status:', error)
    }
  }, [])

  const fetchTokenStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/autods-token')
      const result = await response.json()
      setTokenStatus(result)
    } catch (error) {
      console.error('Error fetching token status:', error)
    }
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    showNotification('Starting sync with AutoDS...', 'info')
    
    try {
      const response = await fetch('/api/sync-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (result.success) {
        showNotification(
          `Sync completed! ${result.active_synced} products synced, ${result.zero_qty_removed} removed`, 
          'success'
        )
        fetchProducts(pagination.page, searchTerm)
        fetchSyncStatus()
      } else if (result.needs_token || result.token_expired) {
        showNotification('AutoDS token required or expired. Click "Manage Token" to update.', 'warning')
        setShowTokenModal(true)
      } else {
        showNotification('Sync failed: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Sync error:', error)
      showNotification('Sync failed: ' + error.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleTokenSubmit = async (e) => {
    e.preventDefault()
    setTokenLoading(true)

    try {
      const response = await fetch('/api/autods-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: tokenForm
        }),
      })

      const result = await response.json()

      if (result.success) {
        showNotification('AutoDS token updated successfully!', 'success')
        setTokenForm('')
        setShowTokenModal(false)
        fetchTokenStatus()
      } else {
        showNotification('Failed to update token: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Token update error:', error)
      showNotification('Failed to update token: ' + error.message, 'error')
    } finally {
      setTokenLoading(false)
    }
  }

  const handleClearToken = async () => {
    if (!confirm('Are you sure you want to clear the stored AutoDS token?')) return

    try {
      const response = await fetch('/api/autods-token', {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        showNotification('AutoDS token cleared successfully!', 'success')
        fetchTokenStatus()
      } else {
        showNotification('Failed to clear token: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Token clear error:', error)
      showNotification('Failed to clear token: ' + error.message, 'error')
    }
  }

  const toggleAutoSync = () => {
    if (autoSyncEnabled) {
      if (syncInterval) {
        clearInterval(syncInterval)
        setSyncInterval(null)
      }
      setAutoSyncEnabled(false)
      showNotification('Auto-sync disabled', 'info')
    } else {
      const interval = setInterval(() => {
        handleSync()
      }, 30 * 60 * 1000)
      
      setSyncInterval(interval)
      setAutoSyncEnabled(true)
      showNotification('Auto-sync enabled (every 30 minutes)', 'success')
    }
  }

  const removeZeroQuantityProducts = async () => {
    if (!confirm('Are you sure you want to remove all products with zero quantity?')) return

    try {
      const response = await fetch('/api/products/cleanup-zero-qty', {
        method: 'POST',
      })

      const result = await response.json()

      if (result.success) {
        showNotification(`Removed ${result.removed_count} zero quantity products`, 'success')
        fetchProducts(pagination.page, searchTerm)
        fetchSyncStatus()
      } else {
        showNotification('Cleanup failed: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Cleanup error:', error)
      showNotification('Cleanup failed: ' + error.message, 'error')
    }
  }

  useEffect(() => {
    checkUser()
    fetchProducts()
    fetchSyncStatus()
    fetchTokenStatus()

    return () => {
      if (syncInterval) {
        clearInterval(syncInterval)
      }
    }
  }, [checkUser, fetchProducts, fetchSyncStatus, fetchTokenStatus])

  // Keep all existing handlers (resetForm, handleSubmit, handleEdit, handleDelete, handleSearch)
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      price: '',
      quantity: '',
      sku: '',
      main_picture_url: '',
      shipping_price: '',
      tags: [],
      status: 2
    })
    setEditingProduct(null)
    setShowModal(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitLoading(true)

    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products'
      const method = editingProduct ? 'PUT' : 'POST'

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
        fetchProducts(pagination.page, searchTerm)
        showNotification(
          editingProduct ? 'Product updated successfully!' : 'Product created successfully!',
          'success'
        )
      } else {
        showNotification('Error saving product: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error saving product:', error)
      showNotification('Error saving product: ' + error.message, 'error')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    setFormData({
      title: product.title || '',
      description: product.description || '',
      price: product.price || '',
      quantity: product.quantity || '',
      sku: product.sku || '',
      main_picture_url: product.main_picture_url || '',
      shipping_price: product.shipping_price || '',
      tags: product.tags || [],
      status: product.status || 2
    })
    setShowModal(true)
  }

  const handleDelete = async (productId) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        fetchProducts(pagination.page, searchTerm)
        showNotification('Product deleted successfully!', 'success')
      } else {
        showNotification('Error deleting product: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error deleting product:', error)
      showNotification('Error deleting product: ' + error.message, 'error')
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    fetchProducts(1, searchTerm)
  }

  const showNotification = (message, type) => {
    const notification = document.createElement('div')
    const bgColor = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      info: 'bg-blue-500',
      warning: 'bg-yellow-500'
    }[type] || 'bg-gray-500'
    
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${bgColor} text-white max-w-sm`
    notification.textContent = message
    document.body.appendChild(notification)
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification)
      }
    }, 5000)
  }

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`
    return date.toLocaleDateString()
  }

  if (loading && !products.length) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="products">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="products">
      {/* Enhanced Page Header with Token Management */}
      <div className="bg-white shadow-lg rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Product Management</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage your product catalog and sync with AutoDS
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowTokenModal(true)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm flex items-center space-x-2 ${
                  tokenStatus?.has_database_token || tokenStatus?.has_env_token
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2m0 0V7a2 2 0 012-2m0 0a2 2 0 012-2" />
                </svg>
                <span>Manage Token</span>
              </button>
              <button
                onClick={removeZeroQuantityProducts}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm"
              >
                Clean Zero Qty
              </button>
              <button
                onClick={toggleAutoSync}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                  autoSyncEnabled 
                    ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                {autoSyncEnabled ? 'Disable Auto-Sync' : 'Enable Auto-Sync'}
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2 text-sm"
              >
                {syncing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add Product</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sync Status Bar with Token Info */}
        {syncStatus && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    syncStatus.sync_health?.status === 'healthy' ? 'bg-green-400' : 'bg-yellow-400'
                  }`}></div>
                  <span className="text-gray-600">
                    Status: <span className="font-medium">{syncStatus.sync_health?.status || 'Unknown'}</span>
                  </span>
                </div>
                <div className="text-gray-600">
                  Total Products: <span className="font-medium">{syncStatus.total_products}</span>
                </div>
                <div className="text-gray-600">
                  Zero Quantity: <span className="font-medium text-orange-600">{syncStatus.zero_quantity_products}</span>
                </div>
                <div className="text-gray-600">
                  Last Sync: <span className="font-medium">{formatLastSync(lastSyncTime)}</span>
                </div>
                <div className="text-gray-600">
                  Token: <span className={`font-medium ${
                    tokenStatus?.has_database_token || tokenStatus?.has_env_token ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tokenStatus?.has_database_token || tokenStatus?.has_env_token ? 'Configured' : 'Missing'}
                  </span>
                </div>
              </div>
              {autoSyncEnabled && (
                <div className="flex items-center space-x-2 text-green-600">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Auto-sync active</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search and Stats */}
        <div className="px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <form onSubmit={handleSearch} className="flex space-x-2">
              <input
                type="text"
                placeholder="Search products..."
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Search
              </button>
            </form>
            <div className="text-sm text-gray-600">
              Showing {products.length} of {pagination.total} products
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid/Table - Same as before */}
      <div className="bg-white shadow-lg rounded-lg">
        <div className="px-6 py-4">
          {products.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="mt-2 text-lg font-medium text-gray-900">No products found</h3>
              <p className="mt-2 text-sm text-gray-500">
                {searchTerm ? 'No products match your search criteria.' : 'Get started by syncing with AutoDS or adding your first product.'}
              </p>
              <div className="mt-8 flex justify-center space-x-4">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 transition-all duration-200"
                >
                  {syncing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  {syncing ? 'Syncing...' : 'Sync with AutoDS'}
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-all duration-200"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Manual Product
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {product.main_picture_url && (
                            <img
                              className="h-12 w-12 rounded-lg object-cover mr-4 border border-gray-200"
                              src={product.main_picture_url}
                              alt={product.title}
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/48x48/f0f0f0/999999?text=No+Image'
                              }}
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{product.title}</div>
                            <div className="text-sm text-gray-500 truncate max-w-xs">{product.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">${product.price}</div>
                        {product.shipping_price > 0 && (
                          <div className="text-xs text-gray-500">+${product.shipping_price} shipping</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          product.quantity > 10 ? 'text-green-600' : 
                          product.quantity > 0 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {product.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.sku}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        {product.autods_id?.startsWith('manual_') ? (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Manual</span>
                        ) : (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">AutoDS</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          product.status === 2 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {product.status === 2 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(product)}
                          className="text-red-600 hover:text-red-900 mr-4 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-gray-600 hover:text-red-900 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-700">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total products)
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => fetchProducts(pagination.page - 1, searchTerm)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchProducts(pagination.page + 1, searchTerm)}
                  disabled={pagination.page === pagination.pages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AutoDS Token Management Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">AutoDS Token Management</h3>
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Token Status */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Current Status</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Database Token:</span>
                    <span className={tokenStatus?.has_database_token ? 'text-green-600' : 'text-red-600'}>
                      {tokenStatus?.has_database_token ? 'Configured' : 'Not Set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Environment Token:</span>
                    <span className={tokenStatus?.has_env_token ? 'text-green-600' : 'text-red-600'}>
                      {tokenStatus?.has_env_token ? 'Configured' : 'Not Set'}
                    </span>
                  </div>
                  {tokenStatus?.token_preview && (
                    <div className="flex justify-between">
                      <span>Preview:</span>
                      <span className="text-gray-600 font-mono text-xs">{tokenStatus.token_preview}</span>
                    </div>
                  )}
                  {tokenStatus?.last_updated && (
                    <div className="flex justify-between">
                      <span>Last Updated:</span>
                      <span className="text-gray-600">{new Date(tokenStatus.last_updated).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Update Token Form */}
              <form onSubmit={handleTokenSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AutoDS Refresh Token
                  </label>
                  <textarea
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                    rows="3"
                    placeholder="Paste your AutoDS refresh token here..."
                    value={tokenForm}
                    onChange={(e) => setTokenForm(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Get this from your AutoDS account under Settings → API & Integrations
                  </p>
                </div>

                <div className="flex justify-between space-x-4">
                  <div className="flex space-x-2">
                    {(tokenStatus?.has_database_token || tokenStatus?.has_env_token) && (
                      <button
                        type="button"
                        onClick={handleClearToken}
                        className="px-4 py-2 border border-red-300 rounded-md text-red-700 hover:bg-red-50"
                      >
                        Clear Token
                      </button>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowTokenModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={tokenLoading || !tokenForm.trim()}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                    >
                      {tokenLoading ? 'Updating...' : 'Update Token'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Instructions */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">How to get your AutoDS refresh token:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Log into your AutoDS account</li>
                  <li>Go to Settings → API & Integrations</li>
                  <li>Generate a new refresh token</li>
                  <li>Copy and paste it above</li>
                  <li>The token will be securely stored and used for syncing</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal - Same as before */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
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
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      rows="3"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Price *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Quantity *</label>
                    <input
                      type="number"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.quantity}
                      onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">SKU</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.sku}
                      onChange={(e) => setFormData({...formData, sku: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Shipping Price</label>
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.shipping_price}
                      onChange={(e) => setFormData({...formData, shipping_price: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Image URL</label>
                    <input
                      type="url"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.main_picture_url}
                      onChange={(e) => setFormData({...formData, main_picture_url: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: parseInt(e.target.value)})}
                    >
                      <option value={2}>Active</option>
                      <option value={1}>Inactive</option>
                    </select>
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
                    disabled={submitLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitLoading ? 'Saving...' : (editingProduct ? 'Update' : 'Create')}
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