// pages/products/[id].js - Fixed variant parsing
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import DashboardLayout from '../../components/DashboardLayout'

export default function ProductDetailPage() {
  const router = useRouter()
  const { id } = router.query
  
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState(null)
  const [activeTab, setActiveTab] = useState('variants')
  const [variants, setVariants] = useState([])
  const [saving, setSaving] = useState(false)
  const [editingVariant, setEditingVariant] = useState(null)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (id && session) {
      loadProduct()
    }
  }, [id, session])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
    }
    setLoading(false)
  }

  const loadProduct = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      
      setProduct(data)
      parseVariants(data)
    } catch (error) {
      console.error('Error loading product:', error)
    } finally {
      setLoading(false)
    }
  }

  const parseVariants = (product) => {
  try {
    const variantsData = typeof product.variants === 'string' 
      ? JSON.parse(product.variants) 
      : product.variants

    if (variantsData?.has_variations && variantsData?.options?.length > 0) {
      const parsedVariants = variantsData.options.map((variant, idx) => {
        const dimensions = variant.dimensions || {}
        const color = dimensions.Colour || dimensions.Color || dimensions['Colour Name'] || 'N/A' 
        const size = dimensions['Size Name'] || dimensions.Size || ''
        const style = dimensions['Style Name'] || ''
        
        let variantName = color
        if (size) variantName += ` - ${size}`
        if (style) variantName += ` (${style})`

        return {
          id: idx + 1,
          name: variantName,
          color: color,
          size: size,
          style: style,
          asin: variant.asin,
          selected: variant.selected || false,
          stock_status: variant.stock_status || 'Unknown',
          stock_quantity: variant.stock_quantity,
          price: variant.price || product.supplier_price,
          image: variant.image || product.image_urls?.[idx] || product.image_urls?.[0]
        }
      })

      setVariants(parsedVariants)
      return
    }

      // Fallback: create single variant from main product
      setVariants([{
        id: 1,
        name: 'Standard',
        color: extractColorFromText(product.title) || 'Default',
        size: '',
        style: '',
        asin: product.supplier_asin,
        selected: true,
        stock_status: product.stock_status,
        stock_quantity: product.stock_quantity,
        price: product.supplier_price,
        image: product.image_urls?.[0]
      }])
      
    } catch (error) {
      console.error('Error parsing variants:', error)
      // Fallback variant
      setVariants([{
        id: 1,
        name: 'Standard',
        color: 'Default',
        size: '',
        style: '',
        asin: product.supplier_asin,
        selected: true,
        stock_status: product.stock_status,
        stock_quantity: product.stock_quantity,
        price: product.supplier_price,
        image: product.image_urls?.[0]
      }])
    }
  }

  const extractColorFromText = (text) => {
    if (!text) return null
    const colorPattern = /\b(Black|Blue|Green|Red|White|Gray|Grey|Purple|Yellow|Pink|Orange|Brown|Beige|Navy|Teal|Silver|Gold|Space Grey)\b/i
    const match = text.match(colorPattern)
    return match ? match[0] : null
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Update variants data
      const updatedVariants = {
        has_variations: variants.length > 1,
        count: variants.length,
        dimensions: variants.length > 1 ? ['Colour', 'Size Name'] : [],
        options: variants.map(v => ({
          asin: v.asin,
          selected: v.selected,
          dimensions: {
            Colour: v.color,
            'Size Name': v.size || ''
          },
          image: v.image
        })),
        parent_asin: product.variants?.parent_asin || null
      }

      const { error } = await supabase
        .from('products')
        .update({
          variants: updatedVariants,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      
      if (error) throw error
      
      alert('Product saved successfully!')
      loadProduct() // Reload to see changes
    } catch (error) {
      console.error('Error saving product:', error)
      alert('Failed to save product: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEditVariant = (variant) => {
    setEditingVariant({...variant})
  }

  const handleSaveVariant = () => {
    if (!editingVariant) return
    
    const updatedVariants = variants.map(v => 
      v.id === editingVariant.id ? editingVariant : v
    )
    setVariants(updatedVariants)
    setEditingVariant(null)
  }

  const handleDeleteVariant = (variantId) => {
    if (variants.length <= 1) {
      alert('Cannot delete the last variant')
      return
    }
    if (confirm('Are you sure you want to delete this variant?')) {
      setVariants(variants.filter(v => v.id !== variantId))
    }
  }

  const handleAddVariant = () => {
    const newVariant = {
      id: Math.max(...variants.map(v => v.id), 0) + 1,
      name: 'New Variant',
      color: 'Black',
      size: '',
      style: '',
      asin: product.supplier_asin,
      selected: false,
      stock_status: 'In Stock',
      price: product.supplier_price,
      image: product.image_urls?.[0]
    }
    setVariants([...variants, newVariant])
    setEditingVariant(newVariant)
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="products">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (!product) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="products">
        <div className="text-center py-12">
          <p className="text-gray-500">Product not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="products">
      <div className="bg-white min-h-screen">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <img 
                  src={product.image_urls?.[0] || 'https://via.placeholder.com/60'} 
                  alt="" 
                  className="w-14 h-14 rounded object-cover border border-gray-200"
                />
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 line-clamp-1">
                    {product.title}
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                    <span>Supplier: {product.supplier_asin}</span>
                    <span>•</span>
                    <a 
                      href={product.supplier_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View on Amazon
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 text-sm font-medium text-white bg-orange-500 rounded hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('product')}
              className={`py-3 text-sm font-medium border-b-2 ${
                activeTab === 'product' 
                  ? 'border-orange-500 text-orange-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Product
            </button>
            <button
              onClick={() => setActiveTab('description')}
              className={`py-3 text-sm font-medium border-b-2 ${
                activeTab === 'description' 
                  ? 'border-orange-500 text-orange-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Description
            </button>
            <button
              onClick={() => setActiveTab('variants')}
              className={`py-3 text-sm font-medium border-b-2 ${
                activeTab === 'variants' 
                  ? 'border-orange-500 text-orange-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Variants ({variants.length})
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`py-3 text-sm font-medium border-b-2 ${
                activeTab === 'images' 
                  ? 'border-orange-500 text-orange-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Images
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'product' && (
            <div className="max-w-4xl">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Buy Price</label>
                  <div className="text-2xl font-bold text-gray-900">
                    ${product.supplier_price?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Sell Price</label>
                  <div className="text-2xl font-bold text-gray-900">
                    ${product.our_price?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Stock Status</label>
                  <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-medium ${
                    product.stock_status === 'In Stock' ? 'bg-green-100 text-green-800' :
                    product.stock_status === 'Limited Stock' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {product.stock_status}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Brand</label>
                  <div className="text-sm text-gray-900">{product.brand || 'N/A'}</div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-700 mb-2">Category</label>
                <div className="text-sm text-gray-900">{product.category || 'N/A'}</div>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-700 mb-2">Rating</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <svg 
                        key={i} 
                        className={`w-5 h-5 ${i < Math.floor(product.rating_average || 0) ? 'text-yellow-400' : 'text-gray-300'}`}
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">
                    {product.rating_average?.toFixed(1) || '0.0'} ({product.rating_count || 0} reviews)
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'description' && (
            <div className="max-w-4xl">
              <div className="prose max-w-none">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {product.description || 'No description available'}
                </p>
                
                {product.features && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Features</h3>
                    <ul className="space-y-2">
                      {(Array.isArray(product.features) ? product.features : JSON.parse(product.features || '[]')).map((feature, idx) => (
                        <li key={idx} className="text-sm text-gray-700 flex items-start">
                          <span className="text-blue-600 mr-2">•</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'variants' && (
            <div className="max-w-6xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    checked={false}
                    readOnly
                  />
                  <span className="text-sm text-gray-700">
                    {variants.length} Variant Selected
                  </span>
                </div>
                <button 
                  className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                >
                  Edit Variations Options
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {variants.map((variant) => (
                  <div 
                    key={variant.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                      
                      <img 
                        src={variant.image || product.image_urls?.[0]} 
                        alt="" 
                        className="w-16 h-16 rounded object-cover border border-gray-200"
                      />
                      
                      <div className="flex-1 grid grid-cols-5 gap-4 items-center">
  <div>
    <p className="text-xs text-gray-500 mb-1">Colour Name:</p>
    {editingVariant?.id === variant.id ? (
      <input
        type="text"
        value={editingVariant.color}
        onChange={(e) => setEditingVariant({...editingVariant, color: e.target.value})}
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
      />
    ) : (
      <p className="text-sm font-medium text-gray-900">{variant.color}</p>
    )}
  </div>
  
  <div>
    <p className="text-xs text-gray-500 mb-1">Status:</p>
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
      variant.stock_status === 'In Stock' ? 'bg-green-100 text-green-800' :
      variant.stock_status === 'Limited Stock' ? 'bg-yellow-100 text-yellow-800' :
      variant.stock_status === 'Out of Stock' ? 'bg-red-100 text-red-800' :
      'bg-gray-100 text-gray-800'
    }`}>
      {variant.stock_status || 'Unknown'}
    </span>
  </div>
  
 <div>
  <p className="text-xs text-gray-500 mb-1">Stock Qty:</p>
  <p className="text-sm font-medium text-gray-900">
    {variant.stock_status === 'Out of Stock' || variant.stock_status === 'Unknown'
      ? '0'
      : (variant.stock_quantity !== null && variant.stock_quantity !== undefined ? variant.stock_quantity : 'N/A' )
    }
  </p>
</div>
  
  <div>
    <p className="text-xs text-gray-500 mb-1">Buy ID:</p>
    {editingVariant?.id === variant.id ? (
      <input
        type="text"
        value={editingVariant.asin}
        onChange={(e) => setEditingVariant({...editingVariant, asin: e.target.value})}
        className="w-full px-2 py-1 text-sm font-mono border border-gray-300 rounded"
      />
    ) : (
      <p className="text-sm font-mono text-gray-700">{variant.asin}</p>
    )}
  </div>
  
  <div>
    <p className="text-xs text-gray-500 mb-1">Price:</p>
    {editingVariant?.id === variant.id ? (
      <input
        type="number"
        step="0.01"
        value={editingVariant.price}
        onChange={(e) => setEditingVariant({...editingVariant, price: parseFloat(e.target.value)})}
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
      />
    ) : (
      <p className="text-sm font-medium text-gray-900">
        A${variant.price?.toFixed(2) || '0.00'}
      </p>
    )}
  </div>
</div>
                      
                      <div className="flex items-center gap-2">
                        {editingVariant?.id === variant.id ? (
                          <>
                            <button 
                              onClick={handleSaveVariant}
                              className="p-2 text-green-600 hover:bg-green-50 rounded"
                              title="Save"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button 
                              onClick={() => setEditingVariant(null)}
                              className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                              title="Cancel"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleEditVariant(variant)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {variants.length > 1 && (
                              <button 
                                onClick={() => handleDeleteVariant(variant.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleAddVariant}
                className="mt-6 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Variant
              </button>
            </div>
          )}

          {activeTab === 'images' && (
            <div className="max-w-6xl">
              <div className="grid grid-cols-4 gap-4">
                {(() => {
                  // Parse image_urls if it's a string, otherwise use as-is
                  const images = typeof product.image_urls === 'string' 
                    ? JSON.parse(product.image_urls) 
                    : product.image_urls || []
                  
                  console.log('Image URLs:', images) // Debug log
                  
                  return images.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img 
                        src={url} 
                        alt={`Product image ${idx + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          console.error(`Failed to load image ${idx}:`, url)
                          e.target.src = 'https://via.placeholder.com/300x300?text=Image+Not+Found'
                        }}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg"></div>
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        Image {idx + 1}
                      </div>
                    </div>
                  ))
                })()}
              </div>
              {(() => {
                const images = typeof product.image_urls === 'string' 
                  ? JSON.parse(product.image_urls) 
                  : product.image_urls || []
                return images.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No images available
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}