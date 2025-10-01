<?php
// ===== manualfunction.php — v5.16.7 (2025-09-15, PHP 7.3-safe) =====
// HARDENING + QUIETER LOGS (unchanged)              ✅
// DEDUPE/RESUME FOR VARIABLE PRODUCTS               ✅
// CATEGORY FROM AUTODS TAGS + PRIMARY STABILIZED    ✅
// UTF-8 ENFORCEMENT + COLLATION FIXES               ✅
// Fewer REST calls for category ops (use WP core)   ✅
// NEW: Guarded cat-map SQL + WP fallback (no fatals)✅

require_once('/home/emega389231co/public_html/wp-load.php');
require_once(__DIR__ . '/config.php');

/* ==== Force UTF-8 for both DB links ==== */
if (isset($conn_emega) && $conn_emega instanceof PDO) {
    try {
        $conn_emega->exec("SET NAMES utf8mb4");
        $conn_emega->exec("SET collation_connection = utf8mb4_general_ci");
    } catch (\Throwable $e) { /* noop */ }
}
if (isset($req_conn) && method_exists($req_conn, 'set_charset')) {
    @ $req_conn->set_charset('utf8mb4');
}

if (!defined('MANUALFUNCTION_BUILD')) {
    define('MANUALFUNCTION_BUILD', '2025-09-15 v5.16.7 hardened+dedupe+cats+utf8+primary-stable+guards (php73)');
    if (function_exists('opcache_invalidate')) { @opcache_invalidate(__FILE__, true); }
}

/* =========================
   TOP SWITCHES
   ========================= */
$EMEGA_FORCE_CATEGORY_SLUG = 'in-stock,product-feed';   // append-only promos
$EMEGA_FORCE_TAGS          = 'Viral';                   // append-only
$EMEGA_OOS_SKIP            = 'false';                   // if true, skip OOS items entirely

if (!defined('EMEGA_GALLERY_LIMIT')) define('EMEGA_GALLERY_LIMIT', 5);

// Optional runtime override: ?oos_skip=1|0|true|false
$__oos_qs = isset($_GET['oos_skip']) ? (string)$_GET['oos_skip'] : null;
if ($__oos_qs !== null) {
    $EMEGA_OOS_SKIP = ($__oos_qs === '1' || strtolower($__oos_qs) === 'true') ? 'true' : 'false';
}
if (!defined('EMEGA_OOS_SKIP_BOOL')) define('EMEGA_OOS_SKIP_BOOL', strtolower($EMEGA_OOS_SKIP) === 'true');

/* =========================
   LOGGING (QUIET BY DEFAULT)
   ========================= */
$LOG = isset($_GET['log']) ? strtolower((string)$_GET['log']) : 'info';
function log_ok($level) {
    global $LOG; static $m = ['debug'=>10, 'info'=>20, 'none'=>99];
    $cur = $m[$LOG] ?? 20; $lvl = $m[$level] ?? 20;
    return $lvl >= $cur && $LOG !== 'none';
}
function log_msg($level, $msg) { if (log_ok($level)) error_log($msg); }
log_msg('info', '[manualfunction] LOADED build: ' . MANUALFUNCTION_BUILD . ' file=' . __FILE__);

/* =========================
   GLOBALS / TABLE RESOLUTION
   ========================= */
global $autods_conn;  // mysqli (AutoDS)
global $conn_emega;   // PDO (Woo DB)
global $req_conn;     // mysqli (REQ DB)

global $shop_products_table;
if (!isset($shop_products_table) || $shop_products_table === '') {
    $shop_products_table = defined('REQ_SHOP_PRODUCTS') && REQ_SHOP_PRODUCTS ? REQ_SHOP_PRODUCTS : 'shop_products';
}
function emega_sql_table_ref($raw, $mysqli) {
    if (!$raw) return null;
    $raw = trim((string)$raw);
    $raw = trim($raw, "` \t\n\r\0\x0B");
    $parts = explode('.', $raw);
    if (count($parts) === 1) {
        return '`' . $mysqli->real_escape_string($parts[0]) . '`';
    }
    $db = $mysqli->real_escape_string($parts[0]);
    $tb = $mysqli->real_escape_string($parts[count($parts)-1]);
    return "`$db`.`$tb`";
}
$SHOP_TBL = emega_sql_table_ref($shop_products_table, $req_conn);

$GLOBALS['EMEGA_CREATED_SKUS']   = [];
$GLOBALS['EMEGA_MIRRORED_SKUS']  = [];
$GLOBALS['EMEGA_MIRROR_ROWS']    = 0;
$GLOBALS['EMEGA_CREATED_COUNT']  = 0;

if ($SHOP_TBL) log_msg('debug', "[manualfunction] mirror target: $SHOP_TBL");
if ($req_conn && property_exists($req_conn,'server_info')) log_msg('debug', "[manualfunction] req_conn server: ".$req_conn->server_info);

/* =========================
   LOOKUP QUEUE
   ========================= */
if (!isset($GLOBALS['EMEGA_LOOKUP_QUEUE'])) { $GLOBALS['EMEGA_LOOKUP_QUEUE'] = []; }
$EMEGA_LOOKUP_CHUNK        = 250;
$EMEGA_ALLOW_GLOBAL_LOOKUP = false;
function emega_lookup_queue_add($id) { $id=(int)$id; if($id>0) $GLOBALS['EMEGA_LOOKUP_QUEUE'][$id]=true; }
function emega_flush_lookup_updates() {
    global $EMEGA_LOOKUP_CHUNK; $ids = array_keys($GLOBALS['EMEGA_LOOKUP_QUEUE'] ?? []); if (!$ids) return;
    if (function_exists('wc_update_product_lookup_tables_for_product')) {
        foreach (array_chunk($ids, max(1,(int)$EMEGA_LOOKUP_CHUNK)) as $chunk) {
            foreach ($chunk as $pid) { try { wc_update_product_lookup_tables_for_product((int)$pid); } catch (\Throwable $e) {} }
        }
        log_msg('debug', "[manualfunction] Lookup batch updated count=".count($ids));
    } else {
        log_msg('debug', "[manualfunction] Per-product lookup API missing; global rebuild disabled");
    }
    $GLOBALS['EMEGA_LOOKUP_QUEUE'] = [];
}
if (function_exists('register_shutdown_function')) register_shutdown_function('emega_flush_lookup_updates');

/* =========================
   HELPERS
   ========================= */
