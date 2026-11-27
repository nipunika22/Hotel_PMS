import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RestaurantOperations, { RestaurantSelection, salesRange } from './RestaurantOperations';
import { restaurantOperationsAPI as operations } from '../services/api';

jest.mock('../services/api', () => ({
  restaurantOperationsAPI: {
    getRestaurants: jest.fn(), getReservations: jest.fn(), arrive: jest.fn(), seat: jest.fn(),
    getMenu: jest.fn(), saveOrder: jest.fn(), getBill: jest.fn(), pay: jest.fn(), getSales: jest.fn()
  }
}));

const reply = data => Promise.resolve({ data: { data } });
const today = '2026-11-26';
const venue = { _id: 'venue-1', name: 'Test venue', restaurantType: 'Bistro', totalOrders: 2 };
const row = {
  _id: 'reservation-1', confirmationNumber: 'DINE-1', customerName: 'Example guest',
  email: 'fixture@example.test', phone: '0770000000', status: 'CONFIRMED', arrivalStatus: 'EXPECTED',
  date: today, time: '18:00', guestCount: 2, paymentStatus: 'Unpaid'
};
let container, root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

const button = label => [...container.querySelectorAll('button')].find(element => element.textContent === label);
const click = element => act(async () => element.click());

async function render(initialPath, children) {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {children}
    </MemoryRouter>
  ));
}

test('venue cards navigate with the selected restaurant and load its scoped reservations', async () => {
  operations.getRestaurants.mockImplementation(() => reply([venue]));
  operations.getReservations.mockImplementation(() => reply({ restaurant: venue, today, currency: 'LKR', reservations: [row] }));
  await render('/admin/restaurants/dashboard', <Routes>
    <Route path="/admin/restaurants/dashboard" element={<RestaurantSelection />} />
    <Route path="/admin/restaurants/operations/:restaurantId" element={<RestaurantOperations />} />
  </Routes>);
  expect(container.textContent).toContain('Total orders');
  await click(container.querySelector('a.restaurant-venue-card'));
  expect(operations.getReservations).toHaveBeenCalledWith('venue-1', expect.objectContaining({ period: 'today' }));
  expect(container.textContent).toContain('DINE-1');
  const filter = container.querySelector('select[name="period"]');
  await act(async () => {
    filter.value = 'upcoming';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(operations.getReservations).toHaveBeenLastCalledWith('venue-1', expect.objectContaining({ period: 'upcoming' }));
});

test('arrival requires an explicit seating action before the order editor is available', async () => {
  operations.getReservations
    .mockImplementationOnce(() => reply({ restaurant: venue, today, currency: 'LKR', reservations: [row] }))
    .mockImplementationOnce(() => reply({ restaurant: venue, today, currency: 'LKR', reservations: [
      { ...row, arrivalStatus: 'ARRIVED' }
    ] }))
    .mockImplementation(() => reply({ restaurant: venue, today, currency: 'LKR', reservations: [
      { ...row, status: 'SEATED', arrivalStatus: 'ARRIVED', seatedAt: '2026-11-26T10:00:00Z', seatedBy: { name: 'Staff' } }
    ] }));
  operations.arrive.mockImplementation(() => reply({ ...row, arrivalStatus: 'ARRIVED' }));
  operations.seat.mockImplementation(() => reply({ ...row, status: 'SEATED', arrivalStatus: 'ARRIVED' }));
  operations.getMenu.mockImplementation(() => reply([{ _id: 'item-1', name: 'Rice', price: 400, currency: 'LKR' }]));
  operations.saveOrder.mockImplementation(() => reply({ _id: 'order-1' }));
  operations.getBill.mockImplementation(() => reply({
    order: { orderNumber: 'ORD-1', currency: 'LKR', total: 400, subtotal: 400, items: [] },
    restaurant: venue, property: {}, payment: null
  }));
  await render('/admin/restaurants/operations/venue-1', <Routes>
    <Route path="/admin/restaurants/operations/:restaurantId" element={<RestaurantOperations />} />
  </Routes>);
  expect(button('Create order')).toBeUndefined();
  await click(button('Mark as arrived'));
  expect(operations.arrive).toHaveBeenCalledWith('venue-1', 'reservation-1');
  expect(container.textContent).toContain('ARRIVED');
  expect(button('Create order')).toBeUndefined();
  await click(button('Seat Guest'));
  expect(operations.seat).toHaveBeenCalledWith('venue-1', 'reservation-1');
  await click(button('Create order'));
  const menu = [...container.querySelectorAll('select')].find(element => element.textContent.includes('Select an item'));
  await act(async () => {
    menu.value = 'item-1';
    menu.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(button('Add item'));
  await click(button('Save order'));
  expect(operations.saveOrder).toHaveBeenCalledWith('venue-1', 'reservation-1', [{ menuItem: 'item-1', quantity: 1 }], false);
  expect(container.textContent).toContain('Bill ORD-1');
});

test('sales presets use the property reporting date across month boundaries', () => {
  expect(salesRange('yesterday', '2026-11-01')).toEqual({ from: '2026-10-31', to: '2026-10-31' });
  expect(salesRange('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  expect(salesRange('month', today)).toEqual({ from: '2026-11-01', to: today });
});


test('terminal PayHere failure enables a fresh retry while reconciliation blocks it', async () => {
  const order = { _id: 'order-1', orderNumber: 'ORD-1', currency: 'LKR', total: 400, subtotal: 400, settlementStarted: true, items: [] };
  operations.getReservations.mockImplementation(() => reply({ restaurant: venue, today, currency: 'LKR', reservations: [
    { ...row, arrivalStatus: 'ARRIVED', order }
  ] }));
  operations.getBill
    .mockImplementationOnce(() => reply({
      order, restaurant: venue, property: {}, canRecoverPayment: true,
      payment: { paymentStatus: 'failed', paymentMethod: 'PayHere' }
    }))
    .mockImplementation(() => reply({
      order: { ...order, paymentReconciliationRequired: true },
      restaurant: venue, property: {}, canRecoverPayment: false,
      payment: { paymentStatus: 'pending', paymentMethod: 'PayHere' }
    }));
  operations.pay.mockImplementation(() => reply({}));
  await render('/admin/restaurants/operations/venue-1', <Routes>
    <Route path="/admin/restaurants/operations/:restaurantId" element={<RestaurantOperations />} />
  </Routes>);
  await click(button('View bill'));
  const methods = container.querySelector('.restaurant-bill select');
  await act(async () => {
    methods.value = 'PAYHERE';
    methods.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(button('Retry PayHere'));
  expect(operations.pay).toHaveBeenCalledWith('venue-1', 'order-1', expect.objectContaining({ method: 'PAYHERE' }));
  expect(container.textContent).toContain('Payment reconciliation required');
  expect(button('Prepare PayHere checkout')).toBeUndefined();
});
