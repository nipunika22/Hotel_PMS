const mongoose = require("mongoose");
const TravelAgent = require("../models/TravelAgent");

const editableFields = [
  "agentName",
  "companyName",
  "agentCode",
  "email",
  "phone",
  "commissionRate",
  "paymentTerms",
  "status"
];

function pickEditableFields(body) {
  return Object.fromEntries(
    editableFields
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]])
  );
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function isDuplicateKeyError(error) {
  return error && error.code === 11000;
}

function validationError(res, error) {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ error: error.message });
  }
  if (isDuplicateKeyError(error)) {
    return res.status(409).json({ error: "Travel agent code already exists" });
  }
  return null;
}

exports.getAgents = async (req, res) => {
  try {
    const agents = await TravelAgent.find().sort({ createdAt: -1 });
    res.json(agents);
  } catch (err) {
    console.error("Load travel agents error:", err);
    res.status(500).json({ error: "Failed to load travel agents" });
  }
};

exports.getActiveAgents = async (req, res) => {
  try {
    const agents = await TravelAgent.find({ status: "Active" }).sort({ companyName: 1 });
    res.json(agents);
  } catch (err) {
    console.error("Load active travel agents error:", err);
    res.status(500).json({ error: "Failed to load active travel agents" });
  }
};

exports.getAgent = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid travel agent ID format" });
  }

  try {
    const agent = await TravelAgent.findById(id);
    if (!agent) return res.status(404).json({ error: "Travel agent not found" });
    res.json(agent);
  } catch (err) {
    console.error("Load travel agent error:", err);
    res.status(500).json({ error: "Failed to load travel agent" });
  }
};

exports.addAgent = async (req, res) => {
  const fields = pickEditableFields(req.body || {});
  if (!fields.agentName || !fields.companyName || !fields.agentCode) {
    return res.status(400).json({ error: "Agent name, company name, and agent code are required" });
  }

  try {
    const agent = await TravelAgent.create(fields);
    res.status(201).json(agent);
  } catch (err) {
    const response = validationError(res, err);
    if (response) return response;
    console.error("Add travel agent error:", err);
    res.status(500).json({ error: "Failed to add travel agent" });
  }
};

exports.updateAgent = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid travel agent ID format" });
  }

  const updates = pickEditableFields(req.body || {});
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No editable travel agent fields were provided" });
  }
  if (("agentName" in updates && !updates.agentName) ||
      ("companyName" in updates && !updates.companyName) ||
      ("agentCode" in updates && !updates.agentCode)) {
    return res.status(400).json({ error: "Agent name, company name, and agent code cannot be empty" });
  }

  try {
    const agent = await TravelAgent.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });
    if (!agent) return res.status(404).json({ error: "Travel agent not found" });
    res.json(agent);
  } catch (err) {
    const response = validationError(res, err);
    if (response) return response;
    console.error("Update travel agent error:", err);
    res.status(500).json({ error: "Failed to update travel agent" });
  }
};

exports.deleteAgent = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid travel agent ID format" });
  }

  try {
    const agent = await TravelAgent.findByIdAndDelete(id);
    if (!agent) return res.status(404).json({ error: "Travel agent not found" });
    res.json({ message: "Travel agent deleted successfully" });
  } catch (err) {
    console.error("Delete travel agent error:", err);
    res.status(500).json({ error: "Failed to delete travel agent" });
  }
};

exports.updateBalance = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "Invalid travel agent ID format" });
  }

  const rawBalance = req.body?.balance;
  const balance = Number(rawBalance);
  if (rawBalance === undefined || rawBalance === null || rawBalance === "" || !Number.isFinite(balance)) {
    return res.status(400).json({ error: "A valid balance is required" });
  }

  try {
    const agent = await TravelAgent.findByIdAndUpdate(id, { balance }, {
      new: true,
      runValidators: true
    });
    if (!agent) return res.status(404).json({ error: "Travel agent not found" });
    res.json(agent);
  } catch (err) {
    const response = validationError(res, err);
    if (response) return response;
    console.error("Update travel agent balance error:", err);
    res.status(500).json({ error: "Failed to update travel agent balance" });
  }
};

exports.getAgentStats = async (req, res) => {
  try {
    const [totalAgents, activeAgents, totals, topAgents] = await Promise.all([
      TravelAgent.countDocuments(),
      TravelAgent.countDocuments({ status: "Active" }),
      TravelAgent.aggregate([
        {
          $group: {
            _id: null,
            totalBookings: { $sum: "$totalBookings" },
            totalRevenue: { $sum: "$totalRevenue" }
          }
        }
      ]),
      TravelAgent.find().sort({ totalBookings: -1 }).limit(10)
    ]);

    res.json({
      totalAgents,
      activeAgents,
      totalBookings: totals[0]?.totalBookings || 0,
      totalRevenue: totals[0]?.totalRevenue || 0,
      topAgents
    });
  } catch (err) {
    console.error("Load travel agent statistics error:", err);
    res.status(500).json({ error: "Failed to load travel agent statistics" });
  }
};