function emega_is_instock($inventory_status) {
    $v = strtolower((string)$inventory_status);
    return !in_array($v, ['2','3','oos','out','outofstock','0','false','no'], true);
}
function emega_is_tax_attr_name($name){ return (strpos(strtolower((string)$name),'pa_') === 0); }
function emega_slug($s){
    if (function_exists('sanitize_title')) return sanitize_title($s);
    $s = strtolower(trim((string)$s)); $s = preg_replace('/[^a-z0-9\-\s_]+/','',$s); $s = preg_replace('/[\s_]+/','-',$s);
    return trim($s,'-');
}
function emega_sku_normalize($s) {
    $s = preg_replace('/[^A-Za-z0-9\-\_]+/','-', (string)$s);
    $s = trim($s, '-_'); if ($s === '') $s = 'SKU'; if (strlen($s) > 64) $s = substr($s, 0, 64);
    return $s;
}
function emega_force_instock_and_refresh_lookup($product_id) {
    $pid=(int)$product_id; if($pid<=0) return;
    try {
        if (function_exists('update_post_meta')) { update_post_meta($pid, '_manage_stock','no'); update_post_meta($pid, '_stock_status','instock'); delete_post_meta($pid,'_stock'); }
        if (function_exists('wc_update_product_stock_status')) wc_update_product_stock_status($pid, 'instock');
        if (function_exists('wc_update_product_lookup_tables_for_product')) wc_update_product_lookup_tables_for_product($pid);
    } catch (\Throwable $e) { emega_lookup_queue_add($pid); }
}
if (!function_exists('emega_strip_variant_suffix')) {
    function emega_strip_variant_suffix($title, array $variations) {
        $title=(string)$title; if ($title===''||empty($variations)) return trim($title);
        $lower=function($s){return function_exists('mb_strtolower')?mb_strtolower($s,'UTF-8'):strtolower($s);};
        $strlen=function($s){return function_exists('mb_strlen')?mb_strlen($s,'UTF-8'):strlen($s);};
        $valsSet=[]; foreach($variations as $v){ foreach((array)($v['attributes']??[]) as $val){ $t=trim((string)$val); if($t!=='') $valsSet[$lower($t)]=$t; } }
        if(!$valsSet) return trim($title);
        $vals=array_values($valsSet); usort($vals,function($a,$b)use($strlen){return $strlen($b)<=>$strlen($a);});
        $seps=['—','-','–',':','|']; $sepAlt=implode('|',array_map(function($s){return preg_quote($s,'/');},$seps));
        foreach($vals as $val){ $q=preg_quote($val,'/'); $pat1='/\s*(?:'.$sepAlt.')\s*'.$q.'\s*$/iu'; $new=preg_replace($pat1,'',$title); if($new!==null&&$new!==$title) return trim($new);
            $pat2='/\s*\(\s*'.$q.'\s*\)\s*$/iu'; $new=preg_replace($pat2,'',$title); if($new!==null&&$new!==$title) return trim($new); }
        return trim($title);
    }
}

/* ----- Term cache ----- */
$GLOBALS['EMEGA_TERM_CACHE'] = [];
function emega_get_or_create_term($tax, $slug) {
    if (!isset($GLOBALS['EMEGA_TERM_CACHE'][$tax])) $GLOBALS['EMEGA_TERM_CACHE'][$tax]=[];
    $cache=&$GLOBALS['EMEGA_TERM_CACHE'][$tax]; if (array_key_exists($slug,$cache)) return $cache[$slug];
    $term=get_term_by('slug',$slug,$tax);
    if ($term && !is_wp_error($term)) return $cache[$slug]=(int)$term->term_id;
    $label=ucwords(str_replace(['-','_'],' ',$slug)); $res=wp_insert_term($label,$tax,['slug'=>$slug]);
    if (is_wp_error($res)) { $cache[$slug]=false; return false; }
    return $cache[$slug]=(int)($res['return'] ?? $res['term_id']);
}
if (!function_exists('emega_ensure_attribute_terms')) {
    function emega_ensure_attribute_terms(array $attrSlugToValues) {
        foreach ($attrSlugToValues as $name=>$values) {
            $tax=sanitize_title($name); if (strpos($tax,'pa_')!==0) continue;
            if (!function_exists('taxonomy_exists') || !taxonomy_exists($tax)) continue;
            foreach((array)$values as $slug){ $slug=sanitize_title($slug); if($slug) emega_get_or_create_term($tax,$slug); }
        }
    }
}

/* =========================
   CATEGORY HELPERS (+ PRIMARY STABILITY)
   ========================= */
function emega_resolve_category_ids() {
    static $cache=[]; global $EMEGA_FORCE_CATEGORY_SLUG;
    $param=isset($_GET['cat'])?trim((string)$_GET['cat']):'';
    $slugs=$param!==''?explode(',',strtolower($param)):( $EMEGA_FORCE_CATEGORY_SLUG!==''?explode(',',strtolower($EMEGA_FORCE_CATEGORY_SLUG)):[] );
    $key=$param!==''?'qs:'.$param:'default'; if(isset($cache[$key])) return $cache[$key];
    $out=[]; foreach($slugs as $slug){ $slug=trim($slug); if($slug==='') continue; $term=get_term_by('slug',$slug,'product_cat'); if($term && !is_wp_error($term)) $out[]=(int)$term->term_id; }
    return $cache[$key]=$out;
}
function emega_resolve_tags() {
    global $EMEGA_FORCE_TAGS; $param=isset($_GET['tags'])?trim((string)$_GET['tags']):'';
    $names=$param!==''?explode(',',$param):( $EMEGA_FORCE_TAGS!==''?explode(',',$EMEGA_FORCE_TAGS):[] );
    $clean=[]; foreach($names as $n){ $t=trim($n); if($t!=='' && !in_array($t,$clean,true)) $clean[]=$t; } return $clean;
}
function emega_slugify_tag($s){
    if (function_exists('sanitize_title')) return sanitize_title($s);
    $s=strtolower(trim((string)$s)); $s=str_replace('&','and',$s); $s=str_replace('/','-',$s); $s=str_replace(',','',$s);
    $s=preg_replace('~[^\pL0-9]+~u','-',$s); return trim($s,'-');
}

