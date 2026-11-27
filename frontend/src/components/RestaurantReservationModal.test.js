import { normalizeAvailabilityResult } from '../utils/diningAvailability';

test('uses the suggested table when an older availability API omits the table list', () => {
  const result = normalizeAvailabilityResult({
    success: true,
    available: true,
    availableTablesCount: 3,
    suggestedTableId: 'table-suggested'
  }, 2, 'Any');

  expect(result.available).toBe(true);
  expect(result.availableTables).toEqual([{
    _id: 'table-suggested',
    tableNumber: 'Suggested available table',
    capacity: 2,
    location: ''
  }]);
});

test('preserves the server table choices and understands a nested API response', () => {
  const table = { _id: 'table-1', tableNumber: 'T1', capacity: 4, location: 'Indoor' };
  const result = normalizeAvailabilityResult({
    success: true,
    data: { success: true, available: true, suggestedTableId: 'table-1', availableTables: [table] }
  }, 2, 'Any');

  expect(result.availableTables).toEqual([table]);
});

test('does not synthesize a table when the service reports no suggestion', () => {
  const result = normalizeAvailabilityResult({
    success: true,
    available: true,
    availableTablesCount: 1
  }, 2, 'Any');

  expect(result.availableTables).toEqual([]);
});
