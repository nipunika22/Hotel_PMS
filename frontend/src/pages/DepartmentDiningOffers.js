import React, { useEffect, useMemo, useState } from 'react';
import { FaCheck, FaEdit, FaEye, FaImage, FaPlus, FaSearch, FaTimes, FaUtensils } from 'react-icons/fa';
import { restaurantAPI } from '../services/api';
import { toast } from 'react-toastify';
import './DepartmentDiningOffers.css';

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const createEmptyForm = (restaurant = '') => ({
  title: '',
  restaurant,
  shortDescription: '',
  description: '',
  image: '',
  price: '',
  pricingType: 'PER_GUEST',
  currency: 'LKR',
  discount: '',
  validFrom: getToday(),
  validUntil: '',
  applicableDays: '',
  inclusions: '',
  terms: '',
  active: true
});

const errorText = (error) => error?.response?.data?.error || error?.response?.data?.message || error?.message || 'The request could not be completed.';

const dateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const splitList = (value) => String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const formatOfferPrice = (offer) => {
  const type = offer.pricingType || 'PER_GUEST';
  if (type === 'FREE') return 'Free';
  const amount = type === 'FIXED' ? offer.fixedPrice ?? offer.price : offer.pricePerGuest ?? offer.price;
  if (amount == null) return 'Price on request';
  return `${offer.currency || 'LKR'} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${type === 'FIXED' ? ' fixed' : ' / guest'}`;
};

