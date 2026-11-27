import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { restaurantOperationsAPI as operations } from '../services/api';
import './RestaurantOperations.css';

const statusLabel = (status = 'unpaid') => ({
  completed: 'Paid',
  posted_to_folio: 'Posted to folio',
  pending: 'Pending confirmation'
}[status] || status.replaceAll('_', ' '));

const money = (amount, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
export const currencyTotals = (amounts = {}) =>
  Object.entries(amounts).map(([currency, amount]) => money(amount, currency)).join(' · ') || '—';

export function salesRange(preset, today) {
  const date = new Date(`${today}T00:00:00Z`);
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const offset = preset === 'yesterday' ? 1 : preset === 'week' ? 6 : 0;
  date.setUTCDate(date.getUTCDate() - offset);
  const from = date.toISOString().slice(0, 10);
  return { from, to: preset === 'yesterday' ? from : today };
}

const errorText = error => error.response?.data?.error || 'The restaurant operation could not be completed.';
const dateTime = value => value ? new Date(value).toLocaleString() : '—';
const activeStatuses = ['PENDING', 'CONFIRMED', 'SEATED'];

function useRequest(loader) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let current = true;
    setState({ loading: true });
    loader().then(response => {
      if (current) setState({ data: response.data.data });
    }).catch(error => {
      if (current) setState({ error: errorText(error) });
    });
    return () => { current = false; };
  }, [loader]);
  return state;
}

