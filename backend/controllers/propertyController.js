// backend/controllers/propertyController.js
const Property = require("../models/Property");
const HotelChain = require("../models/HotelChain");
const { getActiveProperty } = require("../middleware/propertyContext");

/**
 * @route   GET /api/properties/current
 * @desc    Get the current active property information
 * @access  Public
 */
exports.getCurrentProperty = async (req, res) => {
  try {
    const property = await getActiveProperty();
    if (!property) {
      return res.status(404).json({ error: "No active property found" });
    }
    res.json(property);
  } catch (err) {
    console.error("Error fetching current property:", err);
    res.status(500).json({ error: "Failed to fetch property details" });
  }
};

/**
 * @route   GET /api/properties
 * @desc    Get all properties in the chain
 * @access  Public / Authenticated
 */
exports.getProperties = async (req, res) => {
  try {
    const properties = await Property.find({ status: "Active" }).populate("chain", "name code");
    res.json(properties);
  } catch (err) {
    console.error("Error fetching properties:", err);
    res.status(500).json({ error: "Failed to fetch properties" });
  }
};

/**
 * @route   GET /api/properties/:id
 * @desc    Get property by ID
 * @access  Public / Authenticated
 */
exports.getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate("chain", "name code");
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    res.json(property);
  } catch (err) {
    console.error("Error fetching property:", err);
    res.status(500).json({ error: "Failed to fetch property" });
  }
};

/**
 * @route   PUT /api/properties/:id
 * @desc    Update property details (Admin only)
 * @access  Private (Admin)
 */
exports.updateProperty = async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "address",
      "city",
      "country",
      "phone",
      "email",
      "starRating",
      "amenities",
      "timezone",
      "currency"
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const updated = await Property.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.json({ message: "Property updated successfully", property: updated });
  } catch (err) {
    console.error("Error updating property:", err);
    res.status(500).json({ error: "Failed to update property" });
  }
};
