// pages/affiliate-links.js - Complete fixed version
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function AffiliateLinksPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [products, setProducts] = useState([])
  const [affiliateLinks, setAffiliateLinks] = useState([])
  const [notifications, setNotifications] = useState([])
  const [expandedStores, setExpandedStores] = useState(new Set())
  
  // Modals
  const [showStoreModal, setShowStoreModal] = useState(false)
  const [showAddLinkModal, setShowAddLinkModal] = useState(false)
  const [selectedStore, setSelectedStore] = useState(null)
  
  // Form states
  const [storeForm, setStoreForm] = useState({
    storeName: '',
    description: '',
    websiteUrl: ''
  })
  
  const [linkForm, setLinkForm] = useState({
    storeId: null,
    affiliateUrl: '',
    selectedProduct: null,
    notes: ''
  })
  
  const [searchTerm, setSearchTerm] = useState('')
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadStores(session.user.id)
      await loadProducts(session.user.id)
      await loadAffiliateLinks(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  const loadStores = async (userId) => {
    try {
      const response = await fetch(`/api/stores/manage?userId=${userId}`)
      const data = await response.json()
      if (data.success) {
        setStores(data.stores)
        // Auto-expand all stores
        setExpandedStores(new Set(data.stores.map(s => s.id)))
      }
    } catch (error) {
      console.error('Error loading stores:', error)
      addNotification('Failed to load stores', 'error')
    }
  }

  const loadProducts = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, internal_sku, supplier_asin, title, brand, image_urls, our_price, stock_status')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('title')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error loading products:', error)
    }
  }

  const loadAffiliateLinks = async (userId) => {
    try {
      setLoading(true)
      
      // Get affiliate links
      const { data: links, error: linksError } = await supabase
        .from('affiliate_links')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (linksError) throw linksError

      // Enrich with store and product data
      const enrichedLinks = await Promise.all(
        (links || []).map(async (link) => {
          // Get store
          const { data: store } = await supabase
            .from('stores')
            .select('*')
            .eq('id', link.store_id)
            .single()

          // Get product
          const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('internal_sku', link.internal_sku)
            .eq('user_id', userId)
            .single()

          return {
            ...link,
            stores: store,
            products: product
          }
        })
      )

      setAffiliateLinks(enrichedLinks)
    } catch (error) {
      console.error('Error loading affiliate links:', error)
      addNotification('Failed to load affiliate links', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateStore = async (e) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/stores/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          storeName: storeForm.storeName,
          description: storeForm.description,
          websiteUrl: storeForm.websiteUrl
        })
      })

      const data = await response.json()
      if (data.success) {
        addNotification('Store created successfully', 'success')
        setShowStoreModal(false)
        setStoreForm({ storeName: '', description: '', websiteUrl: '' })
        await loadStores(session.user.id)
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      addNotification(`Failed to create store: ${error.message}`, 'error')
    }
  }

  const handleAddLink = async (e) => {
    e.preventDefault()
    
    if (!linkForm.storeId || !linkForm.affiliateUrl || !linkForm.selectedProduct) {
      addNotification('Please fill in all required fields', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('affiliate_links')
        .insert({
          user_id: session.user.id,
          store_id: linkForm.storeId,
          affiliate_url: linkForm.affiliateUrl,
          internal_sku: linkForm.selectedProduct.internal_sku,
          notes: linkForm.notes
        })

      if (error) throw error

      addNotification('Affiliate link added successfully', 'success')
      setShowAddLinkModal(false)
      setLinkForm({ storeId: null, affiliateUrl: '', selectedProduct: null, notes: '' })
      await loadAffiliateLinks(session.user.id)
    } catch (error) {
      addNotification(`Failed to add link: ${error.message}`, 'error')
    }
  }

  const handleDeleteStore = async (storeId) => {
    if (!confirm('Delete this store and all its affiliate links?')) return

    try {
      const response = await fetch('/api/stores/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId })
      })

      const data = await response.json()
      if (data.success) {
        addNotification('Store deleted', 'success')
        await loadStores(session.user.id)
        await loadAffiliateLinks(session.user.id)
      }
    } catch (error) {
      addNotification('Failed to delete store', 'error')
    }
  }

  const addNotification = (message, type = 'info') => {
    const notification = { id: Date.now(), message, type }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  const toggleStore = (storeId) => {
    setExpandedStores(prev => {
      const newSet = new Set(prev)
      if (newSet.has(storeId)) {
        newSet.delete(storeId)
      } else {
        newSet.add(storeId)
      }
      return newSet
    })
  }

  // Group links by store
  const storesWithLinks = stores.map(store => ({
    ...store,
    links: affiliateLinks.filter(link => link.store_id === store.id)
  }))

  const filteredStores = storesWithLinks.filter(store => {
    if (!searchTerm) return true
    return store.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           store.links.some(link => 
             link.products?.title?.toLowerCase().includes(searchTerm.toLowerCase())
           )
  })

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="affiliate-links">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="affiliate-links">
      <div className="h-full bg-gray-50">
        {/* Toast Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div key={notification.id} className={`p-3 rounded-lg shadow-lg border ${
                notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900">
                Affiliate Links <span className="text-gray-400 font-normal">({affiliateLinks.length})</span>
              </h1>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowStoreModal(true)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Add Store
                </button>
                <button 
                  onClick={() => setShowAddLinkModal(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  disabled={stores.length === 0}
                >
                  Add Affiliate Link
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search stores or products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Store Grid */}
          {stores.length === 0 ? (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No stores yet</h3>
              <p className="text-sm text-gray-500 mb-4">Create your first store to start managing affiliate links</p>
             <button 
                onClick={() => setShowStoreModal(true)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create First Store
              </button>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredStores.map((store) => (
                  <div 
                    key={store.id} 
                    className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group"
                  >
                    {/* Store Card Header */}
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <span className="text-2xl font-bold text-white">
                            {store.store_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedStore(store)
                              setLinkForm({ ...linkForm, storeId: store.id })
                              setShowAddLinkModal(true)
                            }}
                            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                            title="Add Product"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteStore(store.id)
                            }}
                            className="p-2 rounded-lg bg-white/20 hover:bg-red-500 text-white transition-colors"
                            title="Delete Store"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{store.store_name}</h3>
                      <p className="text-blue-100 text-sm">
                        {store.links.length} {store.links.length === 1 ? 'product' : 'products'}
                      </p>
                    </div>

                    {/* Store Card Body */}
                    <div className="p-4">
                      {store.links.length === 0 ? (
                        <div className="text-center py-8">
                          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <p className="text-sm text-gray-500 mb-3">No products yet</p>
                          <button
                            onClick={() => {
                              setSelectedStore(store)
                              setLinkForm({ ...linkForm, storeId: store.id })
                              setShowAddLinkModal(true)
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Add first product
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(expandedStores.has(store.id) ? store.links : store.links.slice(0, 3)).map((link) => (
                            <div 
                              key={link.id} 
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group/item"
                            >
                              <img 
                                src={link.products?.image_urls?.[0] || 'https://via.placeholder.com/48'} 
                                alt={link.products?.title || 'Product'} 
                                className="w-12 h-12 rounded object-cover flex-shrink-0"
                                onError={(e) => e.target.src = 'https://via.placeholder.com/48'}
                              />
                             <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {link.products?.title || 'Product not found'}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {link.products?.brand || 'Unknown'}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <a 
                                  href={link.affiliate_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded text-blue-600 hover:bg-blue-50"
                                  title="View Link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteLink(link.id)
                                  }}
                                  className="p-1.5 rounded text-red-600 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                          
                          {store.links.length > 3 && (
                            <button
                              onClick={() => toggleStore(store.id)}
                              className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {expandedStores.has(store.id) 
                                ? 'Show less' 
                                : `View ${store.links.length - 3} more`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Store Card Footer */}
                    {store.description && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <p className="text-xs text-gray-500 line-clamp-2 pt-3">{store.description}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create Store Modal */}
        {showStoreModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold">Create Store</h3>
              </div>
              <form onSubmit={handleCreateStore} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Store Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={storeForm.storeName}
                    onChange={(e) => setStoreForm({...storeForm, storeName: e.target.value})}
                    placeholder="e.g., Petacular"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={storeForm.description}
                    onChange={(e) => setStoreForm({...storeForm, description: e.target.value})}
                    rows={2}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                  <input
                    type="url"
                    value={storeForm.websiteUrl}
                    onChange={(e) => setStoreForm({...storeForm, websiteUrl: e.target.value})}
                    placeholder="https://petacular.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStoreModal(false)
                      setStoreForm({ storeName: '', description: '', websiteUrl: '' })
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Create Store
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Link Modal */}
        {showAddLinkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b sticky top-0 bg-white">
                <h3 className="text-lg font-semibold">Add Affiliate Link</h3>
                {selectedStore && (
                  <p className="text-sm text-gray-500 mt-1">to {selectedStore.store_name}</p>
                )}
              </div>
              <form onSubmit={handleAddLink} className="p-6 space-y-4">
                {!linkForm.storeId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Store <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={linkForm.storeId || ''}
                      onChange={(e) => setLinkForm({...linkForm, storeId: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Choose a store...</option>
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.store_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Affiliate URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={linkForm.affiliateUrl}
                    onChange={(e) => setLinkForm({...linkForm, affiliateUrl: e.target.value})}
                    placeholder="https://amzn.to/3IyHUoa"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Product <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={linkForm.selectedProduct?.id || ''}
                    onChange={(e) => {
                      const product = products.find(p => p.id === parseInt(e.target.value))
                      setLinkForm({...linkForm, selectedProduct: product})
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Choose a product...</option>
                    {products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.title} ({product.internal_sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                  <textarea
                    value={linkForm.notes}
                    onChange={(e) => setLinkForm({...linkForm, notes: e.target.value})}
                    rows={3}
                    placeholder="Add any notes about this affiliate link..."
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddLinkModal(false)
                      setSelectedStore(null)
                      setLinkForm({ storeId: null, affiliateUrl: '', selectedProduct: null, notes: '' })
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Add Affiliate Link
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}