const formatDate = (value) => {
  if (!value) return 'Ongoing';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

export default function DepartmentDiningOffers() {
  const [offers, setOffers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(null);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const loadOffers = async () => {
    const response = await restaurantAPI.getAdminOffers();
    const list = response.data?.data;
    if (!Array.isArray(list)) throw new Error('The offers service returned an invalid offer list.');
    setOffers(list);
    setLoadError('');
    return list;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [offerResponse, restaurantResponse] = await Promise.all([
        restaurantAPI.getAdminOffers(),
        restaurantAPI.getOfferRestaurants()
      ]);
      if (!Array.isArray(offerResponse.data?.data) || !Array.isArray(restaurantResponse.data?.data)) {
        throw new Error('The dining service returned an invalid response.');
      }
      setOffers(offerResponse.data.data);
      setRestaurants(restaurantResponse.data.data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorText(error));
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeCount = offers.filter((offer) => offer.active !== false).length;
  const inactiveCount = offers.length - activeCount;

  const visibleOffers = useMemo(() => offers.filter((offer) => {
    const restaurantName = typeof offer.restaurant === 'object' ? offer.restaurant?.name : '';
    const searchText = `${offer.title || ''} ${offer.shortDescription || ''} ${offer.description || ''} ${restaurantName}`.toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase().trim());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' ? offer.active !== false : offer.active === false);
    return matchesSearch && matchesStatus;
  }), [offers, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleOffers.length / pageSize));
  const paginatedOffers = visibleOffers.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const edit = (offer) => {
    const restaurantId = typeof offer.restaurant === 'object' ? offer.restaurant?._id : offer.restaurant;
    setDetails(null);
    setForm({
      ...createEmptyForm(),
      ...offer,
      restaurant: restaurantId || '',
      validFrom: dateInput(offer.validFrom),
      validUntil: dateInput(offer.validUntil),
      applicableDays: (offer.applicableDays || []).join(', '),
      inclusions: (offer.inclusions || []).join('\n'),
      pricingType: offer.pricingType || 'PER_GUEST',
      price: offer.pricingType === 'FIXED' ? (offer.fixedPrice ?? offer.price ?? '') : (offer.pricePerGuest ?? offer.price ?? ''),
      currency: offer.currency || 'LKR',
      discount: offer.discount || ''
    });
  };

  const openCreateForm = () => {
    const firstActiveRestaurant = restaurants.find((restaurant) => restaurant.active !== false);
    setForm(createEmptyForm(firstActiveRestaurant?._id || ''));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form || busy) return;

    if (!form.title.trim() || !form.shortDescription.trim() || !form.description.trim()) {
      toast.error('Enter an offer title, short description, and full description.');
      return;
    }
    if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
      toast.error('Valid until must be on or after valid from.');
      return;
    }
    if (form.pricingType !== 'FREE' && (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0)) {
      toast.error('Enter a valid non-negative amount for this offer.');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(form.currency || '')) {
      toast.error('Currency must be a 3-letter code.');
      return;
    }
    const percentage = String(form.discount || '').match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentage && (Number(percentage[1]) < 0 || Number(percentage[1]) > 100)) {
      toast.error('Percentage discounts must be between 0 and 100.');
      return;
    }
    if (String(form.discount || '').match(/(?:^|\s)-\s*\d/)) {
      toast.error('Discount values cannot be negative.');
      return;
    }
    if (!form.restaurant) {
      toast.error('Select a restaurant for this offer.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      slug: slugify(form.title),
      restaurant: form.restaurant,
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      image: form.image.trim(),
      price: form.pricingType === 'FREE' ? 0 : Number(form.price),
      pricingType: form.pricingType,
      pricePerGuest: form.pricingType === 'PER_GUEST' ? Number(form.price) : undefined,
      fixedPrice: form.pricingType === 'FIXED' ? Number(form.price) : undefined,
      currency: form.currency.toUpperCase(),
      discount: form.discount.trim(),
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
      applicableDays: splitList(form.applicableDays),
      inclusions: splitList(form.inclusions),
      terms: form.terms.trim(),
      active: Boolean(form.active)
    };

    setBusy(true);
    try {
      if (form._id) await restaurantAPI.updateOffer(form._id, payload);
      else await restaurantAPI.createOffer(payload);
      toast.success(form._id ? 'Dining offer updated.' : 'Dining offer created.');
      setForm(null);
      await loadOffers();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (offer) => {
    if (offer.active !== false && !window.confirm(`Deactivate “${offer.title}”? Historical reservations will be retained.`)) return;
    try {
      await restaurantAPI.updateOffer(offer._id, { active: offer.active === false });
      const updatedOffers = await loadOffers();
      const updatedOffer = updatedOffers.find((item) => item._id === offer._id);
      setDetails((current) => current?._id === offer._id ? updatedOffer || null : current);
      toast.success(offer.active === false ? 'Dining offer activated.' : 'Dining offer deactivated.');
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const restaurantOptions = restaurants.filter((restaurant) =>
    restaurant.active !== false || restaurant._id === form?.restaurant
  );

  return (
    <main className="department-offers-page">
      <header className="department-offers-header">
        <div>
          <span className="department-offers-eyebrow"><FaUtensils /> RESTAURANT MANAGEMENT</span>
          <h1>Restaurant &amp; Dining Offers Management</h1>
          <p>Manage property dining promotions, prices, validity, and availability.</p>
        </div>
        <button type="button" className="department-offers-primary" onClick={openCreateForm} disabled={!restaurants.some((restaurant) => restaurant.active !== false)}>
          <FaPlus /> Add Dining Offer
        </button>
      </header>

      <section className="department-offers-stats" aria-label="Offer totals">
        <article><span>Total dining offers</span><strong>{offers.length}</strong></article>
        <article><span>Active offers</span><strong>{activeCount}</strong></article>
        <article><span>Inactive offers</span><strong>{inactiveCount}</strong></article>
      </section>

      <section className="department-offers-list">
        <div className="department-offers-list-heading">
          <div><h2>Dining offers</h2><p>{visibleOffers.length} offer{visibleOffers.length === 1 ? '' : 's'} shown</p></div>
          <div className="department-offers-filters">
            <label className="department-offers-search"><FaSearch aria-hidden="true" /><input aria-label="Search dining offers" placeholder="Search offers or restaurants" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
            <select aria-label="Filter by offer status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? <div className="department-offers-message">Loading dining offers…</div> : loadError ? (
          <div className="department-offers-message" role="alert">{loadError}<button type="button" onClick={loadData}>Retry</button></div>
        ) : paginatedOffers.length ? (
          <div className="department-offers-table-wrap">
            <table className="department-offers-table">
              <thead><tr><th>Offer</th><th>Restaurant</th><th>Offer details</th><th>Validity</th><th>Eligibility</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginatedOffers.map((offer) => {
                  const restaurantName = typeof offer.restaurant === 'object' ? offer.restaurant?.name : '';
                  return <tr key={offer._id}>
                    <td><div className="department-offer-identity">
                      {offer.image ? <img src={offer.image} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span className="department-offer-image-placeholder"><FaImage /></span>}
                      <div><strong>{offer.title}</strong><small>{offer.shortDescription || 'No short description'}</small></div>
                    </div></td>
                    <td>{restaurantName || '—'}</td>
                    <td><strong>{formatOfferPrice(offer)}</strong><small>{offer.discount || 'Dining offer'}</small></td>
                    <td>{formatDate(offer.validFrom)} – {formatDate(offer.validUntil)}</td>
                    <td>Not specified</td>
                    <td><span className={`department-offer-status ${offer.active === false ? 'inactive' : 'active'}`}>{offer.active === false ? 'Inactive' : 'Active'}</span></td>
                    <td><div className="department-offer-actions">
                      <button type="button" aria-label={`View ${offer.title}`} onClick={() => setDetails(offer)}><FaEye /> View</button>
                      <button type="button" aria-label={`Edit ${offer.title}`} onClick={() => edit(offer)}><FaEdit /> Edit</button>
                      {offer.active === false
                        ? <button type="button" aria-label={`Activate ${offer.title}`} onClick={() => toggleStatus(offer)}><FaCheck /> Activate</button>
                        : <button type="button" className="danger" aria-label={`Deactivate ${offer.title}`} onClick={() => toggleStatus(offer)}><FaTimes /> Deactivate</button>}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="department-offers-message">{offers.length ? 'No dining offers match your search and status filter.' : 'No dining offers have been created for this property yet.'}</div>}

        {!loading && !loadError && visibleOffers.length > pageSize && <nav className="department-offers-pagination" aria-label="Dining offer pages">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </nav>}
      </section>

      {form && <div className="department-offers-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setForm(null); }}>
        <form className="department-offers-form" onSubmit={save} aria-labelledby="dining-offer-form-title">
          <div className="department-offers-form-header"><div><span>OFFER DETAILS</span><h2 id="dining-offer-form-title">{form._id ? 'Edit Dining Offer' : 'Add Dining Offer'}</h2></div><button type="button" aria-label="Close form" onClick={() => setForm(null)} disabled={busy}><FaTimes /></button></div>
          <div className="department-offers-form-grid">
            <label>Offer title *<input required maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Restaurant *<select required value={form.restaurant} onChange={(event) => setForm({ ...form, restaurant: event.target.value })}><option value="">Select restaurant</option>{restaurantOptions.map((restaurant) => <option key={restaurant._id} value={restaurant._id}>{restaurant.name}{restaurant.active === false ? ' (Inactive)' : ''}</option>)}</select></label>
            <label className="full">Short description *<input required maxLength="240" value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} /></label>
            <label className="full">Full description *<textarea required rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="full">Offer image URL<input type="url" placeholder="https://…" value={form.image || ''} onChange={(event) => setForm({ ...form, image: event.target.value })} /><small>The current offer model stores an image URL; no upload service is configured.</small></label>
            {form.image && <div className="department-offer-preview"><img src={form.image} alt="Dining offer preview" onError={(event) => { event.currentTarget.style.display = 'none'; }} /><span>Image preview</span></div>}
            <label>Offer pricing type *<select required value={form.pricingType} onChange={(event) => setForm({ ...form, pricingType: event.target.value, price: event.target.value === 'FREE' ? '0' : form.price })}><option value="PER_GUEST">Per guest</option><option value="FIXED">Fixed total</option><option value="FREE">Free</option></select><small>Offer prices replace the restaurant's standard reservation rate.</small></label>
            {form.pricingType !== 'FREE' && <label>{form.pricingType === 'FIXED' ? 'Fixed offer price *' : 'Offer price per guest *'}<input type="number" min="0" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>}
            <label>Offer currency *<input required maxLength="3" minLength="3" pattern="[A-Za-z]{3}" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /><small>Use a 3-letter currency code, such as LKR.</small></label>
            <label>Discount<input placeholder="e.g. 20% off or LKR 1,000 off" value={form.discount || ''} onChange={(event) => setForm({ ...form, discount: event.target.value })} /><small>Stored as the existing free-text discount field.</small></label>
            <label>Valid from *<input type="date" required value={form.validFrom || ''} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></label>
            <label>Valid until<input type="date" min={form.validFrom || undefined} value={form.validUntil || ''} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} /><small>Leave blank for an ongoing offer.</small></label>
            <label className="full">Applicable days (comma-separated)<input placeholder="Monday, Tuesday, Wednesday" value={form.applicableDays || ''} onChange={(event) => setForm({ ...form, applicableDays: event.target.value })} /></label>
            <label className="full">Inclusions (one per line)<textarea rows="3" value={form.inclusions || ''} onChange={(event) => setForm({ ...form, inclusions: event.target.value })} /></label>
            <label className="full">Terms and conditions<textarea rows="3" value={form.terms || ''} onChange={(event) => setForm({ ...form, terms: event.target.value })} /></label>
            <label className="department-offer-active"><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active offer</label>
          </div>
          <p className="department-offer-model-note">Offer category and Local/Foreign eligibility are not fields in the current database model, so this form does not create unsupported values.</p>
          <div className="department-offers-form-actions"><button type="button" onClick={() => setForm(null)} disabled={busy}>Cancel</button><button type="submit" className="department-offers-primary" disabled={busy || restaurants.length === 0}>{busy ? 'Saving…' : 'Save Offer'}</button></div>
        </form>
      </div>}

      {details && <div className="department-offers-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}>
        <section className="department-offer-details" role="dialog" aria-modal="true" aria-labelledby="dining-offer-details-title">
          <button type="button" className="department-offer-details-close" aria-label="Close offer details" onClick={() => setDetails(null)}><FaTimes /></button>
          {details.image ? <img className="department-offer-details-image" src={details.image} alt={details.title} onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="department-offer-details-placeholder"><FaUtensils /></div>}
          <div className="department-offer-details-content">
            <span className={`department-offer-status ${details.active === false ? 'inactive' : 'active'}`}>{details.active === false ? 'Inactive' : 'Active'}</span>
            <h2 id="dining-offer-details-title">{details.title}</h2>
            <p className="department-offer-details-restaurant">{typeof details.restaurant === 'object' ? details.restaurant?.name : 'Restaurant not specified'}</p>
            <p>{details.description || details.shortDescription || 'No full description has been added.'}</p>
            <dl>
              <div><dt>Offer category</dt><dd>Dining offer (category not configured in the current model)</dd></div>
              <div><dt>Pricing type</dt><dd>{{ PER_GUEST: 'Per guest', FIXED: 'Fixed total', FREE: 'Free' }[details.pricingType || 'PER_GUEST']}</dd></div>
              <div><dt>Price</dt><dd>{formatOfferPrice(details)}</dd></div>
              <div><dt>Discount</dt><dd>{details.discount || '—'}</dd></div>
              <div><dt>Customer eligibility</dt><dd>Not specified by the current offer model</dd></div>
              <div><dt>Validity</dt><dd>{formatDate(details.validFrom)} – {formatDate(details.validUntil)}</dd></div>
              <div><dt>Applicable days</dt><dd>{details.applicableDays?.length ? details.applicableDays.join(', ') : 'Any day'}</dd></div>
              <div><dt>Inclusions</dt><dd>{details.inclusions?.length ? details.inclusions.join(', ') : '—'}</dd></div>
              <div><dt>Terms</dt><dd>{details.terms || '—'}</dd></div>
              {details.createdAt && <div><dt>Created</dt><dd>{formatDate(details.createdAt)}</dd></div>}
              {details.updatedAt && <div><dt>Updated</dt><dd>{formatDate(details.updatedAt)}</dd></div>}
            </dl>
            <div className="department-offer-details-actions">
              <button type="button" onClick={() => edit(details)}><FaEdit /> Edit</button>
              {details.active === false
                ? <button type="button" onClick={() => toggleStatus(details)}><FaCheck /> Activate</button>
                : <button type="button" className="danger" onClick={() => toggleStatus(details)}><FaTimes /> Deactivate</button>}
              <button type="button" onClick={() => setDetails(null)}>Back</button>
            </div>
          </div>
        </section>
      </div>}
    </main>
  );
}
