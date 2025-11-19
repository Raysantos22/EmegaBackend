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
const [expandedLog, setExpandedLog] = useState(null)
const [hasCompletedReload, setHasCompletedReload] = useState(false)
const [completedSessions, setCompletedSessions] = useState(new Set())
const [showImportHistory, setShowImportHistory] = useState(false)
const [importHistory, setImportHistory] = useState([])
const [loadingHistory, setLoadingHistory] = useState(false)
const [selectedHistorySession, setSelectedHistorySession] = useState(null)

  const [persistedStatus, setPersistedStatus] = useState({
    csvImport: null,
    update: null
  })

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
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  const router = useRouter()

  const saveStatus = (type, data) => {
    setPersistedStatus(prev => ({
      ...prev,
      [type]: data ? {
        ...data,
        savedAt: Date.now()
      } : null
    }))
  }

  // Clear status from memory
  const clearStatus = (type) => {
    setPersistedStatus(prev => ({
      ...prev,
      [type]: null
    }))
  }
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

  // ✅ REPLACE YOUR EXISTING FIRST useEffect WITH THIS
  useEffect(() => {
    // Restore persisted statuses on mount
    if (persistedStatus.csvImport && persistedStatus.csvImport.status === 'processing') {
      setCsvImportStatus(persistedStatus.csvImport.status)
      setCsvImportProgress(persistedStatus.csvImport.progress)
      setCurrentCsvSession(persistedStatus.csvImport.sessionId)
    }
    
    if (persistedStatus.update && persistedStatus.update.status === 'processing') {
      setUpdateSessionId(persistedStatus.update.sessionId)
      setUpdateProgress(persistedStatus.update.progress)
    }

    checkUser()
    
    const interval = setInterval(() => {
      if (session?.user?.id) {
        // Only poll if there are active operations
        if (currentCsvSession || updateSessionId) {
          checkCsvImportStatus(session.user.id)
        }
      }
    }, 3000) // Changed to 3 seconds for faster updates
    
    return () => clearInterval(interval)
  }, [checkUser, session?.user?.id, currentCsvSession, updateSessionId]) // ✅ Added dependencies

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

 // ✅ REPLACE YOUR EXISTING checkCsvImportStatus FUNCTION
  // Add these debug console.logs to your checkCsvImportStatus function:

const checkCsvImportStatus = async (userId) => {
  try {
    const sessionParam = currentCsvSession ? `&sessionId=${currentCsvSession}` : ''
    const response = await fetch(`/api/amazon/csv-import-status?userId=${userId}${sessionParam}`)
    const data = await response.json()
    
    if (data.success && data.session) {
      const previousStatus = csvImportStatus
      const newStatus = data.session.status === 'running' ? 'processing' : data.session.status
      
      setCsvImportStatus(newStatus)
      setCsvImportProgress(data.progress)
      
      if (data.importDetails && Array.isArray(data.importDetails)) {
        setCsvImportDetails(data.importDetails)
      }
      
      if (!currentCsvSession && data.session.id && newStatus === 'processing') {
        setCurrentCsvSession(data.session.id)
      }
      
      if (newStatus === 'processing') {
        saveStatus('csvImport', {
          sessionId: data.session.id,
          status: newStatus,
          progress: data.progress
        })
      }
      
      // ✅ Handle completion - ONLY RELOAD ONCE per session
      if ((newStatus === 'completed' || newStatus === 'failed') && previousStatus === 'processing') {
        const sessionKey = `${data.session.id}`
        
        if (!completedSessions.has(sessionKey)) {
          console.log('[COMPLETION] Reloading products once for session:', sessionKey)
          setCompletedSessions(prev => new Set(prev).add(sessionKey))
          await loadProducts(userId)
          
          if (newStatus === 'completed') {
            addNotification(`CSV import completed! Imported: ${data.progress.imported}, Skipped: ${data.progress.updated}`, 'success')
          }
          
          // Auto-dismiss after 10 seconds
          setTimeout(() => {
            setCsvImportStatus('idle')
            setCurrentCsvSession(null)
            clearStatus('csvImport')
          }, 10000)
        }
      }
    }
  } catch (error) {
    console.error('[FRONTEND] Error checking CSV import status:', error)
  }
}

