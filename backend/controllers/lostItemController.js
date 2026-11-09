// backend/controllers/lostItemController.js
const {
  registerLostItem,
  listLostItems,
  getLostItem,
  claimLostItem,
  disposeLostItem
} = require("../services/lostItemService");

// Get all lost items with search and filters (Staff/Manager/Admin)
exports.getItems = async (req, res) => {
  try {
    const filters = { ...req.query };
    if (req.propertyId) filters.property = req.propertyId;
    const items = await listLostItems(filters);
    res.json(items);
  } catch (err) {
    console.error("Get lost items error:", err);
    res.status(500).json({ error: "Failed to load lost & found items" });
  }
};

// Get single lost item by ID
exports.getItem = async (req, res) => {
  try {
    const item = await getLostItem(req.params.id);
    if (
      req.propertyId &&
      item.property &&
      item.property.toString() !== req.propertyId.toString() &&
      req.user &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Access denied to lost item in another property" });
    }
    res.json(item);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to load lost item" });
  }
};

// Register new lost item (Staff, Housekeeping, Manager, Admin)
exports.createItem = async (req, res) => {
  try {
    const item = await registerLostItem({ ...req.body, propertyId: req.propertyId }, req.user.id);
    res.status(201).json(item);
  } catch (err) {
    console.error("Register lost item error:", err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to register lost item" });
  }
};

// Claim a lost item with claimant details and verification (Staff, Manager, Admin)
exports.claimItem = async (req, res) => {
  const { id } = req.params;

  try {
    const item = await claimLostItem(id, req.body, req.user.id);
    res.json(item);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to claim lost item" });
  }
};

// Dispose of an unclaimed lost item (Manager, Admin only)
exports.disposeItem = async (req, res) => {
  const { id } = req.params;

  try {
    const item = await disposeLostItem(id, req.body, req.user.id);
    res.json(item);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to dispose lost item" });
  }
};
