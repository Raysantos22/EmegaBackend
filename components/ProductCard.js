// components/ProductCard.js
export default function ProductCard({ product, onEdit, onDelete, supabase }) {
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product?')) return
    
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('autods_id', product.autods_id)
      
      if (error) throw error
      onDelete(product.autods_id)
    } catch (error) {
      console.error('Error deleting product:', error)
      alert('Error deleting product: ' + error.message)
    }
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      1: { text: 'Draft', color: 'bg-gray-100 text-gray-800' },
      2: { text: 'Active', color: 'bg-green-100 text-green-800' },
      3: { text: 'Paused', color: 'bg-yellow-100 text-yellow-800' },
      4: { text: 'Out of Stock', color: 'bg-red-100 text-red-800' },
    }
    
    const statusInfo = statusMap[status] || { text: 'Unknown', color: 'bg-gray-100 text-gray-800' }
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusInfo.color}`}>
        {statusInfo.text}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {product.main_picture_url && (
        <div className="aspect-w-1 aspect-h-1">
          <img
            src={product.main_picture_url}
            alt={product.title}
            className="w-full h-48 object-cover"
          />
        </div>
      )}
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{product.title}</h3>
          {getStatusBadge(product.status)}
        </div>
        
        {product.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{product.description}</p>
        )}
        
        <div className="flex justify-between items-center mb-3">
          <div className="text-lg font-bold text-green-600">
            ${product.price}
          </div>
          <div className="text-sm text-gray-500">
            Stock: {product.quantity}
          </div>
        </div>
        
        {product.sku && (
          <div className="text-xs text-gray-400 mb-3">
            SKU: {product.sku}
          </div>
        )}
        
        <div className="flex justify-between">
          <button
            onClick={() => onEdit(product)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}