/* --- GUARDED DB LOOKUPS + WP FALLBACKS --- */
function emega_term_id_from_view(PDO $pdo, string $slug): int {
    if ($slug==='') return 0;
    // Try mapping view first
    try {
        static $st=null;
        if(!$st) $st=$pdo->prepare("SELECT term_id FROM emega_category_map_view WHERE slug COLLATE utf8mb4_general_ci = :s LIMIT 1");
        $st->execute([':s'=>$slug]);
        $id=(int)($st->fetchColumn() ?: 0);
        if ($id>0) { log_msg('debug', "[cats] view-hit slug=$slug term_id=$id"); return $id; }
    } catch (\Throwable $e) {
        log_msg('debug', "[cats] view-miss (".$e->getMessage().") slug=$slug");
    }
    // Fallback: native WP term by slug
    $term=get_term_by('slug',$slug,'product_cat');
    if ($term && !is_wp_error($term)) { $id=(int)$term->term_id; log_msg('debug', "[cats] wp-term fallback slug=$slug term_id=$id"); return $id; }
    return 0;
}
function emega_resolve_primary_term_from_tags(PDO $pdo, array $tags): int {
    $seen=[]; $queue=[];
    foreach((array)$tags as $t){ $t=trim((string)$t); if($t==='') continue; $k=emega_slugify_tag($t); if(!isset($seen[$k])){$seen[$k]=true; $queue[]=$k;} }
    if(!$queue) return 0;

    // Try alias table + view
    try {
        static $st=null;
        if(!$st){ $st=$pdo->prepare("
            SELECT COALESCE(m.preferred_term_id, v.term_id) AS term_id
            FROM (SELECT :k COLLATE utf8mb4_general_ci AS k) x
            LEFT JOIN emega_import_category_map m
              ON m.active=1 AND m.source_key COLLATE utf8mb4_general_ci = x.k
            LEFT JOIN emega_category_map_view v
              ON v.slug COLLATE utf8mb4_general_ci = COALESCE(m.preferred_slug COLLATE utf8mb4_general_ci, x.k)
            LIMIT 1"); }
        foreach($queue as $k){
            $st->execute([':k'=>$k]);
            $id=(int)$st->fetchColumn();
            if ($id>0){ log_msg('debug', "[cats] alias/view primary k=$k term_id=$id"); return $id; }
        }
    } catch (\Throwable $e) {
        log_msg('debug', "[cats] alias/view error ".$e->getMessage());
    }

    // Fallback: first tag that matches an existing product_cat by slug
    foreach($queue as $k){
        $term=get_term_by('slug',$k,'product_cat');
        if ($term && !is_wp_error($term)) { $id=(int)$term->term_id; log_msg('debug', "[cats] wp primary fallback k=$k term_id=$id"); return $id; }
    }
    return 0;
}
function emega_set_primary_category_meta(int $product_id, int $primary_term_id): void {
    if ($product_id<=0 || $primary_term_id<=0) return;
    if (function_exists('update_post_meta')) {
        update_post_meta($product_id, '_yoast_wpseo_primary_product_cat', $primary_term_id);
        update_post_meta($product_id, 'rank_math_primary_product_cat',    $primary_term_id);
    }
}
function emega_assign_categories_and_primary(int $pid, array $cat_ids_all, int $primary_term_id, array $promo_ids): void {
    if ($pid<=0) return;
    $cat_ids_all=array_values(array_unique(array_filter(array_map('intval',$cat_ids_all))));
    if ($primary_term_id>0) $cat_ids_all=array_values(array_unique(array_merge([$primary_term_id], array_diff($cat_ids_all,[$primary_term_id]))));
    if (!$cat_ids_all) return;

    if (function_exists('wp_set_object_terms')) wp_set_object_terms($pid, $cat_ids_all, 'product_cat', false);

    $PROMO_SET=array_fill_keys(array_map('intval',$promo_ids), true);
    $existing_primary=(int)get_post_meta($pid,'_yoast_wpseo_primary_product_cat',true);
    if(!$existing_primary) $existing_primary=(int)get_post_meta($pid,'rank_math_primary_product_cat',true);

    $should_set=false;
    if ($primary_term_id>0) {
        if (!$existing_primary) $should_set=true;
        elseif (isset($PROMO_SET[$existing_primary])) $should_set=true;
    }
    if ($should_set) {
        emega_set_primary_category_meta($pid,$primary_term_id);
        log_msg('debug', "[cats] primary set pid=$pid term_id=$primary_term_id");
    } else {
        log_msg('debug', "[cats] primary kept pid=$pid term_id=$existing_primary");
    }
}

/* ----- SKU existence helpers ----- */
function mirror_has_sku($sku) {
    global $req_conn, $SHOP_TBL; if(!$sku||!$SHOP_TBL) return false;
    $sql="SELECT 1 FROM $SHOP_TBL WHERE product_sku = ? LIMIT 1";
    if($st=$req_conn->prepare($sql)){ $st->bind_param('s',$sku); $st->execute(); $st->store_result(); $e=($st->num_rows>0); $st->close(); return $e; }
    return false;
}
function woo_has_sku($sku) {
    global $conn_emega; if(!$sku) return false;
    $stmt=$conn_emega->prepare("SELECT post_id FROM wp_postmeta WHERE meta_key='_sku' AND meta_value=:sku LIMIT 1");
    $stmt->bindValue(':sku',$sku,PDO::PARAM_STR); $stmt->execute(); return (bool)$stmt->fetchColumn();
}
function emega_prefetch_woo_skus(array $skus,$pdo){
    $skus=array_values(array_unique(array_filter(array_map('strval',$skus)))); if(!$skus) return [];
    $out=[]; foreach(array_chunk($skus,800) as $chunk){
        $in=implode(',',array_fill(0,count($chunk),'?'));
        $sql="SELECT meta_value AS sku FROM wp_postmeta WHERE meta_key='_sku' AND meta_value IN ($in)";
        $stmt=$pdo->prepare($sql);
        foreach($chunk as $i=>$s) $stmt->bindValue($i+1,$s,PDO::PARAM_STR);
        $stmt->execute(); foreach($stmt->fetchAll(PDO::FETCH_COLUMN,0) as $hit){ $out[$hit]=true; }
    } return $out;
}
function emega_prefetch_mirror_skus(array $skus,$db,$SHOP_TBL){
    $skus=array_values(array_unique(array_filter(array_map('strval',$skus)))); if(!$skus||!$SHOP_TBL) return [];
    $out=[]; foreach(array_chunk($skus,800) as $chunk){
        $ph=implode(',',array_fill(0,count($chunk),'?'));
        $sql="SELECT product_sku FROM $SHOP_TBL WHERE product_sku IN ($ph)";
        $stmt=$db->prepare($sql); $types=str_repeat('s',count($chunk));
        $stmt->bind_param($types, ...$chunk); $stmt->execute(); $res=$stmt->get_result();
        while($row=$res->fetch_assoc()) $out[$row['product_sku']]=true; $stmt->close();
    } return $out;
}
function emega_sku_exists_fast($sku,$woo_set,$mirror_set){ return isset($woo_set[$sku])||isset($mirror_set[$sku]); }

/* =========================
   EXISTING PARENT RESOLUTION
   ========================= */
function emega_find_parent_by_item_id($item_id) {
    global $conn_emega; $item_id=trim((string)$item_id); if($item_id==='') return 0;
    $sql="SELECT p.ID FROM wp_posts p JOIN wp_postmeta m ON m.post_id=p.ID AND m.meta_key='item_id' AND m.meta_value=:iid WHERE p.post_type='product' LIMIT 1";
    $st=$conn_emega->prepare($sql); $st->bindValue(':iid',$item_id,PDO::PARAM_STR); $st->execute(); $pid=(int)$st->fetchColumn();
    return $pid>0?$pid:0;
}
function emega_find_parent_by_child_skus(array $child_skus) {
    global $conn_emega; $skus=array_values(array_unique(array_filter(array_map('strval',$child_skus)))); if(!$skus) return 0;
    $ph=implode(',',array_fill(0,count($skus),'?'));
    $sql="SELECT DISTINCT p.post_parent FROM wp_posts p JOIN wp_postmeta m ON m.post_id=p.ID AND m.meta_key='_sku'
          WHERE p.post_type='product_variation' AND m.meta_value IN ($ph) AND p.post_parent>0 LIMIT 1";
    $st=$conn_emega->prepare($sql); foreach($skus as $i=>$s){ $st->bindValue($i+1,$s,PDO::PARAM_STR); }
    $st->execute(); $pid=(int)$st->fetchColumn(); return $pid>0?$pid:0;
}
function emega_find_parent_in_mirror_by_child_skus(array $child_skus) {
    global $req_conn,$SHOP_TBL; if(!$SHOP_TBL) return 0;
    $skus=array_values(array_unique(array_filter(array_map('strval',$child_skus)))); if(!$skus) return 0;
    $ph=implode(',',array_fill(0,count($skus),'?')); $sql="SELECT product_parent_wp_id FROM $SHOP_TBL WHERE product_sku IN ($ph) AND product_parent_wp_id>0 LIMIT 1";
    if(!$st=$req_conn->prepare($sql)) return 0; $types=str_repeat('s',count($skus)); $st->bind_param($types,...$skus);
    $st->execute(); $res=$st->get_result(); $pid=0; if($row=$res->fetch_assoc()) $pid=(int)$row['product_parent_wp_id']; $st->close();
    return $pid>0?$pid:0;
}
function emega_resolve_existing_parent_id(array $pd,array $child_skus){
    $item_id=(string)($pd['item_id_on_site']??''); $pid=emega_find_parent_by_item_id($item_id); if($pid>0) return $pid;
    $pid=emega_find_parent_by_child_skus($child_skus); if($pid>0) return $pid;
    $pid=emega_find_parent_in_mirror_by_child_skus($child_skus); return $pid>0?$pid:0;
}

/* =========================
   MIRROR: UPSERTS + VERIFY/BACKFILL + PARITY
   ========================= */

// Exists-by-PID (mirror)
function emega_mirror_exists_pid($pid){
    global $req_conn, $SHOP_TBL;
    if(!$SHOP_TBL) return false;
    $sql="SELECT 1 FROM $SHOP_TBL WHERE product_wp_id=? LIMIT 1";
    if($st=$req_conn->prepare($sql)){ $st->bind_param('i',$pid); $st->execute(); $st->store_result(); $ok=($st->num_rows>0); $st->close(); return $ok; }
    return false;
}

// One-shot backfill for parent from Woo (minimal fields)
function emega_backfill_parent_from_woo($pid){
    global $conn_emega;
    $pid=(int)$pid; if($pid<=0) return false;

    $sql = "
      SELECT p.ID,
             COALESCE(NULLIF(pm_sku.meta_value,''), NULL) AS sku,
             COALESCE(NULLIF(pm_reg.meta_value,0), NULL) AS regular_price,
             COALESCE(NULLIF(pm_sale.meta_value,0), NULL) AS sale_price,
             p.post_status
      FROM wp_posts p
      LEFT JOIN wp_postmeta pm_sku  ON pm_sku.post_id=p.ID  AND pm_sku.meta_key='_sku'
      LEFT JOIN wp_postmeta pm_reg  ON pm_reg.post_id=p.ID  AND pm_reg.meta_key='_regular_price'
      LEFT JOIN wp_postmeta pm_sale ON pm_sale.post_id=p.ID AND pm_sale.meta_key='_sale_price'
      WHERE p.ID=:pid AND p.post_type='product' LIMIT 1
    ";
    $st = $conn_emega->prepare($sql);
    $st->bindValue(':pid',$pid,PDO::PARAM_INT);
    $st->execute();
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if(!$row) return false;

    $status = (string)$row['post_status'];
    $sku    = $row['sku'] ?? '';
    $reg    = isset($row['regular_price']) ? (float)$row['regular_price'] : 0.0;

    // type: simple unless variations exist
    $ptype = 'simple';
    $chk = $conn_emega->prepare("SELECT 1 FROM wp_posts WHERE post_parent=:pid AND post_type='product_variation' LIMIT 1");
    $chk->bindValue(':pid',$pid,PDO::PARAM_INT);
    $chk->execute();
    if ($chk->fetchColumn()) $ptype='variable';

    $stock_flag = 1; // importer forces instock

    return emega_mirror_upsert([
        'product_wp_id'         => $pid,
        'product_parent_wp_id'  => 0,
        'product_sku'           => $sku ?: '',
        'product_wp_type'       => 'product',
        'product_type'          => $ptype,
        'product_status'        => $status,
        'product_regular_price' => $reg,
        'product_buy_price'     => 0,
        'product_price'         => $reg,
        'stock_status'          => $stock_flag
    ]);
}

// Single UPSERT
function emega_mirror_upsert($args) {
    global $req_conn, $SHOP_TBL;
    if(!$SHOP_TBL){ error_log('[mirror] abort: SHOP_TBL empty'); return false; }
    if(!$req_conn){ error_log('[mirror] abort: req_conn missing'); return false; }

    $product_wp_id        = (int)($args['product_wp_id'] ?? 0); if ($product_wp_id<=0) return false;
    $product_parent_wp_id = (int)($args['product_parent_wp_id'] ?? 0);
    $product_sku_trim     = trim((string)($args['product_sku'] ?? ''));
    $product_wp_type      = (string)($args['product_wp_type'] ?? 'product');
    $product_type         = (string)($args['product_type'] ?? 'simple');
    $product_status       = (string)($args['product_status'] ?? 'publish');
    $sell_price           = (float)($args['product_price'] ?? 0);
    $regular_price        = (float)($args['product_regular_price'] ?? $sell_price);
    $buy_price            = (float)($args['product_buy_price'] ?? 0);
    $stock_status_int     = (int)($args['stock_status'] ?? 1);
    if ($stock_status_int!==1 && $stock_status_int!==2) $stock_status_int = 1;

    $sql = "
      INSERT INTO $SHOP_TBL
      (product_wp_id, product_parent_wp_id, product_sku, product_wp_type, product_type, product_status,
       product_regular_price, product_sale_price, product_price, stock_status, product_last_update, product_autoDS_update)
      VALUES (?, ?, NULLIF(?,''), ?, ?, ?, NULLIF(?,0), NULLIF(?,0), NULLIF(?,0), ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        product_parent_wp_id = VALUES(product_parent_wp_id),
        product_sku          = VALUES(product_sku),
        product_wp_type      = VALUES(product_wp_type),
        product_type         = VALUES(product_type),
        product_status       = VALUES(product_status),
        product_regular_price= VALUES(product_regular_price),
        product_sale_price   = VALUES(product_sale_price),
        product_price        = VALUES(product_price),
        stock_status         = VALUES(stock_status),
        product_last_update  = NOW(),
        product_autoDS_update= NOW()
    ";
    if (!$stmt = $req_conn->prepare($sql)) {
        error_log('[mirror] prepare failed: '.$req_conn->errno.' '.$req_conn->error);
        return false;
    }
    $stmt->bind_param(
        'iissssdddi',
        $product_wp_id, $product_parent_wp_id, $product_sku_trim, $product_wp_type, $product_type,
        $product_status, $regular_price, $buy_price, $sell_price, $stock_status_int
    );
    $ok = $stmt->execute();
    $errno = $req_conn->errno; $err = $req_conn->error; $rows = $req_conn->affected_rows;
    $stmt->close();

    if (!$ok || $errno) {
        error_log("[mirror] execute failed: errno=$errno err=$err pid=$product_wp_id sku='$product_sku_trim'");
        return false;
    }

    $GLOBALS['EMEGA_MIRROR_ROWS'] += 1;
    log_msg('debug', "[mirror] upsert affected_rows=$rows pid=$product_wp_id");

    if ($product_sku_trim!=='') { $GLOBALS['EMEGA_MIRRORED_SKUS'][] = $product_sku_trim; }
    return true;
}

// Batch UPSERT
function emega_mirror_upsert_many($rows) {
    global $req_conn, $SHOP_TBL;
    if (!$rows || !$SHOP_TBL) { if(!$SHOP_TBL) error_log('[mirror-batch] abort: SHOP_TBL empty'); return false; }

    $vals = []; $bind = []; $types = '';
    foreach ($rows as $r) {
        $vals[] = "(?, ?, NULLIF(?,''), ?, ?, ?, NULLIF(?,0), NULLIF(?,0), NULLIF(?,0), ?, NOW(), NOW())";
        $types .= 'iissssdddi';
        array_push(
            $bind,
            (int)$r['product_wp_id'],
            (int)$r['product_parent_wp_id'],
            (string)$r['product_sku'],
            (string)$r['product_wp_type'],
            (string)$r['product_type'],
            (string)$r['product_status'],
            (float)$r['product_regular_price'],
            (float)$r['product_buy_price'],
            (float)$r['product_price'],
            (int)$r['stock_status']
        );
        if (!empty($r['product_sku'])) $GLOBALS['EMEGA_MIRRORED_SKUS'][] = (string)$r['product_sku'];
    }

    $sql = "INSERT INTO $SHOP_TBL
            (product_wp_id, product_parent_wp_id, product_sku, product_wp_type, product_type, product_status,
             product_regular_price, product_sale_price, product_price, stock_status, product_last_update, product_autoDS_update)
            VALUES ".implode(',', $vals)."
            ON DUPLICATE KEY UPDATE
              product_parent_wp_id = VALUES(product_parent_wp_id),
              product_sku          = VALUES(product_sku),
              product_wp_type      = VALUES(product_wp_type),
              product_type         = VALUES(product_type),
              product_status       = VALUES(product_status),
              product_regular_price= VALUES(product_regular_price),
              product_sale_price   = VALUES(product_sale_price),
              product_price        = VALUES(product_price),
              stock_status         = VALUES(stock_status),
              product_last_update  = NOW(),
              product_autoDS_update= NOW()";
    if (!$stmt = $req_conn->prepare($sql)) {
        error_log('[mirror-batch] prepare failed: '.$req_conn->errno.' '.$req_conn->error.' cnt='.count($rows));
        return false;
    }
    $stmt->bind_param($types, ...$bind);
    $ok = $stmt->execute();
    $errno = $req_conn->errno; $err=$req_conn->error; $rows_aff = $req_conn->affected_rows;
    $stmt->close();

    if (!$ok || $errno) {
        error_log("[mirror-batch] execute failed: errno=$errno err=$err cnt=".count($rows));
        return false;
    }

    $GLOBALS['EMEGA_MIRROR_ROWS'] += count($rows);
    log_msg('debug', "[mirror-batch] ok: affected=$rows_aff intended=".count($rows)." (INSERT=1, UPDATE=2, IDENTICAL=0 each)");
    return true;
}

/* =========================
   ENTRYPOINT (called by manualcsv.php)
   ========================= */
function create_product_by_sku($create_sku) {
    require_once(__DIR__ . '/class/class-autods.php');
    require_once(__DIR__ . '/class/class-wooapi.php');
    require_once(__DIR__ . '/config.php');
    global $autods_conn, $conn_emega, $req_conn, $SHOP_TBL;

    // reset per-run collections
    $GLOBALS['EMEGA_CREATED_SKUS']  = [];
    $GLOBALS['EMEGA_MIRRORED_SKUS'] = [];
    $GLOBALS['EMEGA_MIRROR_ROWS']   = 0;
    $GLOBALS['EMEGA_CREATED_COUNT'] = 0;

    $csv_sku_raw = (string)$create_sku;
    $csv_sku     = emega_sku_normalize($csv_sku_raw);

    $autods = new autoDSApiManagement($autods_conn);
    try { $ad = $autods->getProductData($csv_sku_raw); }
    catch (Exception $e) { summary_emit(); return ['status'=>'failed','reason'=>$e->getMessage()]; }

    if (($ad['status'] ?? '') !== 'success') { summary_emit(); return ['status'=>'failed','reason'=>'AutoDS error']; }
    $products = $ad['response']['results'] ?? []; if (empty($products)) { summary_emit(); return ['status'=>'failed','reason'=>'Empty data']; }

    foreach ($products as $pd) {
        $nvars = (int)($pd['amount_of_variations'] ?? 0);
        $vars  = is_array($pd['variations'] ?? null) ? $pd['variations'] : [];

        // Build SKU list to prefetch (children + CSV; parent SKU ignored—parent is blank here)
        $all_skus = [];
        foreach ($vars as $v) { $cs = (string)($v['sku'] ?? ''); if ($cs !== '') $all_skus[] = $cs; }
        if ($csv_sku !== '') $all_skus[] = $csv_sku;

        $woo_skus_set    = emega_prefetch_woo_skus($all_skus, $conn_emega);
        $mirror_skus_set = emega_prefetch_mirror_skus($all_skus, $req_conn, $SHOP_TBL);

        if ($nvars > 1) {
            $in  = array_values(array_filter($vars, function($v){ return emega_is_instock($v['inventory_status'] ?? null); }));
            if (EMEGA_OOS_SKIP_BOOL && empty($in)) { summary_emit(); return ['status'=>'skipped','reason'=>'all variations OOS']; }

            // child SKUs and which already exist
            $child_skus = [];
            foreach ($vars as $v) { $s=(string)($v['sku']??''); if($s!=='') $child_skus[]=$s; }
            $existing_child_skus = [];
            foreach ($child_skus as $s) { if (isset($woo_skus_set[$s]) || isset($mirror_skus_set[$s])) $existing_child_skus[] = $s; }

            // try reuse existing parent
            $existing_pid = emega_resolve_existing_parent_id($pd, $child_skus);

            $res = createNewProduct($pd, [
                'vars_instock'        => $in,
                'vars_all'            => $vars,
                'csv_sku'             => $csv_sku,
                'existing_parent_id'  => $existing_pid,
                'existing_child_skus' => $existing_child_skus
            ]);
            summary_emit(); return $res;

        } else {
            $v0 = $vars[0] ?? []; $is_in = emega_is_instock($v0['inventory_status'] ?? null);
            if (EMEGA_OOS_SKIP_BOOL && !$is_in) { summary_emit(); return ['status'=>'skipped','reason'=>'simple product OOS']; }

            // SIMPLE: dedupe using the CSV SKU (authoritative)
            if ($csv_sku !== '' && emega_sku_exists_fast($csv_sku,$woo_skus_set,$mirror_skus_set)) {
                summary_emit(); return ['status'=>'skipped','reason'=>"SKU exists (precheck simple): $csv_sku"]; }

            $res = createNewProduct($pd, ['simple_instock'=>$is_in,'csv_sku'=>$csv_sku]); summary_emit(); return $res;
        }
    }

    summary_emit();
    return ['status'=>'skipped','reason'=>'No actionable payload'];
}

/* =========================
   CREATION (parent + variations)
   ========================= */
function createNewProduct($pd, $policy = []) {
    require_once(__DIR__ . '/class/class-wooapi.php');
    $wooProd = new wooApiManagement();
    global $conn_emega; // for category resolution

    $all = is_array($pd['variations'] ?? null) ? $pd['variations'] : [];
    $n   = (int)($pd['amount_of_variations'] ?? 0);

    // Build sets
    $in = array_values(array_filter($all, function($v){ return emega_is_instock($v['inventory_status'] ?? null); }));

    /* ---------- Parent gallery (HTTPS, de-dupe, cap) ---------- */
    $urls = [];
    if (!empty($pd['main_picture_url']['url'])) $urls[] = (string)$pd['main_picture_url']['url'];
    if (!empty($pd['images']) && is_array($pd['images'])) {
        foreach ($pd['images'] as $im) { if (!empty($im['url'])) $urls[] = (string)$im['url']; }
    }
    foreach ($all as $v) {
        $vu = $v['main_picture_url']['url'] ?? ($v['image_url'] ?? null);
        if ($vu) $urls[] = (string)$vu;
        if (!empty($v['images'])) {
            foreach ($v['images'] as $vim) { if (!empty($vim['url'])) $urls[] = (string)$vim['url']; }
        }
    }
    $seen = []; $gallery = [];
    foreach ($urls as $u) {
        $u = trim($u); if ($u==='') continue;
        if (strpos($u, '//') === 0) $u = 'https:' . $u;
        if (strpos($u, 'http://') === 0) $u = 'https://' . substr($u, 7);
        $k = strtolower($u);
        if (isset($seen[$k])) continue;
        $seen[$k] = true;
        $gallery[] = ['src' => $u, 'position' => count($gallery)];
        if (count($gallery) >= EMEGA_GALLERY_LIMIT) break;
    }

    // Tags (append-only)
    $auto_tags = is_array($pd['tags'] ?? null) ? array_map('strval', $pd['tags']) : [];
    $user_tags = emega_resolve_tags();
    $names = array_merge($auto_tags, $user_tags);
    $seenTags=[]; $tag_names=[];
    foreach ($names as $nm) {
        $t=trim((string)$nm); if($t==='') continue;
        $k=function_exists('mb_strtolower')?mb_strtolower($t,'UTF-8'):strtolower($t);
        if(!isset($seenTags[$k])){ $seenTags[$k]=true; $tag_names[]=$t; }
    }
    $tag_objs = array_map(function($t){ return ['name'=>$t]; }, $tag_names);

    // === CATEGORY RESOLUTION ===
    // 1) Primary from AutoDS tags (first match wins), else fallback to 'uncategorized'
    $primary_term_id = emega_resolve_primary_term_from_tags($conn_emega, $auto_tags);
    if ($primary_term_id <= 0) { $primary_term_id = emega_term_id_from_view($conn_emega, 'uncategorized'); }

    // 2) Promo categories from config (e.g., in-stock, product-feed)
    $promo_ids = emega_resolve_category_ids(); // existing helper using WP API

    // 3) Merge primary + promos (for initial create payload only)
    $cat_ids_all = [];
    if ($primary_term_id > 0) $cat_ids_all[] = $primary_term_id;
    foreach ($promo_ids as $pidX) { if ($pidX > 0) $cat_ids_all[] = (int)$pidX; }
    $cat_ids_all = array_values(array_unique($cat_ids_all));
    $cat_objs    = array_map(function($id){ return ['id'=>(int)$id]; }, $cat_ids_all);

    // === Attribute normalization ===
    $basis = (EMEGA_OOS_SKIP_BOOL ? $in : $all);
    $byk = [];
    foreach ($basis as $v) {
        foreach ((array)($v['attributes'] ?? []) as $k=>$val) {
            if (!isset($byk[$k])) $byk[$k] = [];
            $val  = (string)$val;
            $slug = emega_is_tax_attr_name($k) ? emega_slug($val) : $val;
            if (!in_array($slug, $byk[$k], true)) $byk[$k][] = $slug;
        }
    }
    emega_ensure_attribute_terms($byk);

    // Parent attributes (no default_attributes)
    $attrs = [];
    $specs = is_array($pd['item_specifics'] ?? null) ? $pd['item_specifics'] : [];
    foreach ($specs as $k=>$v) { $attrs[] = ['name'=>$k,'visible'=>true,'variation'=>false,'options'=>[(string)$v]]; }
    foreach ($byk as $k=>$vals) {
        if (!empty($vals)) {
            $attrs[] = ['name'=>(string)$k,'visible'=>false,'variation'=>true,'options'=>array_values($vals)];
        }
    }

    // Seed prices from first in-stock or first available
    $seed_src   = (!empty($in) ? $in : $all); $seed = $seed_src[0] ?? [];
    $seed_sell  = (float)($seed['price'] ?? 0);
    $seed_buy_raw = isset($seed['active_buy_item']['price']) ? (float)$seed['active_buy_item']['price'] : 0;
    $seed_buy   = ($seed_buy_raw > 0 ? $seed_buy_raw : 0);

    // Parent title
    $parent_title_raw = (string)($pd['title'] ?? '');
    $parent_title     = emega_strip_variant_suffix($parent_title_raw, $all);

    // Determine product type
    $ptype  = ($n > 1) ? 'variable' : 'simple';
    $csvSku = emega_sku_normalize((string)($policy['csv_sku'] ?? ''));

    // DEDUPE inputs
    $existing_parent_id  = isset($policy['existing_parent_id']) ? (int)$policy['existing_parent_id'] : 0;
    $existing_child_skus = array_values(array_unique(array_filter((array)($policy['existing_child_skus'] ?? []))));
    $existing_child_set  = $existing_child_skus ? array_fill_keys($existing_child_skus, true) : [];

    // SKU policy
    $sku = ($ptype === 'simple') ? $csvSku : '';

    // Create or reuse parent/simple in Woo
    $prd = [];
    $just_created = true;
    if ($ptype === 'variable' && $existing_parent_id > 0) {
        // Reuse existing parent (no payload overwrite)
        $pid = $existing_parent_id;
        $prd = ['id' => $pid, 'sku' => '']; // treat as variable parent with no SKU
        $just_created = false;

        // Merge categories (existing + promo) and set a stable primary without REST
        $existing_cat_ids = function_exists('wp_get_post_terms')
            ? (array) wp_get_post_terms($pid, 'product_cat', ['fields' => 'ids'])
            : [];
        $merged_cat_ids = array_values(array_unique(array_merge([$primary_term_id], $existing_cat_ids, $promo_ids)));
        $merged_cat_ids = array_values(array_filter($merged_cat_ids, function($v){ return (int)$v > 0; }));
        emega_assign_categories_and_primary($pid, $merged_cat_ids, (int)$primary_term_id, $promo_ids);

    } else {
        // CREATE new product
        $product_payload = [
            'name'          => $parent_title,
            'type'          => $ptype,
            'regular_price' => (string)$seed_sell,
            'description'   => (string)($pd['description'] ?? ''),
            'images'        => $gallery,
            'sku'           => $sku,
            'tags'          => $tag_objs,
            'tax_status'    => 'taxable',
            'tax_class'     => 'GST',
            'attributes'    => $attrs,
            'status'        => 'publish',
            'manage_stock'  => false,
            'stock_status'  => 'instock',
            // Initial categories; we'll normalize order + primary next
            'categories'    => $cat_objs,
            'meta_data'     => [['key'=>'item_id','value'=>(string)($pd['item_id_on_site'] ?? '')]]
        ];
        $resp=$wooProd->createProduct($product_payload); $prd=is_array($resp['response']??null)?$resp['response']:[];
        if (empty($prd['id'])) { return ['status'=>'failed','reason'=>'No product ID']; }
        $pid=(int)$prd['id'];

        // Normalize order + set primary meta deterministically
        emega_assign_categories_and_primary($pid, $cat_ids_all, (int)$primary_term_id, $promo_ids);
    }
    if (!isset($pid)) { $pid = (int)$prd['id']; }

    // SKU enforcement (only meaningful on simple newly created)
    $wooSku = (string)($prd['sku'] ?? '');
    if ($ptype === 'simple' && $just_created) {
        if ($sku !== '' && $wooSku !== $sku) {
            try { $wooProd->updateProduct($pid, ['sku' => $sku]); } catch (\Throwable $e) { /* non-fatal */ }
        }
    } else if ($ptype === 'variable' && $just_created) {
        if ($wooSku !== '') { try { $wooProd->updateProduct($pid, ['sku' => '']); } catch (\Throwable $e) { /* non-fatal */ } }
    }
    if ($sku!=='') { $GLOBALS['EMEGA_CREATED_SKUS'][] = $sku; $GLOBALS['EMEGA_CREATED_COUNT']++; }

    // Ensure gallery persisted only if just created (avoid clobbering existing listings)
    if ($just_created) {
        $created_images = (array)($prd['images'] ?? []);
        if (empty($created_images) && !empty($gallery)) {
            try { $wooProd->updateProduct($pid, ['images' => $gallery]); } catch (\Throwable $e) { /* non-fatal */ }
        }
    }

    // Force instock + immediate lookup refresh
    emega_force_instock_and_refresh_lookup($pid);

    // Mirror parent/simple (UPSERT)
    $parent_stock_flag = ($n>1) ? (!empty($in)?1:2)
                                : (!empty($all) && emega_is_instock($all[0]['inventory_status']??null) ? 1 : 2);

    emega_mirror_upsert([
        'product_wp_id'         => $pid,
        'product_parent_wp_id'  => 0,
        'product_sku'           => $sku,  // NULL in mirror for parent, CSV for simple
        'product_wp_type'       => 'product',
        'product_type'          => $ptype,
        'product_status'        => 'publish',
        'product_regular_price' => $seed_sell,
        'product_buy_price'     => $seed_buy,
        'product_price'         => $seed_sell,
        'stock_status'          => $parent_stock_flag
    ]);

    // VERIFY mirror parent -> backfill once if missing
    if (!emega_mirror_exists_pid($pid)) {
        log_msg('debug', "[mirror] verify-fail parent pid=$pid — attempting backfill");
        emega_backfill_parent_from_woo($pid);
    }

    // Queue lookup ONLY for base ID
    emega_lookup_queue_add($pid);

    // =========================
    // VARIATIONS
    // =========================
    if ($n > 1) {
        $oos_skip            = EMEGA_OOS_SKIP_BOOL;
        $in_stock_variations = $in;
        $all_variations      = $all;
        $to_create           = ($oos_skip ? $in_stock_variations : $all_variations);

        // Skip variations that already exist (by SKU in Woo or mirror)
        if (!empty($existing_child_set)) {
            $to_create = array_values(array_filter($to_create, function($v) use ($existing_child_set) {
                $s = (string)($v['sku'] ?? '');
                return $s !== '' && empty($existing_child_set[$s]);
            }));
        }

        $mirror_rows = [];
        $created_variation_ids = [];

        // Desired SKU map for enforcement
        $desired_map = [];
        foreach ($to_create as $vv) { $k=(string)($vv['sku']??''); if($k!=='') $desired_map[$k]=$vv; }

        if (method_exists($wooProd, 'batchVariations') && !empty($to_create)) {
            $batch_payload = ['create' => []];

            foreach ($to_create as $v) {
                $vsku = (string)($v['sku'] ?? ''); if ($vsku==='') continue;

                $vattrs = [];
                foreach ((array)($v['attributes'] ?? []) as $name => $val) {
                    $name   = (string)$name;
                    $option = (strpos(strtolower($name), 'pa_') === 0) ? emega_slug($val) : (string)$val;
                    $vattrs[] = ['name' => $name, 'option' => $option];
                }

                $vimg = $v['main_picture_url']['url'] ?? ($v['image_url'] ?? null);
                if ($vimg) {
                    if (strpos($vimg,'//') === 0)   { $vimg = 'https:' . $vimg; }
                    if (strpos($vimg,'http://')===0){ $vimg = 'https://' . substr($vimg,7); }
                }

                $vsell  = (float)($v['price'] ?? 0.0);
                $vtitle = emega_build_variation_title($parent_title, $v);

                $one = [
                    'regular_price' => (string)$vsell,
                    'sku'           => $vsku,
                    'tax_status'    => 'taxable',
                    'tax_class'     => 'GST',
                    'attributes'    => $vattrs,
                    'manage_stock'  => false,
                    'stock_status'  => 'instock',
                    'status'        => 'publish',
                    'meta_data'     => [['key' => 'variant_title', 'value' => $vtitle]],
                ];
                if ($vimg) { $one['image'] = ['src' => $vimg]; }

                $batch_payload['create'][] = $one;
            }

            try {
                $bres = $wooProd->batchVariations($pid, $batch_payload);
                $bdata = is_array($bres['response'] ?? null) ? $bres['response'] : [];
                $created = (array)($bdata['create'] ?? []);

                foreach ($created as $idx => $cv) {
                    $vid = (int)($cv['id'] ?? 0);
                    $ret = (string)($cv['sku'] ?? '');
                    if ($vid <= 0) continue;

                    // Try to lock onto intended SKU
                    $desired_sku = $ret;
                    if ($ret === '' || !isset($desired_map[$ret])) {
                        foreach ($desired_map as $dk=>$src) { if (empty($src['_claimed'])) { $desired_sku=$dk; $desired_map[$dk]['_claimed']=true; break; } }
                    } else {
                        $desired_map[$ret]['_claimed']=true;
                    }

                    // Enforce SKU if Woo returned UUID/different/blank
                    $needs_fix = ($desired_sku !== '' && strcasecmp($ret, $desired_sku) !== 0) || $ret === '';
                    if ($ret !== '' && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $ret)) $needs_fix = true;

                    if ($needs_fix && $desired_sku !== '') {
                        try {
                            if (method_exists($wooProd, 'updateVariationProduct')) {
                                $wooProd->updateVariationProduct($pid, $vid, ['sku'=>$desired_sku]);
                            } elseif (method_exists($wooProd, 'updateProductVariation')) {
                                $wooProd->updateProductVariation($pid, $vid, ['sku'=>$desired_sku]);
                            }
                            $ret = $desired_sku;
                        } catch (\Throwable $e) { /* non-fatal */ }
                    }

                    if ($ret !== '') {
                        $created_variation_ids[] = $vid;
                        $GLOBALS['EMEGA_CREATED_SKUS'][] = $ret; $GLOBALS['EMEGA_CREATED_COUNT']++;

                        $source = $desired_map[$ret] ?? null;
                        $v_in  = $source ? emega_is_instock($source['inventory_status'] ?? null) : true;
                        $vflag = $v_in ? 1 : 2;
                        $vbuy  = (float)($source['active_buy_item']['price'] ?? 0.0);
                        $vsell = (float)($source['price'] ?? 0.0);

                        $mirror_rows[] = [
                            'product_wp_id'         => $vid,
                            'product_parent_wp_id'  => $pid,
                            'product_sku'           => $ret,
                            'product_wp_type'       => 'product_variation',
                            'product_type'          => 'variation',
                            'product_status'        => 'publish',
                            'product_regular_price' => $vsell,
                            'product_buy_price'     => $vbuy,
                            'product_price'         => $vsell,
                            'stock_status'          => $vflag
                        ];
                    }
                }
            } catch (\Throwable $e) {
                $created = []; // fallback below
            }

            if (empty($created) && !empty($to_create)) {
                // single-create fallback
                foreach ($to_create as $v) {
                    $vsku = (string)($v['sku'] ?? ''); if ($vsku==='') continue;

                    $vattrs = [];
                    foreach ((array)($v['attributes'] ?? []) as $name => $val) {
                        $name   = (string)$name;
                        $option = (strpos(strtolower($name), 'pa_') === 0) ? emega_slug($val) : (string)$val;
                        $vattrs[] = ['name' => $name, 'option' => $option];
                    }

                    $vimg = $v['main_picture_url']['url'] ?? ($v['image_url'] ?? null);
                    if ($vimg) {
                        if (strpos($vimg,'//') === 0)   { $vimg = 'https:' . $vimg; }
                        if (strpos($vimg,'http://')===0){ $vimg = 'https://' . substr($vimg,7); }
                    }

                    $vsell  = (float)($v['price'] ?? 0.0);
                    $vtitle = emega_build_variation_title($parent_title, $v);
                    $var_payload = [
                        'regular_price' => (string)$vsell,
                        'sku'           => $vsku,
                        'tax_status'    => 'taxable',
                        'tax_class'     => 'GST',
                        'attributes'    => $vattrs,
                        'manage_stock'  => false,
                        'stock_status'  => 'instock',
                        'status'        => 'publish',
                        'meta_data'     => [['key' => 'variant_title', 'value' => $vtitle]],
                    ];
                    if ($vimg) { $var_payload['image'] = ['src' => $vimg]; }

                    $vres  = $wooProd->createVariationProduct($pid, $var_payload);
                    $vdata = is_array($vres['response'] ?? null) ? $vres['response'] : [];
                    $vid   = (int)($vdata['id'] ?? 0); if ($vid <= 0) continue;

                    // Enforce variation SKU if Woo responds different/UUID
                    $ret = (string)($vdata['sku'] ?? '');
                    $needs_fix = ($ret === '' || strcasecmp($ret, $vsku) !== 0 ||
                                  preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $ret));
                    if ($needs_fix) {
                        try {
                            if (method_exists($wooProd, 'updateVariationProduct')) {
                                $wooProd->updateVariationProduct($pid, $vid, ['sku'=>$vsku]);
                            } elseif (method_exists($wooProd, 'updateProductVariation')) {
                                $wooProd->updateProductVariation($pid, $vid, ['sku'=>$vsku]);
                            }
                            $ret = $vsku;
                        } catch (\Throwable $e) { /* non-fatal */ }
                    }

                    if (($vdata['stock_status'] ?? 'instock') !== 'instock') {
                        if (function_exists('update_post_meta')) {
                            update_post_meta($vid, '_manage_stock', 'no');
                            update_post_meta($vid, '_stock_status', 'instock');
                        }
                        if (function_exists('wc_update_product_stock_status')) {
                            wc_update_product_stock_status($vid, 'instock');
                        }
                    }

                    $v_in  = emega_is_instock($v['inventory_status'] ?? null);
                    $vflag = $v_in ? 1 : 2;
                    $vbuy  = (float)($v['active_buy_item']['price'] ?? 0.0);

                    $mirror_rows[] = [
                        'product_wp_id'         => $vid,
                        'product_parent_wp_id'  => $pid,
                        'product_sku'           => $ret,
                        'product_wp_type'       => 'product_variation',
                        'product_type'          => 'variation',
                        'product_status'        => 'publish',
                        'product_regular_price' => (float)($v['price'] ?? 0.0),
                        'product_buy_price'     => $vbuy,
                        'product_price'         => (float)($v['price'] ?? 0.0),
                        'stock_status'          => $vflag
                    ];
                    $created_variation_ids[] = $vid;
                    if ($ret!=='') { $GLOBALS['EMEGA_CREATED_SKUS'][] = $ret; $GLOBALS['EMEGA_CREATED_COUNT']++; }
                }
            }
        } else {
            // No batch support: single creates
            foreach ($to_create as $v) {
                $vsku = (string)($v['sku'] ?? ''); if ($vsku==='') continue;

                $vattrs = [];
                foreach ((array)($v['attributes'] ?? []) as $name => $val) {
                    $name   = (string)$name;
                    $option = (strpos(strtolower($name), 'pa_') === 0) ? emega_slug($val) : (string)$val;
                    $vattrs[] = ['name' => $name, 'option' => $option];
                }

                $vimg = $v['main_picture_url']['url'] ?? ($v['image_url'] ?? null);
                if ($vimg) {
                    if (strpos($vimg,'//') === 0)   { $vimg = 'https:' . $vimg; }
                    if (strpos($vimg,'http://')===0){ $vimg = 'https://' . substr($vimg,7); }
                }

                $vsell  = (float)($v['price'] ?? 0.0);
                $vtitle = emega_build_variation_title($parent_title, $v);
                $var_payload = [
                    'regular_price' => (string)$vsell,
                    'sku'           => $vsku,
                    'tax_status'    => 'taxable',
                    'tax_class'     => 'GST',
                    'attributes'    => $vattrs,
                    'manage_stock'  => false,
                    'stock_status'  => 'instock',
                    'status'        => 'publish',
                    'meta_data'     => [['key' => 'variant_title', 'value' => $vtitle]],
                ];
                if ($vimg) { $var_payload['image'] = ['src' => $vimg]; }

                $vres  = $wooProd->createVariationProduct($pid, $var_payload);
                $vdata = is_array($vres['response'] ?? null) ? $vres['response'] : [];
                $vid   = (int)($vdata['id'] ?? 0); if ($vid <= 0) continue;

                // Enforce variation SKU if Woo responds different/UUID
                $ret = (string)($vdata['sku'] ?? '');
                $needs_fix = ($ret === '' || strcasecmp($ret, $vsku) !== 0 ||
                              preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $ret));
                if ($needs_fix) {
                    try {
                        if (method_exists($wooProd, 'updateVariationProduct')) {
                            $wooProd->updateVariationProduct($pid, $vid, ['sku'=>$vsku]);
                        } elseif (method_exists($wooProd, 'updateProductVariation')) {
                            $wooProd->updateProductVariation($pid, $vid, ['sku'=>$vsku]);
                        }
                        $ret = $vsku;
                    } catch (\Throwable $e) { /* non-fatal */ }
                }

                if (($vdata['stock_status'] ?? 'instock') !== 'instock') {
                    if (function_exists('update_post_meta')) {
                        update_post_meta($vid, '_manage_stock', 'no');
                        update_post_meta($vid, '_stock_status', 'instock');
                    }
                    if (function_exists('wc_update_product_stock_status')) {
                        wc_update_product_stock_status($vid, 'instock');
                    }
                }

                $v_in  = emega_is_instock($v['inventory_status'] ?? null);
                $vflag = $v_in ? 1 : 2;
                $vbuy  = (float)($v['active_buy_item']['price'] ?? 0.0);

                $mirror_rows[] = [
                    'product_wp_id'         => $vid,
                    'product_parent_wp_id'  => $pid,
                    'product_sku'           => $ret,
                    'product_wp_type'       => 'product_variation',
                    'product_type'          => 'variation',
                    'product_status'        => 'publish',
                    'product_regular_price' => $vsell,
                    'product_buy_price'     => $vbuy,
                    'product_price'         => $vsell,
                    'stock_status'          => $vflag
                ];
                $created_variation_ids[] = $vid;
                if ($ret!=='') { $GLOBALS['EMEGA_CREATED_SKUS'][] = $ret; $GLOBALS['EMEGA_CREATED_COUNT']++; }
            }
        }

        // Batch UPSERT into mirror
        if (!empty($mirror_rows)) { emega_mirror_upsert_many($mirror_rows); }

        // Variation parity check (ensure each created var has a mirror row)
        if (!empty($created_variation_ids)) {
            global $req_conn, $SHOP_TBL;
            $place = implode(',', array_fill(0, count($created_variation_ids), '?'));
            $types = str_repeat('i', count($created_variation_ids));
            $sql   = "SELECT product_wp_id FROM $SHOP_TBL WHERE product_wp_id IN ($place)";
            $st    = $req_conn->prepare($sql);
            $st->bind_param($types, ...$created_variation_ids);
            $st->execute(); $res=$st->get_result();
            $have=[]; while($r=$res->fetch_assoc()){ $have[(int)$r['product_wp_id']]=true; }
            $st->close();

            $miss = array_values(array_filter($created_variation_ids, function($vid) use ($have) {
                return empty($have[(int)$vid]);
            }));

            if (!empty($miss)) {
                log_msg('debug', '[mirror] missing variations count='.count($miss).' — refilling individually');
                foreach ($miss as $vid) {
                    if (emega_mirror_upsert([
                        'product_wp_id'         => (int)$vid,
                        'product_parent_wp_id'  => $pid,
                        'product_sku'           => '',
                        'product_wp_type'       => 'product_variation',
                        'product_type'          => 'variation',
                        'product_status'        => 'publish',
                        'product_regular_price' => 0,
                        'product_buy_price'     => 0,
                        'product_price'         => 0,
                        'stock_status'          => 1
                    ])) {
                        // count handled inside emega_mirror_upsert
                    }
                }
            }
        }

        // Sync parent + ensure instock + immediate lookup refresh
        if (class_exists('WC_Product_Variable') && method_exists('WC_Product_Variable','sync')) {
            WC_Product_Variable::sync($pid);
        }
        emega_force_instock_and_refresh_lookup($pid);

        // Queue lookup base ID again (no harm)
        emega_lookup_queue_add($pid);
    }

    return ['status'=>'synced','product_id'=>$pid];
}

/* =========================
   VARIANT TITLE BUILDER
   ========================= */
function emega_build_variation_title($parentTitle, $variation, $sep=' / ') {
    $parentTitle = trim((string)$parentTitle);
    $auto = trim((string)($variation['title'] ?? ''));
    if ($auto !== '') return $auto;
    $parts = [];
    foreach ((array)($variation['attributes'] ?? []) as $k=>$val) {
        $val = trim((string)$val);
        if ($val !== '') $parts[] = $val;
    }
    return $parts ? ($parentTitle.' — '.implode($sep, $parts)) : $parentTitle;
}

/* =========================
   MINIMAL SUMMARY EMITTER (TOTALS ONLY)
   ========================= */
function summary_emit() {
    $created_total = (int)($GLOBALS['EMEGA_CREATED_COUNT'] ?? 0);
    $mirrored_rows = (int)($GLOBALS['EMEGA_MIRROR_ROWS']   ?? 0);
    log_msg('info', "[manualfunction] Totals — created_in_woo=$created_total, mirrored_rows=$mirrored_rows");
}
?>
