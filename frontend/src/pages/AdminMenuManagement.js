import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaEdit, FaPlus, FaSearch, FaUtensils, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { restaurantAPI } from '../services/api';
import './AdminMenuManagement.css';

const emptyItem = (restaurant, category = '') => ({ restaurant, category, name: '', description: '', price: '', image: '', available: true, featured: false, dietaryTags: [] });

export default function AdminMenuManagement() {
  const { restaurantId } = useParams();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemForm, setItemForm] = useState(null);
  const [categoryForm, setCategoryForm] = useState(null);
  const selectedRestaurant = restaurants.find((row) => row._id === restaurantId);

  const loadRestaurants = useCallback(async () => {
    const response = await restaurantAPI.getAdminRestaurants();
    setRestaurants((response.data?.data || []).filter((row) => row.active !== false));
  }, []);

  const loadMenu = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [categoryResponse, itemResponse] = await Promise.all([
        restaurantAPI.getAdminMenuCategories({ restaurantId }),
        restaurantAPI.getAdminMenuItems({ restaurantId })
      ]);
      setCategories(categoryResponse.data?.data || []);
      setItems(itemResponse.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to load this restaurant menu.');
      setCategories([]); setItems([]);
    } finally { setLoading(false); }
  }, [restaurantId]);

  useEffect(() => {
    loadRestaurants().catch((error) => toast.error(error.response?.data?.error || 'Unable to load restaurants.'));
  }, [loadRestaurants]);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const categoryMatches = selectedCategory === 'all' || String(item.category?._id || item.category) === selectedCategory;
    const text = `${item.name || ''} ${item.description || ''} ${item.category?.name || ''}`.toLowerCase();
    return categoryMatches && text.includes(search.toLowerCase());
  }), [items, search, selectedCategory]);

  const saveCategory = async (event) => {
    event.preventDefault();
    if (!categoryForm || !restaurantId) return;
    setSaving(true);
    try {
      if (categoryForm._id) await restaurantAPI.updateCategory(categoryForm._id, categoryForm);
      else await restaurantAPI.createCategory({ ...categoryForm, restaurant: restaurantId });
      toast.success(categoryForm._id ? 'Category updated.' : 'Category created.');
      setCategoryForm(null); await loadMenu();
    } catch (error) { toast.error(error.response?.data?.error || 'Unable to save category.'); }
    finally { setSaving(false); }
  };

  const saveItem = async (event) => {
    event.preventDefault();
    if (!itemForm || !restaurantId) return;
    const price = Number(itemForm.price);
    if (!Number.isFinite(price) || price <= 0) { toast.error('Enter a price greater than zero.'); return; }
    setSaving(true);
    try {
      const body = { ...itemForm, restaurant: restaurantId, price };
      if (itemForm._id) await restaurantAPI.updateMenuItem(itemForm._id, body);
      else await restaurantAPI.createMenuItem(body);
      toast.success(itemForm._id ? 'Menu item updated.' : 'Menu item added.');
      setItemForm(null); await loadMenu(); await loadRestaurants();
    } catch (error) { toast.error(error.response?.data?.error || 'Unable to save menu item.'); }
    finally { setSaving(false); }
  };

  const toggleAvailable = async (item) => {
    try { await restaurantAPI.updateMenuItem(item._id, { available: !item.available }); await loadMenu(); await loadRestaurants(); }
    catch (error) { toast.error(error.response?.data?.error || 'Unable to update availability.'); }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Delete “${item.name}”? Items referenced in order history will be made unavailable.`)) return;
    try {
      const response = await restaurantAPI.deleteMenuItem(item._id);
      toast.success(response.data?.message || 'Menu item deleted.'); await loadMenu(); await loadRestaurants();
    } catch (error) { toast.error(error.response?.data?.error || 'Unable to delete item.'); }
  };

  const removeCategory = async (category) => {
    if (!window.confirm(`Delete the “${category.name}” category? It must be empty.`)) return;
    try { await restaurantAPI.deleteCategory(category._id); toast.success('Category deleted.'); await loadMenu(); }
    catch (error) { toast.error(error.response?.data?.error || 'Unable to delete category.'); }
  };

  if (loading && !restaurants.length) return <main className="menu-admin-shell"><p>Loading Menu Management…</p></main>;

  return <main className="menu-admin-shell">
    <header className="menu-admin-header">
      <div><p className="menu-admin-eyebrow">DINING OPERATIONS</p><h1>Menu Management</h1><p>Maintain restaurant menus used by guests and the restaurant order desk.</p></div>
      {restaurantId && <button className="menu-admin-secondary" onClick={() => navigate('/admin/menu-management')}><FaArrowLeft /> All restaurants</button>}
    </header>

    {!restaurantId ? <section className="menu-restaurant-grid" aria-label="Restaurants">
      {restaurants.map((restaurant) => <article className="menu-restaurant-card" key={restaurant._id}>
        {restaurant.heroImage || restaurant.featuredImage ? <img src={restaurant.heroImage || restaurant.featuredImage} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="menu-restaurant-placeholder"><FaUtensils /></div>}
        <div className="menu-restaurant-card-body"><div><h2>{restaurant.name}</h2><span>{restaurant.cuisine || restaurant.restaurantType || 'Restaurant'}</span></div>
          <div className="menu-count-row"><span>{restaurant.menuItemCount || 0} items</span><span>{restaurant.activeMenuItemCount || 0} available</span><span>{restaurant.inactiveMenuItemCount || 0} unavailable</span></div>
          <button className="menu-admin-primary" onClick={() => navigate(`/admin/menu-management/${restaurant._id}`)}>Manage Menu</button>
        </div>
      </article>)}
      {!restaurants.length && <div className="menu-admin-empty">No active restaurants are configured for this property.</div>}
    </section> : !selectedRestaurant ? <div className="menu-admin-empty">Restaurant not found in the current property. <button onClick={() => navigate('/admin/menu-management')}>Choose a restaurant</button></div> : <>
      <section className="menu-selected-banner">{selectedRestaurant.heroImage || selectedRestaurant.featuredImage ? <img src={selectedRestaurant.heroImage || selectedRestaurant.featuredImage} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <FaUtensils />}<div><span>MANAGING MENU</span><h2>{selectedRestaurant.name}</h2><p>{items.length} items · {categories.length} categories</p></div>
        <button className="menu-admin-secondary" onClick={() => navigate('/admin/menu-management')}>Switch restaurant</button>
      </section>
      <div className="menu-admin-toolbar"><div className="menu-category-tabs"><button className={selectedCategory === 'all' ? 'selected' : ''} onClick={() => setSelectedCategory('all')}>All items</button>{categories.map((category) => <div className="menu-category-chip" key={category._id}><button className={selectedCategory === category._id ? 'selected' : ''} onClick={() => setSelectedCategory(category._id)}>{category.name}{category.active === false ? ' · hidden' : ''}</button><button className="menu-category-edit" aria-label={`Edit ${category.name}`} onClick={() => setCategoryForm({ ...category })}><FaEdit /></button><button className="menu-category-edit" aria-label={`Delete ${category.name}`} onClick={() => removeCategory(category)}><FaTrash /></button></div>)}</div>
        <div className="menu-admin-actions"><label className="menu-search"><FaSearch /><input aria-label="Search menu items" placeholder="Search menu" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="menu-admin-secondary" onClick={() => setCategoryForm({ name: '', description: '', active: true })}><FaPlus /> Category</button><button className="menu-admin-primary" disabled={!categories.some((category) => category.active !== false)} onClick={() => setItemForm(emptyItem(restaurantId, categories.find((category) => category.active !== false)?._id || ''))}><FaPlus /> Add Menu Item</button></div>
      </div>
      {loading ? <div className="menu-admin-empty">Loading menu…</div> : visibleItems.length ? <section className="menu-item-grid">{visibleItems.map((item) => <article className={`menu-item-card ${item.available ? '' : 'unavailable'}`} key={item._id}>
        {item.image ? <img src={item.image} alt={item.name} onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="menu-item-placeholder"><FaUtensils /></div>}
        <div className="menu-item-card-body"><div className="menu-item-title"><div><span>{item.category?.name || categories.find((category) => category._id === (item.category?._id || item.category))?.name || 'Uncategorized'}</span><h3>{item.name}</h3></div><strong>LKR {Number(item.price).toLocaleString()}</strong></div>
          <p>{item.description || 'No description provided.'}</p><div className="menu-item-actions"><label className="menu-availability"><input type="checkbox" checked={Boolean(item.available)} onChange={() => toggleAvailable(item)} /><span>{item.available ? 'Available' : 'Unavailable'}</span></label><div><button aria-label={`Edit ${item.name}`} onClick={() => setItemForm({ ...item, category: item.category?._id || item.category })}><FaEdit /></button><button aria-label={`Delete ${item.name}`} onClick={() => removeItem(item)}><FaTrash /></button></div></div>
        </div></article>)}</section> : <div className="menu-admin-empty">{items.length ? 'No items match the current search or category.' : 'This restaurant has no menu items yet. Add a category, then add your first item.'}</div>}
    </>}

    {categoryForm && <div className="menu-modal-backdrop"><form className="menu-modal" onSubmit={saveCategory}><h2>{categoryForm._id ? 'Edit category' : 'Add category'}</h2><label>Category name<input autoFocus required maxLength="80" value={categoryForm.name || ''} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></label><label>Description<textarea value={categoryForm.description || ''} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></label><label className="menu-check"><input type="checkbox" checked={categoryForm.active !== false} onChange={(event) => setCategoryForm({ ...categoryForm, active: event.target.checked })} /> Active on customer menu</label><div className="menu-modal-actions"><button type="button" className="menu-admin-secondary" onClick={() => setCategoryForm(null)}>Cancel</button><button className="menu-admin-primary" disabled={saving}>{saving ? 'Saving…' : 'Save category'}</button></div></form></div>}
    {itemForm && <div className="menu-modal-backdrop"><form className="menu-modal" onSubmit={saveItem}><h2>{itemForm._id ? 'Edit menu item' : 'Add menu item'}</h2><label>Item name<input autoFocus required maxLength="80" value={itemForm.name || ''} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} /></label><label>Description<textarea maxLength="1000" value={itemForm.description || ''} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></label><div className="menu-form-row"><label>Category<select required value={itemForm.category || ''} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })}><option value="">Select category</option>{categories.filter((category) => category.active !== false).map((category) => <option value={category._id} key={category._id}>{category.name}</option>)}</select></label><label>Price (LKR)<input required type="number" min="0.01" step="0.01" value={itemForm.price} onChange={(event) => setItemForm({ ...itemForm, price: event.target.value })} /></label></div><label>Food image URL<input type="url" placeholder="https://…" value={itemForm.image || ''} onChange={(event) => setItemForm({ ...itemForm, image: event.target.value })} /></label>{itemForm.image && <img className="menu-image-preview" src={itemForm.image} alt="Menu item preview" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}<p className="menu-form-label">Dietary tags</p><div className="menu-dietary-options">{['Vegetarian', 'Vegan', 'Seafood', 'Spicy', 'Halal', 'Gluten-free', 'Dairy-free'].map((tag) => <label className="menu-check" key={tag}><input type="checkbox" checked={(itemForm.dietaryTags || []).includes(tag)} onChange={(event) => setItemForm({ ...itemForm, dietaryTags: event.target.checked ? [...(itemForm.dietaryTags || []), tag] : (itemForm.dietaryTags || []).filter((value) => value !== tag) })} /> {tag}</label>)}</div><label className="menu-check"><input type="checkbox" checked={Boolean(itemForm.available)} onChange={(event) => setItemForm({ ...itemForm, available: event.target.checked })} /> Available for new orders</label><label className="menu-check"><input type="checkbox" checked={Boolean(itemForm.featured)} onChange={(event) => setItemForm({ ...itemForm, featured: event.target.checked })} /> Featured item</label><div className="menu-modal-actions"><button type="button" className="menu-admin-secondary" onClick={() => setItemForm(null)}>Cancel</button><button className="menu-admin-primary" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button></div></form></div>}
  </main>;
}