export function RestaurantSelection() {
  const state = useRequest(useCallback(() => operations.getRestaurants(), []));
  return (
    <section className="management-dashboard-panel restaurant-selection">
      <div className="management-dashboard-panel-head"><h2>Open a restaurant</h2></div>
      {state.loading && <p className="management-dashboard-empty">Loading restaurants…</p>}
      {state.error && <p className="management-dashboard-error" role="alert">{state.error}</p>}
      {state.data?.length === 0 && <p className="management-dashboard-empty">No active restaurants at this property.</p>}
      <div className="restaurant-selection-grid">
        {state.data?.map(restaurant => (
          <Link className="restaurant-venue-card" key={restaurant._id} to={`/admin/restaurants/operations/${restaurant._id}`}>
            {restaurant.heroImage || restaurant.featuredImage
              ? <img src={restaurant.heroImage || restaurant.featuredImage} alt="" loading="lazy" />
              : <div className="restaurant-venue-placeholder" aria-hidden="true" />}
            <div className="restaurant-venue-content">
              <h3>{restaurant.name}</h3>
              <p>{restaurant.restaurantType}</p>
              <dl>
                <div><dt>Reservations today</dt><dd>{restaurant.reservationsToday}</dd></div>
                <div><dt>Arrived guests today</dt><dd>{restaurant.arrivedGuests}</dd></div>
                <div><dt>Total orders</dt><dd>{restaurant.totalOrders}</dd></div>
                <div><dt>Sales today</dt><dd>{currencyTotals(restaurant.sales)}</dd></div>
              </dl>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const defaultFilters = { period: 'today', status: '', arrivalStatus: '', search: '' };

export default function RestaurantOperations() {
  const { restaurantId } = useParams();
  const [filters, setFilters] = useState(defaultFilters);
  const [tab, setTab] = useState('reservations');
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState();
  const [editing, setEditing] = useState();
  const [billId, setBillId] = useState();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reservations = useRequest(useCallback(
    () => operations.getReservations(restaurantId, filters), [restaurantId, filters, version]
  ));
  const selected = reservations.data?.reservations.find(row => row._id === selectedId);
  const refresh = () => setVersion(current => current + 1);

  const run = async work => {
    setError('');
    setBusy(true);
    try {
      await work();
      refresh();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const updateFilter = event => setFilters({ ...filters, [event.target.name]: event.target.value });

  return (
    <main className="management-dashboard content-wrapper restaurant-operations">
      <header className="management-dashboard-header">
        <div><Link to="/admin/restaurants/dashboard">← All restaurants</Link><h1>{reservations.data?.restaurant.name || 'Restaurant operations'}</h1></div>
        <button type="button" className="btn btn-secondary" onClick={refresh}>Refresh</button>
      </header>
      <div className="restaurant-toolbar">
        <button type="button" className={`btn btn-${tab === 'reservations' ? 'primary' : 'secondary'}`} onClick={() => setTab('reservations')}>Reservations</button>
        <button type="button" className={`btn btn-${tab === 'sales' ? 'primary' : 'secondary'}`} onClick={() => setTab('sales')}>Sales</button>
      </div>
      {error && <p className="management-dashboard-error" role="alert">{error}</p>}
      {reservations.error && <p className="management-dashboard-error" role="alert">{reservations.error}</p>}
      {tab === 'reservations' && <>
        <section className="management-dashboard-panel">
          <div className="restaurant-toolbar">
            <label>Period<select name="period" value={filters.period} onChange={updateFilter}>
              <option value="today">Today</option><option value="upcoming">Upcoming</option>
              <option value="past">Past</option><option value="all">All</option>
            </select></label>
            <label>Reservation status<select name="status" value={filters.status} onChange={updateFilter}>
              <option value="">All statuses</option>{[...activeStatuses, 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map(status => <option key={status}>{status}</option>)}
            </select></label>
            <label>Arrival status<select name="arrivalStatus" value={filters.arrivalStatus} onChange={updateFilter}>
              <option value="">All arrivals</option><option>EXPECTED</option><option>ARRIVED</option><option>NO_SHOW</option>
            </select></label>
            <label>Customer or confirmation<input name="search" maxLength={100} value={filters.search} onChange={updateFilter} /></label>
          </div>
          {reservations.loading && <p className="management-dashboard-empty">Loading reservations…</p>}
          {reservations.data?.reservations.length === 0 && <p className="management-dashboard-empty">No reservations match these filters.</p>}
          {!!reservations.data?.reservations.length && <div className="management-dashboard-table-wrap">
            <table>
              <thead><tr><th>Reservation</th><th>Customer</th><th>Slot</th><th>Guests / table</th><th>Status</th><th>Arrival</th><th>Reservation payment</th><th>Order</th><th>Actions</th></tr></thead>
              <tbody>{reservations.data.reservations.map(row => <tr key={row._id}>
                <td>{row.confirmationNumber}</td><td>{row.customerName}<br />{row.email}<br />{row.phone}<br />{row.guestType}</td>
                <td>{row.date}<br />{row.time}</td><td>{row.guestCount} / {row.table?.tableNumber || '—'}</td>
                <td>{row.status}</td><td><span className={`restaurant-badge ${row.arrivalStatus === 'ARRIVED' ? 'restaurant-arrived' : ''}`}>{row.arrivalStatus}</span></td>
                <td>{row.paymentStatus}{row.outstandingBalance > 0 && <><br />{money(row.outstandingBalance, row.savedReservationCurrency)} due</>}
                  {row.paymentReconciliationRequired && <><br />Reconciliation required</>}</td><td>{row.order ? statusLabel(row.orderPaymentStatus) : '—'}</td>
                <td className="restaurant-row-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => setSelectedId(row._id)}>Details</button>
                  {activeStatuses.includes(row.status) && row.arrivalStatus === 'EXPECTED' &&
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => operations.arrive(restaurantId, row._id))}>Mark as arrived</button>}
                  {row.status !== 'SEATED' && row.arrivalStatus === 'ARRIVED' && ['PENDING', 'CONFIRMED'].includes(row.status) &&
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => operations.seat(restaurantId, row._id))}>Seat Guest</button>}
                  {!row.order && row.status === 'SEATED' && row.arrivalStatus === 'ARRIVED' &&
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => { setBillId(undefined); setEditing(row); }}>Create order</button>}
                  {row.status === 'SEATED' && <button className="btn btn-sm btn-secondary" disabled={busy}
                    onClick={() => run(() => operations.complete(row._id))}>Complete dining</button>}
                  {row.order && <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(undefined); setBillId(row.order._id); }}>View bill</button>}
                </td>
              </tr>)}</tbody>
            </table>
          </div>}
        </section>
        {selected && <section className="management-dashboard-panel restaurant-detail">
          <h2>{selected.customerName} · {selected.confirmationNumber}</h2>
          <p>{selected.guestType} · {selected.email} · {selected.phone}</p>
          <p>{selected.date} at {selected.time} · {selected.guestCount} guests · Table {selected.table?.tableNumber || 'unassigned'}</p>
          <p>{selected.arrivalStatus} {selected.arrivedAt && `at ${dateTime(selected.arrivedAt)} by ${selected.arrivedBy?.name || 'staff'}`}</p>
          {selected.status === 'SEATED' && <p>Seated at {dateTime(selected.seatedAt)} by {selected.seatedBy?.name || 'staff'}</p>}
          {selected.specialRequests && <p>Requests: {selected.specialRequests}</p>}
          <button className="btn btn-secondary" onClick={() => setSelectedId(undefined)}>Close details</button>
        </section>}
        {editing && <OrderEditor key={editing._id} restaurantId={restaurantId} reservation={editing} currency={reservations.data?.currency}
          busy={busy} onClose={() => setEditing(undefined)}
          onSave={items => run(async () => {
            const response = await operations.saveOrder(restaurantId, editing._id, items, Boolean(editing.order));
            setEditing(undefined);
            setBillId(response.data.data._id);
          })} />}
        {billId && <Bill key={billId} restaurantId={restaurantId} billId={billId} busy={busy} version={version}
          onClose={() => setBillId(undefined)} onRefresh={refresh} onPay={work => run(work)}
          onEdit={(order, reservation) => { setBillId(undefined); setEditing({ ...reservation, order }); }} />}
      </>}
      {tab === 'sales' && reservations.data && <RestaurantSales restaurantId={restaurantId} today={reservations.data.today} version={version} />}
    </main>
  );
}

function OrderEditor({ restaurantId, reservation, currency, busy, onClose, onSave }) {
  const menu = useRequest(useCallback(() => operations.getMenu(restaurantId), [restaurantId]));
  const [lines, setLines] = useState(() => reservation.order?.items.map(item => ({
    menuItem: String(item.menuItem), quantity: item.quantity
  })) || []);
  const [choice, setChoice] = useState('');
  const [editError, setEditError] = useState('');
  const choices = new Map((menu.data || []).map(item => [item._id, item]));
  for (const item of reservation.order?.items || []) {
    choices.set(String(item.menuItem), { ...item, price: item.unitPrice, currency: reservation.order.currency });
  }
  const orderCurrency = reservation.order?.currency || currency;
  const previewTotal = lines.reduce((total, line) =>
    total + (choices.get(line.menuItem)?.price || 0) * (line.quantity || 0), 0);
  const add = () => {
    setEditError('');
    if (lines.some(line => line.menuItem === choice)) {
      setEditError('Change the quantity on the existing line.');
      return;
    }
    setLines([...lines, { menuItem: choice, quantity: 1 }]);
    setChoice('');
  };
  return <section className="management-dashboard-panel restaurant-detail">
    <h2>{reservation.order ? 'Edit order' : 'Create order'} · {reservation.confirmationNumber}</h2>
    <p>{reservation.customerName} · Table {reservation.table?.tableNumber || reservation.order?.tableNumber || 'unassigned'}</p>
    {menu.loading && <p>Loading available menu items…</p>}
    {menu.error && <p role="alert">{menu.error}</p>}
    {editError && <p role="alert">{editError}</p>}
    <form onSubmit={event => { event.preventDefault(); onSave(lines); }}>
      <div className="restaurant-toolbar">
        <label>Menu item<select value={choice} onChange={event => setChoice(event.target.value)}>
          <option value="">Select an item</option>
          {menu.data?.filter(item => item.currency === orderCurrency).map(item => <option key={item._id} value={item._id}>{item.name} · {money(item.price, item.currency)}</option>)}
        </select></label>
        <button type="button" className="btn btn-secondary" disabled={!choice || busy} onClick={add}>Add item</button>
      </div>
      {lines.map((line, index) => {
        const item = choices.get(line.menuItem);
        return <div className="restaurant-toolbar" key={line.menuItem}>
          <span>{item?.name || 'Menu item'} {item && money(item.price, item.currency)}</span>
          <label>Quantity<input type="number" min="1" max="100" required value={line.quantity}
            onChange={event => setLines(lines.map((value, i) => i === index ? { ...value, quantity: event.target.valueAsNumber || '' } : value))} /></label>
          {item && <strong>{money(item.price * (line.quantity || 0), item.currency)}</strong>}
          <button type="button" className="btn btn-secondary" onClick={() => setLines(lines.filter((_, i) => i !== index))}>Remove</button>
        </div>;
      })}
      {!!lines.length && orderCurrency && <p>Estimated total {money(previewTotal, orderCurrency)}</p>}
      <div className="restaurant-toolbar">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!lines.length || busy || menu.loading}>Save order</button>
      </div>
    </form>
  </section>;
}

