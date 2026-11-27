export function normalizeAvailabilityResult(payload, guestCount, seatingPreference) {
  const nestedResult = payload?.data;
  const result = nestedResult && typeof nestedResult.available === 'boolean' ? nestedResult : payload;
  const returnedTables = Array.isArray(result?.availableTables) ? result.availableTables : [];
  // Older Dining API deployments return only suggestedTableId and availableTablesCount.
  const tables = returnedTables.length || !result?.suggestedTableId ? returnedTables : [{
    _id: result.suggestedTableId,
    tableNumber: 'Suggested available table',
    capacity: Number(guestCount),
    location: seatingPreference === 'Any' ? '' : seatingPreference
  }];
  return { ...result, availableTables: tables };
}
