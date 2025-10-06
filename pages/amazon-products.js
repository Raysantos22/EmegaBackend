// pages/amazon-products.js - Complete with Quick Affiliate Link Feature
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function AmazonProductsPage() {
  // Core states
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const abortControllers = useRef(new Map())
  const [notifications, setNotifications] = useState([])
  
  // Import states
  const [importInput, setImportInput] = useState('')
  const [importStatus, setImportStatus] = useState('idle')
  const [activeTab, setActiveTab] = useState('single')
  
  // CSV Import states
  const [csvFile, setCsvFile] = useState(null)
  const [csvImportStatus, setCsvImportStatus] = useState('idle')
  const [csvImportProgress, setCsvImportProgress] = useState({
    processed: 0, imported: 0, updated: 0, failed: 0, total: 0, percentage: 0
  })
  const [csvImportDetails, setCsvImportDetails] = useState([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [currentCsvSession, setCurrentCsvSession] = useState(null)
  
  // Update system states
  const [updateStatus, setUpdateStatus] = useState(null)
  const [updatingProducts, setUpdatingProducts] = useState(new Set())
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updateProgress, setUpdateProgress] = useState({
    processed: 0,
    updated: 0,
    failed: 0,
    total: 0,
    percentage: 0,
    currentProduct: null,
    completed: false
  })
  const [updateSessionId, setUpdateSessionId] = useState(null)
  const [updateLogs, setUpdateLogs] = useState([])
  
  // Quick Affiliate Link states
  const [showQuickLinkModal, setShowQuickLinkModal] = useState(false)
  const [selectedProductForLink, setSelectedProductForLink] = useState(null)
  const [userStores, setUserStores] = useState([])
  const [quickLinkForm, setQuickLinkForm] = useState({
    storeId: '',
    affiliateUrl: ''
  })
  
  // Filter and search states
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  
  // UI states
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showImportSection, setShowImportSection] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [selectAll, setSelectAll] = useState(false)
  
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadProducts(session.user.id)
      await loadUserStores(session.user.id)
      await checkCsvImportStatus(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
    const interval = setInterval(() => {
      if (session?.user?.id) {
        checkCsvImportStatus(session.user.id)
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [checkUser, session?.user?.id])

  const loadProducts = async (userId) => {
    try {
      setLoading(true)
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
    } finally {
      setLoading(false)
    }
  }

  const loadUserStores = async (userId) => {
    if (!userId) return
    
    try {
      const { data: stores, error } = await supabase
        .from('stores')
        .select('id, store_name')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('store_name')
      
      if (error) throw error
      setUserStores(stores || [])
    } catch (error) {
      console.error('Error loading stores:', error)
    }
  }

  const handleRefresh = async () => {
    if (!session?.user?.id) return
    setIsRefreshing(true)
    addNotification('Refreshing products...', 'info')
    try {
      await loadProducts(session.user.id)
      await checkCsvImportStatus(session.user.id)
      addNotification('Products refreshed successfully', 'success')
    } catch (error) {
      addNotification('Failed to refresh products', 'error')
    } finally {
      setIsRefreshing(false)
    }
  }

  const checkCsvImportStatus = async (userId) => {
    try {
      const response = await fetch(`/api/amazon/csv-import-status?userId=${userId}${currentCsvSession ? `&sessionId=${currentCsvSession}` : ''}`)
      const data = await response.json()
      if (data.success && data.session) {
        const previousStatus = csvImportStatus
        
        const uiStatus = data.session.status === 'running' ? 'processing' : data.session.status
        setCsvImportStatus(uiStatus)
        setCsvImportProgress(data.progress)
        
        if (!currentCsvSession && data.session.id && uiStatus === 'processing') {
          console.log('[STATUS] Setting current session:', data.session.id)
          setCurrentCsvSession(data.session.id)
        }
        
        if (currentCsvSession || data.session.id) {
          fetchImportLogs(currentCsvSession || data.session.id)
        }
        
        if ((uiStatus === 'completed' || uiStatus === 'failed') && previousStatus === 'processing') {
          await loadProducts(userId)
          if (uiStatus === 'completed') {
            addNotification(`CSV import completed! Imported: ${data.progress.imported}, Updated: ${data.progress.updated}`, 'success')
          }
          setTimeout(() => {
            setCurrentCsvSession(null)
          }, 5000)
        }
      }
    } catch (error) {
      console.error('Error checking CSV import status:', error)
    }
  }

  const fetchImportLogs = async (sessionId) => {
    try {
      const { data: logs, error } = await supabase
        .from('import_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (!error && logs) {
        setCsvImportDetails(logs.map(log => ({
          asin: log.asin,
          status: log.status,
          message: log.message,
          timestamp: log.created_at
        })))
      }
    } catch (error) {
      console.error('Error fetching import logs:', error)
    }
  }

  const handleImport = async () => {
    if (!importInput.trim() || !session?.user?.id) return
    setImportStatus('importing')
    try {
      const response = await fetch('/api/amazon/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: importInput.trim(), userId: session.user.id })
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

  const handleCsvUpload = async () => {
    if (!csvFile || !session?.user?.id) return
    setCsvImportStatus('uploading')
    try {
      const csvContent = await csvFile.text()
      setCsvImportStatus('processing')
      const response = await fetch('/api/amazon/bulk-import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: csvContent, userId: session.user.id })
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setCurrentCsvSession(data.sessionId)
        addNotification(`CSV import started for ${data.totalSkus} SKUs`, 'info')
        setCsvFile(null)
        const fileInput = document.getElementById('csv-file-input')
        if (fileInput) fileInput.value = ''
        setShowImportModal(true)
      } else {
        throw new Error(data.message || 'CSV upload failed')
      }
    } catch (error) {
      setCsvImportStatus('error')
      addNotification(`CSV upload failed: ${error.message}`, 'error')
    }
  }

  const handleCancelImport = async () => {
    let sessionToCancel = currentCsvSession
    
    if (!sessionToCancel) {
      try {
        const response = await fetch(`/api/amazon/csv-import-status?userId=${session.user.id}`)
        const data = await response.json()
        if (data.success && data.session && data.session.status === 'running') {
          sessionToCancel = data.session.id
          setCurrentCsvSession(sessionToCancel)
        }
      } catch (error) {
        console.error('[CANCEL] Error finding session:', error)
      }
    }
    
    if (!sessionToCancel) {
      addNotification('No active import to cancel', 'error')
      return
    }
    
    if (!confirm('Are you sure you want to cancel this import?')) {
      return
    }
    
    try {
      const response = await fetch('/api/amazon/bulk-import-csv', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionToCancel })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        addNotification('Import cancelled successfully', 'success')
        setCsvImportStatus('cancelled')
        setTimeout(async () => {
          await loadProducts(session.user.id)
          setShowImportModal(false)
          setCurrentCsvSession(null)
        }, 1000)
      } else {
        throw new Error(data.message || data.error || 'Cancel failed')
      }
    } catch (error) {
      addNotification(`Failed to cancel: ${error.message}`, 'error')
    }
  }

  const handleUpdateSingleProduct = async (productId) => {
    const product = products.find(p => p.id === productId)
    if (!product) return
    
    if (!confirm(`Update product ${product.supplier_asin}?\n\nThis will scrape fresh data from Amazon.`)) {
      return
    }
    
    try {
      setUpdatingProducts(prev => new Set(prev).add(productId))
      addNotification('Updating product...', 'info')
      
      const response = await fetch('/api/amazon/update-single-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, asin: product.supplier_asin })
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
    } finally {
      setUpdatingProducts(prev => {
        const newSet = new Set(prev)
        newSet.delete(productId)
        return newSet
      })
    }
  }

  const triggerUpdate = () => {
    setShowUpdateConfirm(true)
  }

  const confirmUpdate = async () => {
    setShowUpdateConfirm(false)
    
    try {
      addNotification('Starting update process...', 'info')
      
      const response = await fetch('/api/amazon/update-hourly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        const sessionId = data.sessionId
        console.log('[FRONTEND] Update started with session ID:', sessionId)
        
        setUpdateSessionId(sessionId)
        setUpdateProgress({
          processed: 0,
          updated: 0,
          failed: 0,
          total: data.totalProducts,
          percentage: 0,
          completed: false
        })
        setShowUpdateModal(true)
        addNotification(`Update started for ${data.totalProducts} products`, 'info')
        
        const pollInterval = setInterval(async () => {
          await checkUpdateStatus(sessionId, pollInterval)
        }, 3000)
        
      } else {
        throw new Error(data.message || 'Update failed')
      }
    } catch (error) {
      addNotification(`Update failed: ${error.message}`, 'error')
    }
  }

  const checkUpdateStatus = async (sessionId, pollInterval) => {
    try {
      const response = await fetch(`/api/amazon/update-status?userId=${session.user.id}&sessionId=${sessionId}`)
      const data = await response.json()
      
      if (data.success && data.session) {
        setUpdateProgress({
          ...data.progress,
          completed: data.session.status === 'completed'
        })
        
        const { data: logs, error: logsError } = await supabase
          .from('update_logs')
          .select(`
            *,
            products!update_logs_product_id_fkey(supplier_asin)
          `)
          .eq('batch_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(50)
        
        if (logs && !logsError) {
          setUpdateLogs(logs.map(log => ({
            asin: log.products?.supplier_asin || 'Unknown',
            status: log.action,
            message: log.error_message || 'Updated successfully',
            created_at: log.created_at
          })))
        }
        
        if (data.session.status === 'completed' || data.session.status === 'cancelled' || data.session.status === 'failed') {
          clearInterval(pollInterval)
          await loadProducts(session.user.id)
          
          if (data.session.status === 'completed') {
            addNotification(`Update completed! Updated: ${data.progress.updated}`, 'success')
          }
        }
      }
    } catch (error) {
      console.error('Error checking update status:', error)
    }
  }

  const handleCancelUpdate = async () => {
    if (!updateSessionId) {
      addNotification('No active update to cancel', 'error')
      return
    }
    
    if (!confirm('Are you sure you want to cancel this update?')) {
      return
    }
    
    try {
      const response = await fetch('/api/amazon/update-hourly', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: updateSessionId })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        addNotification('Update cancelled successfully', 'success')
        setTimeout(async () => {
          await loadProducts(session.user.id)
          setShowUpdateModal(false)
          setUpdateSessionId(null)
        }, 1000)
      } else {
        throw new Error(data.message || 'Cancel failed')
      }
    } catch (error) {
      addNotification(`Failed to cancel: ${error.message}`, 'error')
    }
  }

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
        body: JSON.stringify({ userId: session.user.id, confirmDelete: 'DELETE_ALL_PRODUCTS' })
      })
      const data = await response.json()
      if (response.ok && data.success) {
        addNotification(`Successfully deleted ${data.deletedCounts.products} products`, 'success')
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

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedProducts([])
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id))
    }
    setSelectAll(!selectAll)
  }

  const handleSelectProduct = (productId) => {
    setSelectedProducts(prev => 
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    )
  }

  // Quick Affiliate Link Handlers
  const handleOpenQuickLink = (product) => {
    if (userStores.length === 0) {
      if (confirm('You need to create a store first. Go to Stores page?')) {
        router.push('/stores')
      }
      return
    }
    
    setSelectedProductForLink(product)
    setQuickLinkForm({
      storeId: userStores[0]?.id || '',
      affiliateUrl: product.supplier_url || `https://amazon.com.au/dp/${product.supplier_asin}`
    })
    setShowQuickLinkModal(true)
  }

  const handleSaveQuickLink = async (e) => {
    e.preventDefault()
    
    if (!quickLinkForm.storeId) {
      addNotification('Please select a store', 'error')
      return
    }
    
    if (!quickLinkForm.affiliateUrl) {
      addNotification('Please enter an affiliate URL', 'error')
      return
    }
    
    try {
      // Check if link already exists
      const { data: existing } = await supabase
        .from('affiliate_links')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('store_id', quickLinkForm.storeId)
        .eq('internal_sku', selectedProductForLink.internal_sku)
        .eq('is_active', true)
        .single()
      
      if (existing) {
        addNotification('This product already has a link in this store', 'error')
        return
      }
      
      const { error } = await supabase
        .from('affiliate_links')
        .insert({
          user_id: session.user.id,
          store_id: quickLinkForm.storeId,
          affiliate_url: quickLinkForm.affiliateUrl,
          internal_sku: selectedProductForLink.internal_sku
        })
      
      if (error) throw error
      
      const storeName = userStores.find(s => s.id === quickLinkForm.storeId)?.store_name
      addNotification(`Affiliate link added to ${storeName}!`, 'success')
      setShowQuickLinkModal(false)
      setSelectedProductForLink(null)
      setQuickLinkForm({ storeId: '', affiliateUrl: '' })
    } catch (error) {
      addNotification(`Failed to add link: ${error.message}`, 'error')
    }
  }

  const addNotification = (message, type = 'info') => {
    const notification = { id: Date.now(), message, type }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  const filteredProducts = products.filter(product => {
    const matchesFilter = filter === 'all' || 
      (filter === 'in_stock' && product.stock_status === 'In Stock') ||
      (filter === 'out_of_stock' && product.stock_status === 'Out of Stock') ||
      (filter === 'limited_stock' && product.stock_status === 'Limited Stock')
    const matchesSearch = !searchTerm || 
      product.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.internal_sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.supplier_asin?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const hasVariants = (product) => {
    if (product.metadata?.variation_count && product.metadata.variation_count > 1) {
      return true
    }
    
    try {
      const features = product.features
      if (Array.isArray(features) && features.length > 1) {
        return true
      }
      if (typeof features === 'string') {
        const parsed = JSON.parse(features)
        return Array.isArray(parsed) && parsed.length > 1
      }
    } catch (e) {}
    
    return false
  }

  const getVariantStockSummary = (product) => {
    try {
      const variantsData = typeof product.variants === 'string' 
        ? JSON.parse(product.variants) 
        : product.variants

      if (!variantsData?.options || !Array.isArray(variantsData.options)) {
        return {
          available: product.stock_status === 'In Stock' ? 1 : 0,
          onHold: product.stock_status === 'Limited Stock' ? 1 : 0,
          outOfStock: product.stock_status === 'Out of Stock' ? 1 : 0
        }
      }

      let available = 0
      let onHold = 0
      let outOfStock = 0

      variantsData.options.forEach(variant => {
        if (!variant.stock_status || variant.stock_status === 'Out of Stock' || variant.stock_status === 'Unknown') {
          outOfStock++
        } else if (variant.stock_status === 'Limited Stock') {
          onHold++
        } else if (variant.stock_status === 'In Stock') {
          available++
        }
      })

      return { available, onHold, outOfStock }
    } catch (error) {
      return {
        available: product.stock_status === 'In Stock' ? 1 : 0,
        onHold: product.stock_status === 'Limited Stock' ? 1 : 0,
        outOfStock: product.stock_status === 'Out of Stock' ? 1 : 0
      }
    }
  }

  const handleProductClick = (product) => {
    if (hasVariants(product)) {
      router.push(`/products/${product.id}`)
    } else {
      const url = product.supplier_url || `https://amazon.com.au/dp/${product.supplier_asin}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
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
      <div className="h-full bg-gray-50">
        {/* Toast Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div key={notification.id} className={`p-3 rounded-lg shadow-lg border backdrop-blur-sm ${
                notification.type === 'success' ? 'bg-green-50/95 border-green-200 text-green-800' :
                notification.type === 'error' ? 'bg-red-50/95 border-red-200 text-red-800' :
                'bg-blue-50/95 border-blue-200 text-blue-800'
              }`}>
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Compact Status Bar */}
        {(csvImportStatus === 'processing' || (updateSessionId && updateProgress.total > 0 && !updateProgress.completed)) && (
          <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
            <div className="max-w-7xl mx-auto px-6 py-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  {csvImportStatus === 'processing' && (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 w-2 h-2 bg-white rounded-full animate-ping opacity-75"></div>
                      </div>
                      <div className="text-white">
                        <span className="text-sm font-semibold">CSV Import</span>
                        <span className="text-xs ml-2 opacity-90">
                          {csvImportProgress.processed}/{csvImportProgress.total} ({csvImportProgress.percentage}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/80">
                        <span>✓ {csvImportProgress.imported}</span>
                        <span>↻ {csvImportProgress.updated}</span>
                        <span>✕ {csvImportProgress.failed}</span>
                      </div>
                    </div>
                  )}

                  {updateSessionId && updateProgress.total > 0 && !updateProgress.completed && (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 w-2 h-2 bg-green-300 rounded-full animate-ping opacity-75"></div>
                      </div>
                      <div className="text-white">
                        <span className="text-sm font-semibold">Update</span>
                        <span className="text-xs ml-2 opacity-90">
                          {updateProgress.processed}/{updateProgress.total} ({updateProgress.percentage}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/80">
                        <span>✓ {updateProgress.updated}</span>
                        <span>✕ {updateProgress.failed}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (csvImportStatus === 'processing') setShowImportModal(true)
                      if (updateSessionId) setShowUpdateModal(true)
                    }}
                    className="px-3 py-1 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded transition-colors"
                  >
                    Details
                  </button>
                  {csvImportStatus === 'processing' && (
                    <button
                      onClick={handleCancelImport}
                      className="px-3 py-1 text-xs font-medium text-white bg-red-500/90 hover:bg-red-600 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {updateSessionId && !updateProgress.completed && (
                    <button
                      onClick={handleCancelUpdate}
                      className="px-3 py-1 text-xs font-medium text-white bg-red-500/90 hover:bg-red-600 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completion Toasts */}
        {(csvImportStatus === 'completed' || updateProgress.completed) && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {csvImportStatus === 'completed' && (
              <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-semibold text-sm">CSV Import Complete!</div>
                  <div className="text-xs opacity-90">
                    Imported: {csvImportProgress.imported} • Updated: {csvImportProgress.updated}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCsvImportStatus('idle')
                    setCsvImportProgress({ processed: 0, imported: 0, updated: 0, failed: 0, total: 0, percentage: 0 })
                    setCurrentCsvSession(null)
                  }}
                  className="ml-2 text-white hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            )}
            {updateProgress.completed && (
              <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-semibold text-sm">Update Complete!</div>
                  <div className="text-xs opacity-90">
                    Updated: {updateProgress.updated} • Failed: {updateProgress.failed}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setUpdateProgress({ processed: 0, updated: 0, failed: 0, total: 0, percentage: 0, completed: false })
                    setUpdateSessionId(null)
                  }}
                  className="ml-2 text-white hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add padding when status bar is visible */}
        <div className={`${(csvImportStatus === 'processing' || (updateSessionId && !updateProgress.completed)) ? 'pt-12' : ''}`}></div>

        <div className="bg-white">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900">
                Products <span className="text-gray-400 font-normal">({products.length.toLocaleString()})</span>
              </h1>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleRefresh} 
                  disabled={isRefreshing} 
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button 
                  onClick={() => setShowImportSection(!showImportSection)} 
                  className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Import
                </button>
                <button 
                  onClick={triggerUpdate} 
                  disabled={updateStatus?.status === 'running'}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateStatus?.status === 'running' ? 'Updating...' : 'Update All'}
                </button>
                {products.length > 0 && (
                  <button 
                    onClick={() => setShowDeleteConfirm(true)} 
                    className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Delete All
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Import Section */}
          {showImportSection && (
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="max-w-2xl space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Single Import</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importInput}
                      onChange={(e) => setImportInput(e.target.value)}
                      placeholder="Enter Amazon ASIN or URL"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                      disabled={importStatus === 'importing'}
                    />
                    <button 
                      onClick={handleImport} 
                      disabled={!importInput.trim() || importStatus === 'importing'} 
                      className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importStatus === 'importing' ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">CSV Bulk Import</label>
                  <div className="flex items-center gap-3">
                    <input 
                      id="csv-file-input" 
                      type="file" 
                      accept=".csv" 
                      onChange={handleCsvFileChange} 
                      disabled={csvImportStatus === 'processing'} 
                      className="text-sm"
                    />
                    {csvFile && csvImportStatus === 'idle' && (
                      <button 
                        onClick={handleCsvUpload} 
                        className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                      >
                        Upload
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="px-6 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select 
                  value={filter} 
                  onChange={(e) => setFilter(e.target.value)} 
                  className="text-sm border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Products</option>
                  <option value="in_stock">In Stock</option>
                  <option value="limited_stock">Limited Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
                {selectedProducts.length > 0 && (
                  <span className="text-sm text-gray-500">{selectedProducts.length} selected</span>
                )}
              </div>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded w-64 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Products Table */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white py-16 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <h3 className="mt-3 text-sm font-medium text-gray-900">No products found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || filter !== 'all' ? 'Try adjusting your filters' : 'Get started by importing your first product'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-8 px-4 py-2">
                      <input 
                        type="checkbox" 
                        checked={selectAll} 
                        onChange={handleSelectAll} 
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => handleSelectProduct(product.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-2" style={{ maxWidth: '400px' }}>
                        <div 
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => handleProductClick(product)}
                        >
                          <img 
                            src={product.image_urls?.[0] || 'https://via.placeholder.com/40'} 
                            alt="" 
                            className="w-10 h-10 rounded object-cover flex-shrink-0" 
                            onError={(e) => e.target.src = 'https://via.placeholder.com/40'} 
                          />
                          <div className="min-w-0" style={{ maxWidth: '340px' }}>
                            <p className="text-[11px] font-medium text-gray-900 truncate leading-tight mb-0.5" title={product.title}>
                              {product.title}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">
                              {product.brand} • {product.supplier_asin}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-[11px] text-gray-600">
                          {new Date(product.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px] text-gray-600">
                            {product.last_scraped ? (
                              new Date(product.last_scraped).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            ) : 'Never'}
                          </span>
                          {(() => {
                            if (!product.last_scraped) return null
                            
                            const lastScraped = new Date(product.last_scraped).getTime()
                            const now = Date.now()
                            const minutesAgo = Math.floor((now - lastScraped) / 60000)
                            const hoursAgo = Math.floor(minutesAgo / 60)
                            const daysAgo = Math.floor(hoursAgo / 24)
                            
                            let timeAgo = ''
                            let colorClass = 'text-gray-500'
                            
                            if (minutesAgo < 5) {
                              timeAgo = 'Just now'
                              colorClass = 'text-green-600'
                            } else if (minutesAgo < 60) {
                              timeAgo = `${minutesAgo}m ago`
                              colorClass = 'text-green-600'
                            } else if (hoursAgo < 24) {
                              timeAgo = `${hoursAgo}h ago`
                              colorClass = hoursAgo < 2 ? 'text-green-600' : 'text-yellow-600'
                            } else if (daysAgo < 7) {
                              timeAgo = `${daysAgo}d ago`
                              colorClass = 'text-orange-600'
                            } else {
                              timeAgo = `${Math.floor(daysAgo / 7)}w ago`
                              colorClass = 'text-red-600'
                            }
                            
                            return (
                              <span className={`text-[11px] font-medium ${colorClass}`}>
                                {timeAgo}
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          product.stock_status === 'In Stock' ? 'bg-green-100 text-green-800' :
                          product.stock_status === 'Limited Stock' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {product.stock_status === 'In Stock' ? 'In Stock' :
                          product.stock_status === 'Limited Stock' ? 'Limited' : 'Out of Stock'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          {(() => {
                            const stockSummary = getVariantStockSummary(product)
                            const totalVariants = stockSummary.available + stockSummary.onHold + stockSummary.outOfStock
                            
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <div className="text-[10px] font-medium text-gray-600">
                                  {totalVariants} {totalVariants === 1 ? 'variant' : 'variants'}
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  <div className="flex flex-col items-center">
                                    <div className={`w-8 h-6 flex items-center justify-center text-[11px] font-bold rounded ${
                                      stockSummary.available > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                                    }`}>
                                      {stockSummary.available}
                                    </div>
                                    <span className="text-[8px] text-gray-500 mt-0.5">Avail</span>
                                  </div>
                                  
                                  <div className="flex flex-col items-center">
                                    <div className={`w-8 h-6 flex items-center justify-center text-[11px] font-bold rounded ${
                                      stockSummary.onHold > 0 ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-400'
                                    }`}>
                                      {stockSummary.onHold}
                                    </div>
                                    <span className="text-[8px] text-gray-500 mt-0.5">Hold</span>
                                  </div>
                                  
                                  <div className="flex flex-col items-center">
                                    <div className={`w-8 h-6 flex items-center justify-center text-[11px] font-bold rounded ${
                                      stockSummary.outOfStock > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'
                                    }`}>
                                      {stockSummary.outOfStock}
                                    </div>
                                    <span className="text-[8px] text-gray-500 mt-0.5">Out</span>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="space-y-0.5">
                          <div className="text-xs text-gray-500">
                            Buy: <span className="font-semibold text-gray-900">${product.supplier_price?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Sell: <span className="font-semibold text-gray-900">${product.our_price?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="text-xs font-semibold text-green-600">
                            +${((product.our_price || 0) - (product.supplier_price || 0)).toFixed(2)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          {updatingProducts.has(product.id) ? (
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span className="text-xs text-blue-600 font-medium">Updating...</span>
                              <button
                                onClick={() => {
                                  const controller = abortControllers.current.get(product.id)
                                  if (controller) {
                                    controller.abort()
                                  }
                                }}
                                className="text-xs text-red-600 hover:text-red-700 font-medium ml-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleOpenQuickLink(product)} 
                                className="text-xs text-green-600 hover:text-green-700 font-medium"
                                title="Add to Store"
                              >
                                Link
                              </button>
                              <button 
                                onClick={() => handleUpdateSingleProduct(product.id)} 
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                              >
                                Update
                              </button>
                              <a 
                                href={product.supplier_url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                              >
                                View
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Affiliate Link Modal */}
        {showQuickLinkModal && selectedProductForLink && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Add Affiliate Link</h3>
                  <button
                    onClick={() => {
                      setShowQuickLinkModal(false)
                      setSelectedProductForLink(null)
                      setQuickLinkForm({ storeId: '', affiliateUrl: '' })
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveQuickLink} className="p-6 space-y-4">
                {/* Product Preview */}
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <img 
                    src={selectedProductForLink.image_urls?.[0] || 'https://via.placeholder.com/50'} 
                    alt={selectedProductForLink.title}
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                    onError={(e) => e.target.src = 'https://via.placeholder.com/50'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2">{selectedProductForLink.title}</p>
                    <p className="text-xs text-gray-600">{selectedProductForLink.brand} • {selectedProductForLink.supplier_asin}</p>
                  </div>
                </div>

                {/* Store Selection - FIRST */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Store <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={quickLinkForm.storeId}
                    onChange={(e) => setQuickLinkForm({...quickLinkForm, storeId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Choose a store...</option>
                    {userStores.map(store => (
                      <option key={store.id} value={store.id}>{store.store_name}</option>
                    ))}
                  </select>
                  {/* <p className="text-xs text-gray-500 mt-1.5">
                    You can add the same product to multiple stores with different links
                  </p> */}
                </div>

                {/* Affiliate URL - SECOND */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Affiliate URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    // value={quickLinkForm.affiliateUrl}
                    onChange={(e) => setQuickLinkForm({...quickLinkForm, affiliateUrl: e.target.value})}
                    placeholder="https://amzn.to/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  {/* <p className="text-xs text-gray-500 mt-1.5">
                    Use your Amazon Associates short link (amzn.to) or full affiliate URL
                  </p> */}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickLinkModal(false)
                      setSelectedProductForLink(null)
                      setQuickLinkForm({ storeId: '', affiliateUrl: '' })
                    }}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Add Link
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Update Confirmation Modal */}
        {showUpdateConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Update All Products</h3>
              </div>
              <div className="p-6">
                <div className="flex items-start mb-4">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-gray-700 mb-2">
                      This will scrape fresh data from Amazon for all {products.length} active products.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                      <p className="text-xs text-blue-800 font-medium mb-1">⚠️ This action will:</p>
                      <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                        <li>Make {products.length} API calls to Amazon</li>
                        <li>Take approximately {Math.ceil(products.length / 5 * 2)} minutes</li>
                        <li>Update prices, stock, and ratings</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowUpdateConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUpdate}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Start Update
                </button>
              </div>
            </div>
          </div>
        )}
{/* Update Progress Modal */}
{showUpdateModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Update Progress</h3>
          {updateSessionId && (
  <p className="text-sm text-gray-500 mt-0.5">
    Session #{updateSessionId.toString().slice(-8)}
  </p>
)}
        </div>
        <button 
          onClick={() => setShowUpdateModal(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
        {/* Progress Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total</div>
            <div className="text-3xl font-bold text-blue-700">{updateProgress.total}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <div className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Updated</div>
            <div className="text-3xl font-bold text-green-700">{updateProgress.updated}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-100">
            <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Failed</div>
            <div className="text-3xl font-bold text-red-700">{updateProgress.failed}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Progress</span>
            <span className="text-sm font-semibold text-gray-900">{updateProgress.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${updateProgress.percentage}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {updateProgress.processed} of {updateProgress.total} processed
          </div>
        </div>

        {/* Activity Log */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Real-time Activity</h4>
          </div>
          
          <div className="bg-white max-h-96 overflow-y-auto">
            {updateLogs.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {updateLogs.map((log, idx) => (
                  <div 
                    key={idx} 
                    className={`px-4 py-3 flex items-center justify-between ${
                      log.status === 'success' ? 'bg-green-50/30' :
                      log.status === 'error' ? 'bg-red-50/30' : 'bg-blue-50/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-shrink-0">
                        {log.status === 'success' && (
                          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                        {log.status === 'error' && (
                          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-mono font-semibold text-gray-900">{log.asin}</span>
                        <span className="text-gray-400 mx-2">•</span>
                        <span className="text-sm text-gray-600">{log.message}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm text-gray-500">Waiting for updates...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
        {updateProgress.percentage < 100 ? (
          <button 
            onClick={handleCancelUpdate}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
          >
            Cancel Update
          </button>
        ) : (
          <span></span>
        )}
        <button 
          onClick={() => setShowUpdateModal(false)}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 ml-auto"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
        {/* Import Details Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Import Progress</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Session #{currentCsvSession?.toString().slice(-8)}
                  </p>
                </div>
                <button 
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total</div>
                    <div className="text-3xl font-bold text-blue-700">{csvImportProgress.total}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <div className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Imported</div>
                    <div className="text-3xl font-bold text-green-700">{csvImportProgress.imported}</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                    <div className="text-xs font-medium text-yellow-600 uppercase tracking-wide mb-1">Updated</div>
                    <div className="text-3xl font-bold text-yellow-700">{csvImportProgress.updated}</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                    <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Failed</div>
                    <div className="text-3xl font-bold text-red-700">{csvImportProgress.failed}</div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                    <span className="text-sm font-semibold text-gray-900">{csvImportProgress.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${csvImportProgress.percentage}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>{csvImportProgress.processed} of {csvImportProgress.total} processed</span>
                    <span>Batch {Math.ceil(csvImportProgress.processed / 5)}/{Math.ceil(csvImportProgress.total / 5)}</span>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">Real-time Activity</h4>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-xs text-green-600 font-medium">Live</span>
                    </div>
                  </div>
                  
                  <div className="bg-white max-h-96 overflow-y-auto">
                    {csvImportDetails.length > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {csvImportDetails.slice(0, 50).map((detail, idx) => (
                          <div 
                            key={idx} 
                            className={`px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                              detail.status === 'success' ? 'border-l-2 border-green-500 bg-green-50/30' :
                              detail.status === 'error' ? 'border-l-2 border-red-500 bg-red-50/30' :
                              'border-l-2 border-blue-500 bg-blue-50/30'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="flex-shrink-0">
                                {detail.status === 'success' && (
                                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                )}
                                {detail.status === 'error' && (
                                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                  </svg>
                                )}
                                {detail.status === 'processing' && (
                                  <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-semibold text-gray-900">{detail.asin}</span>
                                  <span className="text-gray-400">•</span>
                                  <span className="text-sm text-gray-600 truncate">{detail.message}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 ml-4">
                              <span className="text-xs text-gray-400">
                                {new Date(detail.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-16 px-4 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
                          <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-1">Processing imports...</p>
                        <p className="text-xs text-gray-500">
                          Scraping Amazon AU products • Batch {Math.ceil(csvImportProgress.processed / 5)}/{Math.ceil(csvImportProgress.total / 5)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                {(csvImportStatus === 'processing' || csvImportStatus === 'running') && (
                  <button 
                    onClick={handleCancelImport}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
                  >
                    Cancel Import
                  </button>
                )}
                {csvImportStatus === 'cancelled' && (
                  <span className="text-sm text-gray-600">Import cancelled</span>
                )}
                {(csvImportStatus === 'idle' || csvImportStatus === 'completed') && (
                  <span></span>
                )}
                <button 
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Delete All Products</h3>
              </div>
              <div className="p-6">
                <div className="flex items-start mb-4">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-gray-700">
                      This will permanently delete all {products.length} products and their associated data.
                    </p>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type DELETE_ALL_PRODUCTS to confirm:
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-red-500"
                        placeholder="DELETE_ALL_PRODUCTS"
                        disabled={isDeleting}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteConfirmText('')
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteConfirmText !== 'DELETE_ALL_PRODUCTS' || isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete All Products'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}