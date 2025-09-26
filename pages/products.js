// pages/products.js - Updated with continuous import functionality
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function ProductsPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState([])
  const [importStatus, setImportStatus] = useState('idle') // idle, running, completed, failed
  const [importProgress, setImportProgress] = useState({
    processed: 0,
    added: 0,
    updated: 0,
    errors: 0,
    total: 0
  })
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [notifications, setNotifications] = useState([])
  const [maxProducts, setMaxProducts] = useState(1000)
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadProducts(session.user.id)
      await checkImportStatus(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  // Poll import status while import is running
  useEffect(() => {
    let interval
    if (importStatus === 'running' && session?.user?.id) {
      interval = setInterval(() => {
        checkImportStatus(session.user.id, currentSessionId)
      }, 2000) // Check every 2 seconds
    }
    return () => clearInterval(interval)
  }, [importStatus, session?.user?.id, currentSessionId])

  const loadProducts = async (userId) => {
    try {
      const response = await fetch(`/api/kogan/products-simple?userId=${userId}`)
      const data = await response.json()
      if (data.success) {
        setProducts(data.products)
      }
    } catch (error) {
      console.error('Error loading products:', error)
    }
  }

  const checkImportStatus = async (userId, sessionId = null) => {
    try {
      const url = `/api/kogan/import-status?userId=${userId}${sessionId ? `&sessionId=${sessionId}` : ''}`
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.success && data.session) {
        setImportStatus(data.status)
        setImportProgress({
          processed: data.progress.processed,
          added: data.progress.added,
          updated: data.progress.updated,
          errors: data.progress.errors,
          total: data.progress.maxProducts
        })

        // If import completed or failed, reload products
        if ((data.status === 'completed' || data.status === 'failed') && importStatus === 'running') {
          await loadProducts(userId)
          
          if (data.status === 'completed') {
            addNotification(
              `Import completed! Added: ${data.progress.added}, Updated: ${data.progress.updated}`,
              'success'
            )
          } else if (data.status === 'failed') {
            addNotification('Import failed. Check console for details.', 'error')
          }
        }
      }
    } catch (error) {
      console.error('Error checking import status:', error)
    }
  }

  const startContinuousImport = async () => {
    if (!session?.user?.id) return

    setImportStatus('running')
    setImportProgress({ processed: 0, added: 0, updated: 0, errors: 0, total: maxProducts })
    
    try {
      const response = await fetch('/api/kogan/import-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          continuousMode: true,
          maxProducts: maxProducts
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        setCurrentSessionId(data.sessionId)
        addNotification(`Started importing up to ${maxProducts} products...`, 'info')
      } else {
        throw new Error(data.message || 'Import failed to start')
      }
    } catch (error) {
      setImportStatus('failed')
      addNotification(`Import failed to start: ${error.message}`, 'error')
    }
  }

  const stopImport = () => {
    setImportStatus('idle')
    setCurrentSessionId(null)
    addNotification('Import stopped', 'info')
  }

  const handleDeleteSelected = async () => {
    if (selectedProducts.length === 0) return

    try {
      const response = await fetch('/api/kogan/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: session.user.id, 
          productIds: selectedProducts 
        })
      })

      const data = await response.json()
      if (data.success) {
        await loadProducts(session.user.id)
        setSelectedProducts([])
        addNotification(`Removed ${data.deletedCount} products`, 'info')
      }
    } catch (error) {
      addNotification(`Delete failed: ${error.message}`, 'error')
    }
  }

  const addNotification = (message, type = 'info') => {
    const notification = { id: Date.now(), message, type, timestamp: new Date().toISOString() }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  const filteredProducts = products.filter(product => {
    const matchesFilter = filter === 'all' || 
      (filter === 'available' && product.status === 'In Stock') ||
      (filter === 'out_of_stock' && product.status !== 'In Stock')
    
    const matchesSearch = !searchTerm || 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase()))

    return matchesFilter && matchesSearch
  })

  const selectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([])
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id))
    }
  }

  const toggleProduct = (productId) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    )
  }

  const getProgressPercentage = () => {
    if (importProgress.total === 0) return 0
    return Math.round((importProgress.processed / importProgress.total) * 100)
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="products">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="products">
      <div className="space-y-6">
        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg shadow-lg border max-w-sm ${
                  notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                  notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                  notification.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Header with Import Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Products ({products.length})
              </h1>
              <p className="text-gray-600 mt-1">
                {importStatus === 'running' ? 'Continuous import in progress...' : 'Import and manage all Kogan products'}
              </p>
            </div>
          </div>

          {/* Import Controls */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Max Products:</label>
                <select
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(parseInt(e.target.value))}
                  disabled={importStatus === 'running'}
                  className="border border-gray-300 rounded px-3 py-1 text-sm"
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={2000}>2,000</option>
                  <option value={5000}>5,000</option>
                </select>
              </div>

              <button
                onClick={importStatus === 'running' ? stopImport : startContinuousImport}
                disabled={!session?.user?.id}
                className={`px-6 py-2 rounded-lg font-medium flex items-center space-x-2 ${
                  importStatus === 'running' 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {importStatus === 'running' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10l2 2 4-4" />
                    </svg>
                    <span>Stop Import</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Import All Products</span>
                  </>
                )}
              </button>
            </div>

            {/* Import Progress */}
            {importStatus === 'running' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">
                    Import Progress ({getProgressPercentage()}%)
                  </span>
                  <span className="text-sm text-blue-700">
                    {importProgress.processed} / {importProgress.total}
                  </span>
                </div>
                
                <div className="w-full bg-blue-200 rounded-full h-2 mb-3">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${getProgressPercentage()}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-green-600">Added: </span>
                    <span className="text-green-800">{importProgress.added}</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-600">Updated: </span>
                    <span className="text-blue-800">{importProgress.updated}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Processed: </span>
                    <span className="text-gray-800">{importProgress.processed}</span>
                  </div>
                  <div>
                    <span className="font-medium text-red-600">Errors: </span>
                    <span className="text-red-800">{importProgress.errors}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Import Status Messages */}
            {importStatus === 'completed' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-green-700">
                      Import completed! Added {importProgress.added} new products, updated {importProgress.updated} existing products.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {importStatus === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">Import failed. Please try again.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Filters */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('available')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filter === 'available' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Available ({products.filter(p => p.status === 'In Stock').length})
                </button>
                <button
                  onClick={() => setFilter('out_of_stock')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filter === 'out_of_stock' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Out of Stock ({products.filter(p => p.status !== 'In Stock').length})
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search products..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent w-64"
                />
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedProducts.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{selectedProducts.length} selected</span>
                <button
                  onClick={handleDeleteSelected}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Delete Selected
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-400 text-6xl mb-4">📦</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {importStatus === 'running' ? 'Import in progress...' : 'No products found'}
              </h3>
              <p className="text-gray-600">
                {importStatus === 'running' 
                  ? 'Products will appear here as they are imported.' 
                  : 'Click "Import All Products" to start importing from Kogan.'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={selectAll}
                        className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uploaded
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Available
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      On Hold
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Out Of Stock
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sold
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Store
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleProduct(product.id)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <img
                            className="h-12 w-12 rounded-lg object-cover mr-4"
                            src={product.image_url || `https://picsum.photos/100/100?random=${product.id}`}
                            alt={product.name}
                            onError={(e) => {
                              e.target.src = `https://picsum.photos/100/100?random=${product.id}`
                            }}
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                              {product.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {product.brand} • SKU: {product.sku}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {new Date(product.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            product.status === 'In Stock' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {product.status === 'In Stock' ? '1' : '0'}
                          </span>
                          <span className="text-xs text-gray-500">Available</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          0
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          product.status !== 'In Stock' 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {product.status !== 'In Stock' ? '1' : '0'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <div className="font-semibold text-gray-900">
                            ${product.price_current}
                          </div>
                          {product.price_original && (
                            <div className="text-xs text-gray-500 line-through">
                              ${product.price_original}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-green-600">
                          ${(parseFloat(product.price_current || 0) * 0.3).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">30% margin</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-sm text-gray-900">{product.id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">0</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                            <span className="text-xs text-white font-bold">K</span>
                          </div>
                          <span className="text-sm text-gray-900">Kogan Store</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {products.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Products</dt>
                    <dd className="text-lg font-medium text-gray-900">{products.length}</dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">In Stock</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {products.filter(p => p.status === 'In Stock').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Avg Price</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      ${products.length > 0 
                        ? (products.reduce((sum, p) => sum + parseFloat(p.price_current || 0), 0) / products.length).toFixed(2)
                        : '0.00'
                      }
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">On Sale</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {products.filter(p => p.discount_percent).length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}