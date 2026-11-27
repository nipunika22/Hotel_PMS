import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminMenuManagement from './AdminMenuManagement';
import { restaurantAPI } from '../services/api';

jest.mock('../services/api', () => ({ restaurantAPI: {
  getAdminRestaurants: jest.fn(), getAdminMenuCategories: jest.fn(), getAdminMenuItems: jest.fn(),
  createCategory: jest.fn(), updateCategory: jest.fn(), deleteCategory: jest.fn(),
  createMenuItem: jest.fn(), updateMenuItem: jest.fn(), deleteMenuItem: jest.fn()
} }));

let container, root;
const restaurants = [{ _id: 'r1', name: 'North Restaurant', active: true, menuItemCount: 2, activeMenuItemCount: 1, inactiveMenuItemCount: 1 }];
const categories = [{ _id: 'c1', name: 'Lunch', active: true }];
const items = [{ _id: 'i1', name: 'Rice bowl', description: 'Local rice', price: 750, available: true, category: { _id: 'c1', name: 'Lunch' } }];
const reply = data => Promise.resolve({ data: { data } });

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  restaurantAPI.getAdminRestaurants.mockImplementation(() => reply(restaurants));
  restaurantAPI.getAdminMenuCategories.mockImplementation(() => reply(categories));
  restaurantAPI.getAdminMenuItems.mockImplementation(() => reply(items));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); delete global.IS_REACT_ACT_ENVIRONMENT; });

test('restaurant cards open an isolated menu with categories and availability controls', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/admin/menu-management']}><Routes>
    <Route path="/admin/menu-management/:restaurantId?" element={<AdminMenuManagement />} />
  </Routes></MemoryRouter>));
  expect(container.textContent).toContain('North Restaurant');
  expect(container.textContent).toContain('1 available');
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('Manage Menu')).click());
  expect(restaurantAPI.getAdminMenuCategories).toHaveBeenCalledWith({ restaurantId: 'r1' });
  expect(restaurantAPI.getAdminMenuItems).toHaveBeenCalledWith({ restaurantId: 'r1' });
  expect(container.textContent).toContain('Rice bowl');
  expect(container.textContent).toContain('Lunch');
  expect([...container.querySelectorAll('label')].some(label => label.textContent.includes('Available'))).toBe(true);
});
