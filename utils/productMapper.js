// utils/productMapper.js
export function mapAutodsProductToSupabase(autodsProduct) {
  const variation = autodsProduct.variations?.[0] || {}
  const activeBuyItem = variation.active_buy_item || {}
  
  return {
    autods_id: autodsProduct.id,
    sku: activeBuyItem.item_id_on_site,
    title: autodsProduct.title,
    description: autodsProduct.description,
    site_id: autodsProduct.site_id,
    status: autodsProduct.status,
    
    // Images
    images: autodsProduct.images || [],
    main_picture_url: autodsProduct.main_picture_url?.url || null,
    
    // Variation data
    price: variation.price || 0,
    shipping_price: variation.shipping_price || 0,
    quantity: variation.quantity || 0,
    total_profit: variation.total_profit || 0,
    
    // Supplier data
    supplier_url: activeBuyItem.url || null,
    supplier_title: activeBuyItem.title || null,
    supplier_price: activeBuyItem.price || 0,
    supplier_site_id: activeBuyItem.site_id || null,
    supplier_quantity: activeBuyItem.quantity || 0,
    
    // Item specifics and tags
    item_specifics: autodsProduct.item_specifics || {},
    tags: autodsProduct.tags || [],
    
    // Dates
    created_date: autodsProduct.created_date,
    modified_at: autodsProduct.modified_at,
    upload_date: autodsProduct.upload_date,
    
    // Additional fields
    sold_count: autodsProduct.total_sold_count || 0,
    amount_of_variations: autodsProduct.amount_of_variations || 1,
    
    // Raw data for future use
    raw_data: autodsProduct
  }
}
