// pages/amazon-products.js - Complete working version
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function AmazonProductsPage() {
  // Core states
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [notifications, setNotifications] = useState([])
  
  // Import states
  const [importInput, setImportInput] = useState('')
  const [importStatus, setImportStatus] = useState('idle')
  const [activeTab, setActiveTab] = useState('single')
  
  // CSV Import states
  const [csvFile, setCsvFile] = useState(null)
  const [csvImportStatus, setCsvImportStatus] = useState('idle')
  const [csvImportProgress, setCsvImportProgress] = useState({
    processed: 0,
    imported: 0,
    updated: 0,
    failed: 0,
    total: 0,
    percentage: 0
  })
  const [currentCsvSession, setCurrentCsvSession] = useState(null)
  
  // Update system states
  const [updateStatus, setUpdateStatus] = useState(null)
  
  // Filter and search states
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Delete all states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  
  const router = useRouter()

  // Initialize user session and data
  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadProducts(session.user.id)
      await loadUpdateStatus()
      await checkCsvImportStatus(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
    
    const interval = setInterval(() => {
      if (session?.user?.id) {
        loadUpdateStatus()
        checkCsvImportStatus(session.user.id)
      }
    }, 10000)
    
    return () => clearInterval(interval)
  }, [checkUser, session?.user?.id])

  // Load products from database
  const loadProducts = async (userId) => {
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1000)

      if (error) throw error
      setProducts(products || [])
    } catch (error) {
      console.error('Error loading products:', error)
      addNotification('Failed to load products', 'error')
    }
  }

  // Load update batch status
  const loadUpdateStatus = async () => {
    try {
      const { data: batches, error } = await supabase
        .from('update_batches')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)

      if (error) throw error
      
      if (batches && batches.length > 0) {
        setUpdateStatus(batches[0])
      }
    } catch (error) {
      console.error('Error loading update status:', error)
    }
  }

  // Check CSV import status
  const checkCsvImportStatus = async (userId) => {
    try {
      const response = await fetch(`/api/amazon/csv-import-status?userId=${userId}${currentCsvSession ? `&sessionId=${currentCsvSession}` : ''}`)
      const data = await response.json()
      
      if (data.success && data.session) {
        setCsvImportStatus(data.session.status)
        setCsvImportProgress(data.progress)
        
        if ((data.session.status === 'completed' || data.session.status === 'failed') && 
            csvImportStatus === 'processing') {
          await loadProducts(userId)
          
          if (data.session.status === 'completed') {
            addNotification(
              `CSV import completed! Imported: ${data.progress.imported}, Updated: ${data.progress.updated}, Failed: ${data.progress.failed}`,
              'success'
            )
          } else {
            addNotification('CSV import failed. Check the console for details.', 'error')
          }
        }
      }
    } catch (error) {
      console.error('Error checking CSV import status:', error)
    }
  }

  // Single product import
  const handleImport = async () => {
    if (!importInput.trim() || !session?.user?.id) return

    setImportStatus('importing')
    try {
      const response = await fetch('/api/amazon/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: importInput.trim(),
          userId: session.user.id
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        setImportInput('')
        setImportStatus('success')
        await loadProducts(session.user.id)
        addNotification(data.message, 'success')
      } else {
        throw new Error(data.message || 'Import failed')
      }
    } catch (error) {
      setImportStatus('error')
      addNotification(`Import failed: ${error.message}`, 'error')
    }
  }

  // CSV file handling
  const handleCsvFileChange = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'text/csv') {
      setCsvFile(file)
      setCsvImportStatus('idle')
    } else {
      addNotification('Please select a valid CSV file', 'error')
      setCsvFile(null)
    }
  }

  // CSV upload
  const handleCsvUpload = async () => {
    if (!csvFile || !session?.user?.id) return

    setCsvImportStatus('uploading')
    
    try {
      const csvContent = await readFileAsText(csvFile)
      setCsvImportStatus('processing')
      
      const response = await fetch('/api/amazon/bulk-import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvData: csvContent,
          userId: session.user.id
        })
      })

      const data = await response.json()
      
      if (response.ok && data.success) {
        setCurrentCsvSession(data.sessionId)
        addNotification(`CSV import started for ${data.totalSkus} SKUs`, 'info')
        setCsvFile(null)
        
        const fileInput = document.getElementById('csv-file-input')
        if (fileInput) fileInput.value = ''
      } else {
        throw new Error(data.message || 'CSV upload failed')
      }
    } catch (error) {
      setCsvImportStatus('error')
      addNotification(`CSV upload failed: ${error.message}`, 'error')
    }
  }

  // Read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  // Update single product
  const handleUpdateSingleProduct = async (productId) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    try {
      addNotification('Updating product...', 'info')
      
      const response = await fetch('/api/amazon/update-single-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          asin: product.supplier_asin
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        await loadProducts(session.user.id)
        addNotification('Product updated successfully', 'success')
      } else {
        throw new Error(data.message || 'Update failed')
      }
    } catch (error) {
      addNotification(`Update failed: ${error.message}`, 'error')
    }
  }

  // Trigger hourly update
  const triggerUpdate = async () => {
    try {
      const response = await fetch('/api/amazon/update-hourly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()
      if (response.ok && data.success) {
        addNotification('Update process started', 'info')
        setTimeout(loadUpdateStatus, 1000)
      } else {
        throw new Error(data.message || 'Update failed to start')
      }
    } catch (error) {
      addNotification(`Update failed: ${error.message}`, 'error')
    }
  }

  // Delete all products
  const handleDeleteAll = async () => {
    if (deleteConfirmText !== 'DELETE_ALL_PRODUCTS') {
      addNotification('Please type "DELETE_ALL_PRODUCTS" to confirm', 'error')
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch('/api/amazon/delete-all-products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          confirmDelete: 'DELETE_ALL_PRODUCTS'
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        addNotification(
          `Successfully deleted ${data.deletedCounts.products} products and ${data.deletedCounts.total} total records`, 
          'success'
        )
        await loadProducts(session.user.id)
        setShowDeleteConfirm(false)
        setDeleteConfirmText('')
      } else {
        throw new Error(data.message || 'Delete operation failed')
      }
    } catch (error) {
      addNotification(`Delete failed: ${error.message}`, 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  // Add notification
  const addNotification = (message, type = 'info') => {
    const notification = { id: Date.now(), message, type, timestamp: new Date().toISOString() }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  // Helper functions
  const parseFeatures = (features) => {
    try {
      if (!features) return []
      return JSON.parse(features)
    } catch (e) {
      return []
    }
  }

  const filteredProducts = products.filter(product => {
    const matchesFilter = filter === 'all' || 
      (filter === 'in_stock' && product.stock_status === 'In Stock') ||
      (filter === 'out_of_stock' && product.stock_status === 'Out of Stock') ||
      (filter === 'limited_stock' && product.stock_status === 'Limited Stock')
    
    const matchesSearch = !searchTerm || 
      product.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.internal_sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.supplier_asin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase()))

    return matchesFilter && matchesSearch
  })

  const getUpdateProgress = () => {
    if (!updateStatus || updateStatus.total_products === 0) return 0
    return Math.round((updateStatus.processed_products / updateStatus.total_products) * 100)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'In Stock': return 'bg-green-100 text-green-800'
      case 'Out of Stock': return 'bg-red-100 text-red-800'
      case 'Limited Stock': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price) => {
    return price ? `$${parseFloat(price).toFixed(2)}` : 'N/A'
  }

  const getProfit = (supplierPrice, ourPrice) => {
    if (!supplierPrice || !ourPrice) return 'N/A'
    const profit = ourPrice - supplierPrice
    return `$${profit.toFixed(2)}`
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="amazon-products">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="amazon-products">
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

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-xl font-bold text-orange-600">A</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Amazon AU Products ({products.length})</h1>
                <p className="text-gray-600 mt-1">Profit Formula: (Price × 1.2) + $0.30</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={triggerUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Manual Update
              </button>
              
              {products.length > 0 && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Delete All Products
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Import Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Import Amazon AU Products</h2>
          
          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => {
                setActiveTab('single')
                setImportInput('')
                setCsvFile(null)
                setCsvImportStatus('idle')
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'single' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Single Import
            </button>
            <button
              onClick={() => {
                setActiveTab('csv')
                setImportInput('')
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'csv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              CSV Bulk Import
            </button>
          </div>

          {/* Single Import */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder="Enter Amazon AU URL, ASIN, or search term..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={importStatus === 'importing'}
                />
                <button
                  onClick={handleImport}
                  disabled={!importInput.trim() || importStatus === 'importing'}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importStatus === 'importing' ? 'Importing...' : 'Import'}
                </button>
              </div>
              
              <p className="text-sm text-gray-500">
                Enter Amazon AU product URL, ASIN (10-character code), or search term to find and import products.
              </p>
            </div>
          )}

          {/* CSV Import */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleCsvFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={csvImportStatus === 'processing'}
                />
                
                {csvFile && csvImportStatus === 'idle' && (
                  <button
                    onClick={handleCsvUpload}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 whitespace-nowrap"
                  >
                    Upload CSV
                  </button>
                )}
              </div>

              {csvFile && (
                <div className="text-sm text-gray-600">
                  Selected file: <span className="font-medium">{csvFile.name}</span> 
                  ({(csvFile.size / 1024).toFixed(1)} KB)
                </div>
              )}

              {/* CSV Progress */}
              {csvImportStatus === 'processing' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-blue-800">CSV Import in Progress</h3>
                    <span className="text-sm text-blue-600">{csvImportProgress.percentage}%</span>
                  </div>
                  
                  <div className="w-full bg-blue-200 rounded-full h-2 mb-3">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${csvImportProgress.percentage}%` }}
                    ></div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Processed:</span>
                      <span className="ml-1 font-medium text-blue-800">
                        {csvImportProgress.processed} / {csvImportProgress.total}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Imported:</span>
                      <span className="ml-1 font-medium text-green-600">{csvImportProgress.imported}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Updated:</span>
                      <span className="ml-1 font-medium text-yellow-600">{csvImportProgress.updated}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Failed:</span>
                      <span className="ml-1 font-medium text-red-600">{csvImportProgress.failed}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-500 space-y-1">
                <p><strong>CSV Format:</strong> Upload a CSV file with product SKUs/ASINs</p>
                <p><strong>Required column:</strong> sku, asin, product_id, or id</p>
                <p><strong>Optional columns:</strong> title, brand, category, price</p>
              </div>
            </div>
          )}
        </div>

        {/* Update Status */}
        {updateStatus && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Status</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  updateStatus.status === 'completed' ? 'bg-green-100 text-green-800' :
                  updateStatus.status === 'running' ? 'bg-blue-100 text-blue-800' :
                  updateStatus.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {updateStatus.status}
                </span>
              </div>

              {updateStatus.status === 'running' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Progress:</span>
                    <span className="text-sm text-gray-900">{getUpdateProgress()}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${getUpdateProgress()}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {updateStatus.processed_products || 0} / {updateStatus.total_products || 0} products processed
                  </div>
                </div>
              )}

              {updateStatus.status === 'completed' && (
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Processed:</span>
                    <span className="ml-1 font-medium">{updateStatus.processed_products || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Updated:</span>
                    <span className="ml-1 font-medium text-green-600">{updateStatus.updated_products || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Failed:</span>
                    <span className="ml-1 font-medium text-red-600">{updateStatus.failed_products || 0}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center space-x-4">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Products</option>
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="limited_stock">Limited Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              Products ({filteredProducts.length})
            </h2>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl text-gray-400">📦</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filter !== 'all' ? 
                  'No products match your current filters.' : 
                  'Import your first Amazon AU product to get started.'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU/ASIN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Our Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProducts.map((product) => {
                    const features = parseFeatures(product.features)
                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <img
                              src={product.image_urls?.[0] || '/placeholder-product.png'}
                              alt={product.title}
                              className="w-12 h-12 rounded-lg object-cover mr-3"
                              onError={(e) => {
                                e.target.src = `https://via.placeholder.com/48x48/f0f0f0/666?text=${product.supplier_asin?.slice(-3) || '?'}`
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                {product.title}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center space-x-2">
                                <span>{product.brand}</span>
                                {features.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    {features.length > 1 ? 'Multiple Variants' : 'Has Variants'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{product.internal_sku}</div>
                          <div className="text-sm text-blue-600 hover:text-blue-800">
                            <a 
                              href={product.supplier_url || `https://www.amazon.com.au/dp/${product.supplier_asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {product.supplier_asin}
                            </a>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatPrice(product.supplier_price)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {formatPrice(product.our_price)}
                        </td>
                        <td className="px-6 py-4 text-sm text-green-600 font-medium">
                          {getProfit(product.supplier_price, product.our_price)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(product.stock_status)}`}>
                            {product.stock_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {product.rating_average && (
                            <div className="flex items-center">
                              <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <svg
                                    key={star}
                                    className={`h-4 w-4 ${
                                      star <= Math.floor(product.rating_average)
                                        ? 'text-yellow-400'
                                        : 'text-gray-300'
                                    }`}
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                              </div>
                              <span className="ml-1 text-sm text-gray-600">
                                {product.rating_average} ({product.rating_count?.toLocaleString()})
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-2">
                            <a
                              href={product.supplier_url || `https://www.amazon.com.au/dp/${product.supplier_asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-medium"
                              title="View on Amazon"
                            >
                              View
                            </a>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => handleUpdateSingleProduct(product.id)}
                              className="text-green-600 hover:text-green-800 font-medium"
                              title="Update product data"
                            >
                              Update
                            </button>
                          </div>
                          {product.last_scraped && (
                            <div className="text-xs text-gray-400 mt-1">
                              Updated: {new Date(product.last_scraped).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delete All Products Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-red-600 mb-4">
                ⚠️ Delete All Products
              </h3>
              
              <div className="space-y-4 mb-6">
                <p className="text-gray-700">
                  This will permanently delete <strong>all {products.length} products</strong> and their:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li>Price history records</li>
                  <li>Update logs</li>
                  <li>Import session data</li>
                </ul>
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-red-800 text-sm font-medium">
                    This action cannot be undone!
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type "DELETE_ALL_PRODUCTS" to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="DELETE_ALL_PRODUCTS"
                    disabled={isDeleting}
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                    }}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAll}
                    disabled={deleteConfirmText !== 'DELETE_ALL_PRODUCTS' || isDeleting}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete All'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}