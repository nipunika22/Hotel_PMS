import React, { useEffect, useState } from 'react';
import { restaurantAPI } from '../services/api';
import { toast } from 'react-toastify';
import './DepartmentDiningOffers.css';

const emptyForm = { title: '', restaurant: '', shortDescription: '', description: '', image: '', price: '', discount: '', validFrom: '', validUntil: '', applicableDays: '', terms: '', active: true };
const errorText = (error) => error?.response?.data?.error || error?.response?.data?.message || 'The request could not be completed.';
const dateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

export default function DepartmentDiningOffers() {
  const [offers, setOffers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(null);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [validFromFilter, setValidFromFilter] = useState('');
  const [validUntilFilter, setValidUntilFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadOffers = () => restaurantAPI.getAdminOffers().then((response) => setOffers(response.data.data || []));
  useEffect(() => {
    Promise.all([loadOffers(), restaurantAPI.getOfferRestaurants().then((response) => setRestaurants(response.data.data || []))])
      .catch((error) => toast.error(errorText(error))).finally(() => setLoading(false));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (form.validFrom && form.validUntil && new Date(form.validUntil) < new Date(form.validFrom)) {
      toast.error('Valid until must be on or after valid from.');
      return;
    }
    setBusy(true);
    const body = {
      ...form,
      price: form.price === '' ? undefined : Number(form.price),
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
      applicableDays: String(form.applicableDays || '').split(',').map((day) => day.trim()).filter(Boolean)
    };
    try {
      if (form._id) await restaurantAPI.updateOffer(form._id, body);
      else await restaurantAPI.createOffer(body);
      toast.success(form._id ? 'Offer updated.' : 'Offer created.');
      setForm(null);
      await loadOffers();
    } catch (error) { toast.error(errorText(error)); }
    finally { setBusy(false); }
  };

  const toggle = async (offer) => {
    if (offer.active && !window.confirm(`Deactivate “${offer.title}”?`)) return;
    try {
      await restaurantAPI.updateOffer(offer._id, { active: !offer.active });
      toast.success(`Offer ${offer.active ? 'deactivated' : 'activated'}.`);
      await loadOffers();
    } catch (error) { toast.error(errorText(error)); }
  };

  const visibleOffers = offers.filter((offer) => {
    const matchesSearch = `${offer.title} ${offer.shortDescription} ${offer.restaurant?.name || ''}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? offer.active : !offer.active);
    const from = offer.validFrom ? new Date(offer.validFrom).toISOString().slice(0, 10) : '';
    const until = offer.validUntil ? new Date(offer.validUntil).toISOString().slice(0, 10) : '';
    return matchesSearch && matchesStatus && (!validFromFilter || !until || until >= validFromFilter) && (!validUntilFilter || !from || from <= validUntilFilter);
  });
  const pageCount = Math.max(1, Math.ceil(visibleOffers.length / pageSize));
  const paginatedOffers = visibleOffers.slice((page - 1) * pageSize, page * pageSize);
  const edit = (offer) => setForm({ ...emptyForm, ...offer, restaurant: offer.restaurant?._id || offer.restaurant || '', validFrom: dateInput(offer.validFrom), validUntil: dateInput(offer.validUntil), applicableDays: (offer.applicableDays || []).join(', '), price: offer.price ?? '' });

  return <main className="department-offers-page">
    <header><div><h1>Dining Offers</h1><p>Create, edit, and deactivate persisted dining offers for your assigned property.</p></div><button type="button" onClick={() => setForm({ ...emptyForm, restaurant: restaurants.find((item) => item.active)?._id || '' })}>Add Offer</button></header>
    <div className="department-offers-filters">
      <input aria-label="Search dining offers" placeholder="Search offers or restaurants" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select aria-label="Filter by offer status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      <label>Valid on or after<input aria-label="Offers valid on or after" type="date" value={validFromFilter} onChange={(event) => { setValidFromFilter(event.target.value); setPage(1); }} /></label>
      <label>Valid on or before<input aria-label="Offers valid on or before" type="date" value={validUntilFilter} onChange={(event) => { setValidUntilFilter(event.target.value); setPage(1); }} /></label>
    </div>
    <div className="rest-admin-table-container"><table className="rest-pms-table"><thead><tr><th>Offer</th><th>Restaurant</th><th>Price</th><th>Validity</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="6">Loading dining offers…</td></tr> : paginatedOffers.map((offer) => <tr key={offer._id}><td>{offer.title}<small>{offer.shortDescription}</small></td><td>{offer.restaurant?.name || '—'}</td><td>{offer.price == null ? '—' : `${offer.currency || 'LKR'} ${offer.price}`}</td><td>{offer.validFrom ? new Date(offer.validFrom).toLocaleDateString() : '—'} – {offer.validUntil ? new Date(offer.validUntil).toLocaleDateString() : 'Ongoing'}</td><td>{offer.active ? 'Active' : 'Inactive'}</td><td><button type="button" onClick={() => setDetails(offer)}>View</button> <button type="button" onClick={() => edit(offer)}>Edit</button> <button type="button" onClick={() => toggle(offer)}>{offer.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}
    </tbody></table>{!loading && visibleOffers.length === 0 && <p>No dining offers match these filters.</p>}{!loading && visibleOffers.length > pageSize && <nav className="department-offers-pagination" aria-label="Dining offer pages"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}</div>

    {form && <div className="rest-modal-backdrop" role="presentation"><form className="rest-res-modal-panel" onSubmit={save}><h2>{form._id ? 'Edit Dining Offer' : 'Create Dining Offer'}</h2>
      <label>Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Restaurant<select required value={form.restaurant} onChange={(event) => setForm({ ...form, restaurant: event.target.value })}><option value="">Select restaurant</option>{restaurants.filter((item) => item.active).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Short description<input required value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} /></label>
      <label>Description<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label>Image URL<input type="url" value={form.image || ''} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
      <label>Price<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
      <label>Discount<input value={form.discount || ''} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></label>
      <label>Valid from<input type="date" value={form.validFrom || ''} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></label>
      <label>Valid until<input type="date" value={form.validUntil || ''} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} /></label>
      <label>Applicable days (comma separated)<input value={form.applicableDays || ''} onChange={(event) => setForm({ ...form, applicableDays: event.target.value })} /></label>
      <label>Terms<textarea value={form.terms || ''} onChange={(event) => setForm({ ...form, terms: event.target.value })} /></label>
      <div><button type="submit" disabled={busy || restaurants.filter((item) => item.active).length === 0}>{busy ? 'Saving…' : 'Save Offer'}</button> <button type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form></div>}

    {details && <div className="rest-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}><section className="rest-res-modal-panel" role="dialog" aria-modal="true" aria-labelledby="offer-details-title"><h2 id="offer-details-title">{details.title}</h2>{details.image && <img src={details.image} alt={details.title} style={{ maxWidth: '100%' }} />}<p>{details.description}</p><p><strong>Restaurant:</strong> {details.restaurant?.name || '—'}</p><p><strong>Discount:</strong> {details.discount || '—'}</p><p><strong>Applicable days:</strong> {details.applicableDays?.join(', ') || 'Any day'}</p><p><strong>Validity:</strong> {details.validFrom ? new Date(details.validFrom).toLocaleDateString() : '—'} to {details.validUntil ? new Date(details.validUntil).toLocaleDateString() : 'Ongoing'}</p><p><strong>Terms:</strong> {details.terms || '—'}</p><button type="button" onClick={() => setDetails(null)}>Close</button></section></div>}
  </main>;
}