function Bill({ restaurantId, billId, busy, version, onClose, onRefresh, onPay, onEdit }) {
  const state = useRequest(useCallback(() => operations.getBill(restaurantId, billId), [restaurantId, billId, version]));
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [checkout, setCheckout] = useState();
  if (state.loading) return <p>Loading bill…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  const { order, restaurant, property, payment, reservation, canRecoverPayment } = state.data;
  const gatewayCheckout = !order.paymentReconciliationRequired && payment?.paymentStatus === 'pending' &&
    checkout?.paymentReference === payment.paymentReference ? checkout : null;
  const canChooseMethod = !order.settlementStarted || canRecoverPayment;
  const settlementMethod = payment?.paymentStatus === 'pending' ? 'PAYHERE' : method;

  const submit = event => {
    event.preventDefault();
    onPay(async () => {
      const response = await operations.pay(restaurantId, billId, {
        method: settlementMethod, amount: Number(amount || order.total), transactionReference: reference
      });
      setCheckout(response.data.data.checkout);
    });
  };

  return <section className="management-dashboard-panel restaurant-detail restaurant-bill">
    <h2>{restaurant.name} · {payment?.paymentStatus === 'completed' ? 'Receipt' : 'Bill'} {order.orderNumber}</h2>
    <p>{property.name} · {restaurant.location || property.address} {restaurant.phone}</p>
    <p>{order.confirmationNumber} · {order.customerName} · Table {order.tableNumber || 'unassigned'}</p>
    <p>{dateTime(order.createdAt)} · Entered by {order.createdBy?.name || 'staff'}</p>
    <div className="management-dashboard-table-wrap"><table>
      <thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead>
      <tbody>{order.items.map(item => <tr key={item.menuItem}><td>{item.name}</td><td>{item.quantity}</td>
        <td>{money(item.unitPrice, order.currency)}</td><td>{money(item.lineTotal, order.currency)}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan="3">Subtotal</th><td>{money(order.subtotal, order.currency)}</td></tr>
        <tr><th colSpan="3">Grand total</th><td>{money(order.total, order.currency)}</td></tr></tfoot>
    </table></div>
    <p>{statusLabel(payment?.paymentStatus)} {payment?.paymentMethod && `· ${payment.paymentMethod} · ${payment.paymentReference}`}</p>
    <div className="restaurant-toolbar restaurant-no-print">
      <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
      <button className="btn btn-secondary" onClick={onClose}>Close bill</button>
      {!order.settlementStarted && reservation && activeStatuses.includes(reservation.status) &&
        <button className="btn btn-secondary" onClick={() => onEdit(order, reservation)}>Edit items</button>}
      {payment?.paymentMethod === 'PayHere' && <button className="btn btn-secondary" onClick={onRefresh}>Refresh payment status</button>}
    </div>
    {order.paymentReconciliationRequired && <p role="alert">Payment reconciliation required. Review the gateway records before taking another payment.</p>}
    {canRecoverPayment && <p>The gateway closed the previous attempt. Retry PayHere or choose another payment method.</p>}
    {!order.paymentReconciliationRequired && (canChooseMethod || payment?.paymentStatus === 'pending') && !gatewayCheckout &&
      <form className="restaurant-toolbar restaurant-no-print" onSubmit={submit}>
        {canChooseMethod && <>
          <label>Payment method<select value={method} onChange={event => setMethod(event.target.value)}>
            <option value="CASH">Cash</option><option value="CARD">External card terminal</option>
            <option value="PAYHERE">PayHere</option>
            {reservation?.guestType === 'Hotel Guest' && reservation.hotelReservation && <option value="ROOM_FOLIO">Room folio</option>}
          </select></label>
          {['CASH', 'CARD'].includes(method) && <label>{method === 'CASH' ? 'Cash received' : 'Amount processed'}
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label>}
          {method === 'CARD' && <label>Terminal reference<input required maxLength={120} value={reference} onChange={event => setReference(event.target.value)} /></label>}
        </>}
        <button className="btn btn-primary" disabled={busy}>{settlementMethod === 'PAYHERE' ? (canRecoverPayment ? 'Retry PayHere' : 'Prepare PayHere checkout') : 'Confirm settlement'}</button>
      </form>}
    {gatewayCheckout && <form className="restaurant-toolbar restaurant-no-print" method="POST" target="_blank" action={gatewayCheckout.checkoutUrl}>
      {Object.entries(gatewayCheckout.payHereParams).filter(([key]) => key !== 'sandbox').map(([key, value]) =>
        <input key={key} type="hidden" name={key} value={value} />)}
      <button className="btn btn-primary">Open PayHere</button>
      <span>Refresh payment status after the gateway confirms.</span>
    </form>}
  </section>;
}

function RestaurantSales({ restaurantId, today, version }) {
  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState({ from: today, to: today });
  const range = preset === 'custom' ? custom : salesRange(preset, today);
  const { from, to } = range;
  const state = useRequest(useCallback(() => operations.getSales(restaurantId, { from, to }), [restaurantId, from, to, version]));
  const sales = state.data;
  return <>
    <section className="management-dashboard-panel restaurant-detail">
      <h2>Restaurant sales</h2>
      <div className="restaurant-toolbar">
        <label>Sales period<select value={preset} onChange={event => setPreset(event.target.value)}>
          <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">Last 7 days</option>
          <option value="month">This month</option><option value="custom">Custom range</option>
        </select></label>
        {preset === 'custom' && <><label>From<input type="date" value={custom.from} onChange={event => setCustom({ ...custom, from: event.target.value })} /></label>
          <label>To<input type="date" value={custom.to} onChange={event => setCustom({ ...custom, to: event.target.value })} /></label></>}
      </div>
      <small>Sales use collection dates. Order counts use order dates. History includes orders placed or settled in this period.</small>
      {state.loading && <p>Loading sales…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {sales && <div className="management-dashboard-cards">
        {[
          ['Collected sales', currencyTotals(sales.collectedSales)], ['Orders', sales.orders], ['Paid orders', sales.paidOrders],
          ['Unpaid orders', sales.unpaidOrders], ['Folio orders', sales.folioOrders], ['Average order value', currencyTotals(sales.averageOrderValue)],
          ['Cash', currencyTotals(sales.cash)], ['Card', currencyTotals(sales.card)], ['PayHere', currencyTotals(sales.payHere)],
          ['Posted to folio', currencyTotals(sales.folioPosted)]
        ].map(([label, value]) => <article className="management-dashboard-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </div>}
    </section>
    {sales && <section className="management-dashboard-panel">
      <div className="management-dashboard-panel-head"><h2>Order history</h2></div>
      {!sales.history.length ? <p className="management-dashboard-empty">No orders in this period.</p> : <div className="management-dashboard-table-wrap">
        <table><thead><tr><th>Order</th><th>Customer</th><th>Reservation</th><th>Order date</th><th>Total</th><th>Method</th><th>Status</th></tr></thead>
          <tbody>{sales.history.map(order => <tr key={order._id}><td>{order.orderNumber}</td><td>{order.customerName}</td>
            <td>{order.confirmationNumber}</td><td>{dateTime(order.createdAt)}</td><td>{money(order.total, order.currency)}</td>
            <td>{order.payment?.paymentMethod || '—'}</td><td>{statusLabel(order.payment?.paymentStatus)}</td></tr>)}</tbody></table>
      </div>}
    </section>}
  </>;
}