// Also add debug to your modal render - check if logs are present:
// Add this right before your log mapping in the modal:
{console.log('[MODAL RENDER] csvImportDetails:', csvImportDetails.length, 'items')}
{console.log('[MODAL RENDER] First 3 logs:', csvImportDetails.slice(0, 3))}
const loadImportHistory = async () => {
  if (!session?.user?.id) return
  
  setLoadingHistory(true)
  try {
    const { data, error } = await supabase
      .from('csv_import_sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('started_at', { ascending: false })
      .limit(50)
    
    if (error) throw error
    setImportHistory(data || [])
  } catch (error) {
    console.error('Error loading import history:', error)
    addNotification('Failed to load import history', 'error')
  } finally {
    setLoadingHistory(false)
  }
}

// 3. Add this function to view details of a specific session
const viewSessionDetails = async (sessionId) => {
  try {
    const response = await fetch(`/api/amazon/csv-import-status?userId=${session.user.id}&sessionId=${sessionId}`)
    const data = await response.json()
    
    if (data.success) {
      setSelectedHistorySession({
        ...data.session,
        progress: data.progress,
        logs: data.importDetails
      })
    }
  } catch (error) {
    console.error('Error loading session details:', error)
    addNotification('Failed to load session details', 'error')
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
        
        // ✅ SAVE TO PERSISTENT STORAGE IMMEDIATELY
        saveStatus('csvImport', {
          sessionId: data.sessionId,
          status: 'processing',
          progress: {
            processed: 0,
            imported: 0,
            updated: 0,
            failed: 0,
            total: data.totalSkus,
            percentage: 0
          }
        })
        
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
        
        // ✅ KEEP CANCELLED STATUS VISIBLE FOR 60 SECONDS
        setTimeout(async () => {
          await loadProducts(session.user.id)
          setShowImportModal(false)
          setCurrentCsvSession(null)
          setCsvImportStatus('idle')
          clearStatus('csvImport')
        }, 60000)
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

// Pagination calculations
const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
const startIndex = (currentPage - 1) * itemsPerPage
const endIndex = startIndex + itemsPerPage
const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

// Reset to page 1 when filters change
useEffect(() => {
  setCurrentPage(1)
}, [filter, searchTerm])

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

      {/* Compact Status Bar - Shows for active AND recently completed operations */}
      {((csvImportStatus && ['processing', 'uploading', 'running', 'completed', 'cancelled'].includes(csvImportStatus)) || 
        (updateSessionId && updateProgress.total > 0)) && (
        <div className={`fixed top-0 left-0 right-0 z-40 shadow-lg ${
          csvImportStatus === 'completed' || (updateProgress.completed && updateSessionId) 
            ? 'bg-gradient-to-r from-green-600 to-emerald-600'
            : csvImportStatus === 'cancelled'
            ? 'bg-gradient-to-r from-gray-600 to-gray-700'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600'
        }`}>
          <div className="max-w-7xl mx-auto px-6 py-2">
            <div className="flex items-center justify-between gap-4">
              {/* Left Side: Status Information */}
              <div className="flex items-center gap-6">
                {/* CSV Import Status */}
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

                {/* CSV Import Completed */}
                {csvImportStatus === 'completed' && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div className="text-white">
                      <span className="text-sm font-semibold">CSV Import Complete!</span>
                      <span className="text-xs ml-2 opacity-90">
                        Imported: {csvImportProgress.imported} • Updated: {csvImportProgress.updated}
                      </span>
                    </div>
                  </div>
                )}

                {/* CSV Import Cancelled */}
                {csvImportStatus === 'cancelled' && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="text-white">
                      <span className="text-sm font-semibold">CSV Import Cancelled</span>
                    </div>
                  </div>
                )}

                {/* Update Status */}
                {updateSessionId && updateProgress.total > 0 && !updateProgress.completed && csvImportStatus !== 'processing' && (
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

                {/* Update Completed */}
                {updateProgress.completed && updateSessionId && csvImportStatus !== 'processing' && csvImportStatus !== 'completed' && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div className="text-white">
                      <span className="text-sm font-semibold">Update Complete!</span>
                      <span className="text-xs ml-2 opacity-90">
                        Updated: {updateProgress.updated} • Failed: {updateProgress.failed}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Details Button for Active Operations */}
                {(csvImportStatus === 'processing' || (updateSessionId && !updateProgress.completed)) && (
                  <button
                    onClick={() => {
                      if (csvImportStatus === 'processing') setShowImportModal(true)
                      if (updateSessionId && !updateProgress.completed) setShowUpdateModal(true)
                    }}
                    className="px-3 py-1 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded transition-colors"
                  >
                    Details
                  </button>
                )}

                {/* Cancel Button for CSV Import */}
                {csvImportStatus === 'processing' && (
                  <button
                    onClick={handleCancelImport}
                    className="px-3 py-1 text-xs font-medium text-white bg-red-500/90 hover:bg-red-600 rounded transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {/* Cancel Button for Update */}
                {updateSessionId && !updateProgress.completed && csvImportStatus !== 'processing' && (
                  <button
                    onClick={handleCancelUpdate}
                    className="px-3 py-1 text-xs font-medium text-white bg-red-500/90 hover:bg-red-600 rounded transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {/* Dismiss Button for Completed CSV Import */}
                {(csvImportStatus === 'completed' || csvImportStatus === 'cancelled') && (
                  <button
                    onClick={() => {
                      setCsvImportStatus('idle')
                      setCurrentCsvSession(null)
                      clearStatus('csvImport')
                    }}
                    className="px-3 py-1 text-xs font-medium text-white hover:bg-white/20 rounded transition-colors"
                  >
                    Dismiss
                  </button>
                )}

                {/* Dismiss Button for Completed Update */}
                {updateProgress.completed && updateSessionId && csvImportStatus !== 'completed' && csvImportStatus !== 'cancelled' && (
                  <button
                    onClick={() => {
                      setUpdateProgress({ processed: 0, updated: 0, failed: 0, total: 0, percentage: 0, completed: false })
                      setUpdateSessionId(null)
                      clearStatus('update')
                    }}
                    className="px-3 py-1 text-xs font-medium text-white hover:bg-white/20 rounded transition-colors"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Add padding when status bar is visible */}
      <div className={`${((csvImportStatus && ['processing', 'uploading', 'running', 'completed', 'cancelled'].includes(csvImportStatus)) || (updateSessionId && updateProgress.total > 0)) ? 'pt-12' : ''}`}></div>

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
                onClick={() => {
                  setShowImportHistory(true)
                  loadImportHistory()
                }}
                className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Import History
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
  <>
    {/* Desktop Table View */}
    <div className="hidden lg:block overflow-x-auto">
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
          {paginatedProducts.map((product) => (
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

    {/* Mobile Card View */}
    <div className="lg:hidden divide-y divide-gray-200">
      {paginatedProducts.map((product) => (
        <div key={product.id} className="p-4 hover:bg-gray-50">
          <div className="flex items-start gap-3 mb-3">
            <input 
              type="checkbox" 
              checked={selectedProducts.includes(product.id)}
              onChange={() => handleSelectProduct(product.id)}
              className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <img 
              src={product.image_urls?.[0] || 'https://via.placeholder.com/60'} 
              alt="" 
              className="w-16 h-16 rounded object-cover flex-shrink-0" 
              onError={(e) => e.target.src = 'https://via.placeholder.com/60'} 
            />
            <div className="flex-1 min-w-0">
              <h3 
                className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1 cursor-pointer"
                onClick={() => handleProductClick(product)}
              >
                {product.title}
              </h3>
              <p className="text-xs text-gray-500 mb-2">
                {product.brand} • {product.supplier_asin}
              </p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                product.stock_status === 'In Stock' ? 'bg-green-100 text-green-800' :
                product.stock_status === 'Limited Stock' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {product.stock_status === 'In Stock' ? 'In Stock' :
                product.stock_status === 'Limited Stock' ? 'Limited' : 'Out of Stock'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
            <div>
              <span className="text-gray-500">Uploaded:</span>
              <span className="ml-1 text-gray-900">
                {new Date(product.created_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric'
                })}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Updated:</span>
              <span className="ml-1 text-gray-900">
                {product.last_scraped ? (
                  new Date(product.last_scraped).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric'
                  })
                ) : 'Never'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
            <div className="text-xs">
              <div className="text-gray-500">
                Buy: <span className="font-semibold text-gray-900">${product.supplier_price?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="text-gray-500">
                Sell: <span className="font-semibold text-gray-900">${product.our_price?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="font-semibold text-green-600">
                +${((product.our_price || 0) - (product.supplier_price || 0)).toFixed(2)}
              </div>
            </div>

            {(() => {
              const stockSummary = getVariantStockSummary(product)
              const totalVariants = stockSummary.available + stockSummary.onHold + stockSummary.outOfStock
              
              return (
                <div className="flex flex-col items-end">
                  <div className="text-xs font-medium text-gray-600 mb-1">
                    {totalVariants} {totalVariants === 1 ? 'variant' : 'variants'}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-6 flex items-center justify-center text-xs font-bold rounded ${
                        stockSummary.available > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {stockSummary.available}
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-6 flex items-center justify-center text-xs font-bold rounded ${
                        stockSummary.onHold > 0 ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {stockSummary.onHold}
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-6 flex items-center justify-center text-xs font-bold rounded ${
                        stockSummary.outOfStock > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {stockSummary.outOfStock}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className="flex items-center justify-end gap-2">
            {updatingProducts.has(product.id) ? (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs text-blue-600 font-medium">Updating...</span>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => handleOpenQuickLink(product)} 
                  className="px-3 py-1.5 text-xs text-white bg-green-600 hover:bg-green-700 rounded font-medium"
                >
                  Link
                </button>
                <button 
                  onClick={() => handleUpdateSingleProduct(product.id)} 
                  className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded font-medium"
                >
                  Update
                </button>
                <a 
                  href={product.supplier_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="px-3 py-1.5 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 rounded font-medium"
                >
                  View
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>

    {/* Pagination */}
    {totalPages > 1 && (
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Items per page selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Show:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-700">
              items per page
            </span>
          </div>

          {/* Page info */}
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
            <span className="font-medium">{Math.min(endIndex, filteredProducts.length)}</span> of{' '}
            <span className="font-medium">{filteredProducts.length}</span> products
          </div>

          {/* Pagination controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 text-sm font-medium rounded ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            {/* Current page indicator for mobile */}
            <div className="sm:hidden px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded">
              {currentPage} / {totalPages}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    )}
  </>
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
{showImportHistory && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="flex items-center justify-between">
          <div className="text-white">
            <h3 className="text-lg font-bold">Import History</h3>
            <p className="text-sm text-indigo-100 mt-0.5">View all your CSV import sessions</p>
          </div>
          <button
            onClick={() => {
              setShowImportHistory(false)
              setSelectedHistorySession(null)
            }}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
        {loadingHistory ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : selectedHistorySession ? (
          // Session Details View
          <div>
            <button
              onClick={() => setSelectedHistorySession(null)}
              className="mb-4 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to History
            </button>

            {/* Session Details */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-indigo-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-xl font-bold text-gray-900">
                    Session #{selectedHistorySession.id?.toString().slice(-8)}
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(selectedHistorySession.started_at).toLocaleString()}
                  </p>
                </div>
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  selectedHistorySession.status === 'completed' ? 'bg-green-100 text-green-700' :
                  selectedHistorySession.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  selectedHistorySession.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {selectedHistorySession.status.charAt(0).toUpperCase() + selectedHistorySession.status.slice(1)}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-lg p-3 border border-indigo-200">
                  <div className="text-xs text-gray-600 mb-1">Total</div>
                  <div className="text-2xl font-bold text-gray-900">{selectedHistorySession.progress.total}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <div className="text-xs text-gray-600 mb-1">Imported</div>
                  <div className="text-2xl font-bold text-green-600">{selectedHistorySession.progress.imported}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-yellow-200">
                  <div className="text-xs text-gray-600 mb-1">Skipped</div>
                  <div className="text-2xl font-bold text-yellow-600">{selectedHistorySession.progress.updated}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-red-200">
                  <div className="text-xs text-gray-600 mb-1">Failed</div>
                  <div className="text-2xl font-bold text-red-600">{selectedHistorySession.progress.failed}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-purple-200">
                  <div className="text-xs text-gray-600 mb-1">Progress</div>
                  <div className="text-2xl font-bold text-purple-600">{selectedHistorySession.progress.percentage}%</div>
                </div>
              </div>
            </div>

            {/* Logs */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-800 px-4 py-3">
                <h5 className="text-sm font-semibold text-white">Activity Logs ({selectedHistorySession.logs?.length || 0})</h5>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                {selectedHistorySession.logs && selectedHistorySession.logs.length > 0 ? (
                  selectedHistorySession.logs.map((log, idx) => (
                    <div key={idx} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <span className={`w-2 h-2 rounded-full ${
                            log.status === 'success' ? 'bg-green-500' :
                            log.status === 'error' ? 'bg-red-500' :
                            log.status === 'skipped' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`}></span>
                          <span className="font-mono text-sm font-semibold text-gray-900">{log.asin}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            log.status === 'success' ? 'bg-green-100 text-green-700' :
                            log.status === 'error' ? 'bg-red-100 text-red-700' :
                            log.status === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 ml-5">{log.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-gray-500">
                    <p>No logs available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // History List View
          <div>
            {importHistory.length === 0 ? (
              <div className="text-center py-16">
                <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No import history</h3>
                <p className="mt-2 text-sm text-gray-500">Start your first CSV import to see history here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {importHistory.map((historySession) => {
                  const duration = historySession.completed_at 
                    ? Math.round((new Date(historySession.completed_at) - new Date(historySession.started_at)) / 1000)
                    : null

                  return (
                    <div
                      key={historySession.id}
                      className="bg-gradient-to-r from-white to-gray-50 rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => viewSessionDetails(historySession.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-semibold text-gray-900">
                              Session #{historySession.id?.toString().slice(-8)}
                            </h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              historySession.status === 'completed' ? 'bg-green-100 text-green-700' :
                              historySession.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                              historySession.status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {historySession.status.charAt(0).toUpperCase() + historySession.status.slice(1)}
                            </span>
                          </div>

                          <div className="flex items-center gap-6 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {new Date(historySession.started_at).toLocaleDateString()} at {new Date(historySession.started_at).toLocaleTimeString()}
                            </div>
                            {duration !== null && (
                              <div className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                {duration}s
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-xs text-gray-500">Total</div>
                            <div className="text-lg font-bold text-gray-900">{historySession.total_skus}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500">Imported</div>
                            <div className="text-lg font-bold text-green-600">{historySession.imported_products || 0}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500">Skipped</div>
                            <div className="text-lg font-bold text-yellow-600">{historySession.updated_products || 0}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500">Failed</div>
                            <div className="text-lg font-bold text-red-600">{historySession.failed_skus || 0}</div>
                          </div>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
        <span className="text-sm text-gray-600">
          {importHistory.length} session{importHistory.length !== 1 ? 's' : ''} found
        </span>
        <button
          onClick={() => {
            setShowImportHistory(false)
            setSelectedHistorySession(null)
          }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
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
    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="text-white">
          <h3 className="text-lg font-semibold">CSV Import Progress</h3>
          <p className="text-sm text-blue-100 mt-0.5">
            Session #{currentCsvSession?.toString().slice(-8)} • Live Activity Feed
          </p>
        </div>
        <button 
          onClick={() => setShowImportModal(false)}
          className="text-white/80 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] bg-gray-50">
        {/* Real-time Progress Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {/* Total */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Total</div>
              <svg className="w-5 h-5 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-3xl font-bold">{csvImportProgress.total}</div>
            <div className="text-xs mt-1 opacity-90">Products in queue</div>
          </div>
          
          {/* Imported */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white shadow-lg relative overflow-hidden">
            {csvImportProgress.imported > 0 && (
              <div className="absolute inset-0 bg-white/20 animate-pulse-fast"></div>
            )}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Imported</div>
                <svg className="w-5 h-5 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-3xl font-bold">{csvImportProgress.imported}</div>
              <div className="text-xs mt-1 opacity-90">Successfully added</div>
            </div>
          </div>
          
          {/* Skipped */}
          <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-4 text-white shadow-lg relative overflow-hidden">
            {csvImportProgress.updated > 0 && (
              <div className="absolute inset-0 bg-white/20 animate-pulse-fast"></div>
            )}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Skipped</div>
                <svg className="w-5 h-5 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </div>
              <div className="text-3xl font-bold">{csvImportProgress.updated}</div>
              <div className="text-xs mt-1 opacity-90">Already existed</div>
            </div>
          </div>
          
          {/* Failed */}
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-4 text-white shadow-lg relative overflow-hidden">
            {csvImportProgress.failed > 0 && (
              <div className="absolute inset-0 bg-white/20 animate-pulse-fast"></div>
            )}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Failed</div>
                <svg className="w-5 h-5 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-3xl font-bold">{csvImportProgress.failed}</div>
              <div className="text-xs mt-1 opacity-90">Errors occurred</div>
            </div>
          </div>

          {/* Processing */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white shadow-lg relative overflow-hidden">
            {csvImportStatus === 'processing' && (
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            )}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Processing</div>
                {csvImportStatus === 'processing' && (
                  <svg className="w-5 h-5 opacity-75 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </div>
              <div className="text-3xl font-bold">{csvImportProgress.processed}</div>
              <div className="text-xs mt-1 opacity-90">Currently processing</div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 bg-white rounded-lg p-4 shadow border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold text-gray-900">Overall Progress</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Processing batch {Math.ceil(csvImportProgress.processed / 5)}/{Math.ceil(csvImportProgress.total / 5)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-600">{csvImportProgress.percentage}%</span>
              <p className="text-xs text-gray-500 mt-0.5">
                {csvImportProgress.processed}/{csvImportProgress.total} processed
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500 relative overflow-hidden"
                style={{ width: `${csvImportProgress.percentage}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Clickable Live Activity Log */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-bold text-white">Live Activity Log</h4>
              <div className="flex items-center gap-2 px-2 py-1 bg-green-500/20 rounded-full border border-green-400/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs text-green-300 font-semibold">LIVE</span>
              </div>
            </div>
            <div className="text-xs text-gray-400">
              {csvImportDetails.length} activities
            </div>
          </div>
          
          <div className="max-h-[500px] overflow-y-auto bg-gray-900">
            {csvImportDetails.length > 0 ? (
              <div className="divide-y divide-gray-800">
                {csvImportDetails.slice(0, 100).map((detail, idx) => {
                  const isLatest = idx === 0
                  const isExpanded = expandedLog === idx
                  
                  const statusConfig = {
                    success: { 
                      bg: 'bg-green-500/10 hover:bg-green-500/20', 
                      border: 'border-l-4 border-green-500',
                      icon: (
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ),
                      textColor: 'text-green-300',
                      badge: 'bg-green-500/20 text-green-300 border-green-500/30'
                    },
                    error: { 
                      bg: 'bg-red-500/10 hover:bg-red-500/20', 
                      border: 'border-l-4 border-red-500',
                      icon: (
                        <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      ),
                      textColor: 'text-red-300',
                      badge: 'bg-red-500/20 text-red-300 border-red-500/30'
                    },
                    processing: { 
                      bg: 'bg-blue-500/10 hover:bg-blue-500/20', 
                      border: 'border-l-4 border-blue-500',
                      icon: (
                        <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ),
                      textColor: 'text-blue-300',
                      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    },
                    skipped: { 
                      bg: 'bg-yellow-500/10 hover:bg-yellow-500/20', 
                      border: 'border-l-4 border-yellow-500',
                      icon: (
                        <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                      ),
                      textColor: 'text-yellow-300',
                      badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                    }
                  }

                  const config = statusConfig[detail.status] || statusConfig.processing

                  return (
                    <div 
                      key={`${detail.asin}-${idx}-${detail.timestamp}`}
                      className={`transition-all duration-300 ${config.bg} ${config.border} ${
                        isLatest ? 'animate-pulse-once' : ''
                      } ${isExpanded ? 'bg-gray-800' : ''}`}
                    >
                      {/* Clickable Log Entry */}
                      <div 
                        className="px-4 py-3 flex items-start gap-4 cursor-pointer"
                        onClick={() => setExpandedLog(isExpanded ? null : idx)}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {config.icon}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-mono font-bold text-white">
                              {detail.asin}
                            </span>
                            <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${config.badge}`}>
                              {detail.status}
                            </span>
                            {isLatest && (
                              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded-full animate-pulse">
                                NEW
                              </span>
                            )}
                            <svg 
                              className={`w-4 h-4 text-gray-400 transition-transform ml-auto ${isExpanded ? 'rotate-180' : ''}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                          <p className={`text-sm ${config.textColor} leading-relaxed`}>
                            {detail.message}
                          </p>
                        </div>
                        
                        <div className="flex-shrink-0 text-right">
                          <span className="text-xs text-gray-500 font-mono">
                            {new Date(detail.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isExpanded && detail.details && (
                        <div className="px-4 pb-4 ml-9 border-t border-gray-700 pt-3 mt-2">
                          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                            <h5 className="text-xs font-semibold text-gray-400 uppercase mb-2">Import Details</h5>
                            <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(detail.details, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-20 px-4 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/20 mb-4">
                  <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-base font-semibold text-white mb-2">Initializing import session...</p>
                <p className="text-sm text-gray-400">
                  Connecting to Amazon AU • Preparing scrapers • Starting batch processing
                </p>
                <div className="mt-6 flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
        {(csvImportStatus === 'processing' || csvImportStatus === 'running') && (
          <button 
            onClick={handleCancelImport}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Import
          </button>
        )}
        {csvImportStatus === 'cancelled' && (
          <span className="text-sm text-gray-600 font-medium">✗ Import cancelled</span>
        )}
        {(csvImportStatus === 'idle' || csvImportStatus === 'completed') && (
          <span></span>
        )}
        <button 
          onClick={() => setShowImportModal(false)}
          className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow hover:shadow-md transition-all duration-200 ml-auto"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

{/* Add these animations to your global styles or in a <style jsx> tag */}
<style jsx>{`
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  
  @keyframes pulse-once {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes pulse-fast {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.4; }
  }
  
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
  
  .animate-pulse-once {
    animation: pulse-once 1s ease-in-out;
  }

  .animate-pulse-fast {
    animation: pulse-fast 0.8s ease-in-out infinite;
  }
`}</style>

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