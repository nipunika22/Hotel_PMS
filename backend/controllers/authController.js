// backend/controllers/authController.js
const User = require("../models/User");
const Guest = require("../models/Guest");
const jwt = require("jsonwebtoken");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d"
  });
};

// Register user (Public registration - always creates 'customer' and links Guest profile)
exports.register = async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  if (!name || !email || !password || !phone) {
    return res.status(400).json({ error: "Please provide all required fields (name, email, password, phone)" });
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedPhone = phone.trim();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  try {
    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      return res.status(400).json({ error: "An account with this email address already exists. Please sign in instead." });
    }

    // Public registration MUST always create a normal customer account.
    // Any client-supplied 'role' value is strictly ignored to prevent privilege escalation.
    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password,
      phone: trimmedPhone,
      address: address ? address.trim() : "",
      role: "customer",
      status: "Active"
    });

    // Check if a Guest profile exists for this email
    let guest = await Guest.findOne({ email: normalizedEmail });

    if (!guest) {
      const nameParts = trimmedName.split(" ");
      const firstName = nameParts[0] || "Valued";
      const lastName = nameParts.slice(1).join(" ") || "Guest";

      guest = await Guest.create({
        firstName,
        lastName,
        email: normalizedEmail,
        phone: trimmedPhone,
        user: user._id,
        property: req.propertyId || null,
        address: { street: address ? address.trim() : "" },
        nationalIdType: "Other",
        nationalIdNumber: `GST-${user._id.toString().slice(-6).toUpperCase()}`,
        nationality: "Resident",
        guestType: "Regular",
        status: "Active"
      });
    } else {
      guest.user = user._id;
      if (!guest.phone) guest.phone = trimmedPhone;
      if (address && (!guest.address || !guest.address.street)) {
        guest.address = { ...(guest.address || {}), street: address.trim() };
      }
      await guest.save();
    }

    // Link Guest to User
    user.guest = guest._id;
    await user.save();

    console.log(`[AUTH] Registered new customer: ${user._id} (${user.email}) -> Linked Guest: ${guest._id}`);

    const token = generateToken(user._id);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address || "",
      role: user.role,
      status: user.status,
      guestId: guest._id,
      token
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "An account with this email address already exists. Please sign in instead." });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register user" });
  }
};

// Admin-only: create staff/admin accounts
exports.createUser = async (req, res) => {
  const { name, email, password, phone, role, property } = req.body;

  if (!name || !email || !password || !phone) {
    return res.status(400).json({ error: "Please provide all required fields" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  const ALLOWED_STAFF_ROLES = [
    "admin",
    "staff",
    "manager",
    "finance",
    "housekeeping",
    "maintenance",
    "customer"
  ];

  const assignedRole = role || "staff";

  if (!ALLOWED_STAFF_ROLES.includes(assignedRole)) {
    return res.status(400).json({ 
      error: `Invalid role. Allowed roles are: ${ALLOWED_STAFF_ROLES.join(", ")}` 
    });
  }

  try {
    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      return res.status(400).json({ error: "User already exists with this email address" });
    }

    const newUser = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password,
      phone: trimmedPhone,
      role: assignedRole,
      status: "Active",
      property: property || req.propertyId || null
    });

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      status: newUser.status,
      createdAt: newUser.createdAt
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "User already exists with this email address" });
    }
    res.status(500).json({ error: "Failed to create user account" });
  }
};

// Admin-only: list users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("guest", "firstName lastName nationalIdNumber guestType")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// Login user
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Please provide both email and password" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail }).populate("guest");

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check account status
    if (user.status === "Inactive" || user.status === "Suspended") {
      return res.status(403).json({ error: "Your account has been deactivated. Please contact hotel administration." });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Heal legacy customer accounts that don't have a linked guest record yet
    let guestId = user.guest?._id || user.guest;
    if (user.role === "customer" && !guestId) {
      let guest = await Guest.findOne({ email: normalizedEmail });
      if (!guest) {
        const nameParts = (user.name || "Valued Guest").trim().split(" ");
        guest = await Guest.create({
          firstName: nameParts[0] || "Valued",
          lastName: nameParts.slice(1).join(" ") || "Guest",
          email: normalizedEmail,
          phone: user.phone || "Not provided",
          user: user._id,
          property: user.property || null,
          nationalIdType: "Other",
          nationalIdNumber: `GST-${user._id.toString().slice(-6).toUpperCase()}`,
          nationality: "Resident",
          status: "Active"
        });
      } else if (!guest.user) {
        guest.user = user._id;
        await guest.save();
      }
      guestId = guest._id;
      user.guest = guest._id;
      await User.findByIdAndUpdate(user._id, { guest: guest._id });
    }

    // Record login timestamp without modifying password
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    const token = generateToken(user._id);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address || "",
      role: user.role,
      status: user.status || "Active",
      property: user.property || null,
      allowedProperties: user.allowedProperties || [],
      department: user.department,
      departmentAdmin: user.departmentAdmin === true,
      adminDepartments: user.adminDepartments || [],
      adminPermissions: user.adminPermissions || [],
      staffId: user.staffId || null,
      jobTitle: user.jobTitle || "",
      guestId: guestId || null,
      lastLogin: new Date(),
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
};

// Logout (token invalidation / session end acknowledgment)
exports.logout = async (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId)
      .select("-password")
      .populate("guest");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userObj = user.toObject ? user.toObject() : { ...user };
    userObj.guestId = user.guest?._id || user.guest || null;

    res.json(userObj);
  } catch (err) {
    res.status(500).json({ error: "Failed to get user data" });
  }
};


// Update user profile (Only updates name, phone, address for authenticated user)
exports.updateProfile = async (req, res) => {
  const { name, phone, address } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Role, email, property, and password changes are explicitly prevented through this route
    if (name !== undefined && name.trim()) user.name = name.trim();
    if (phone !== undefined && phone.trim()) user.phone = phone.trim();
    if (address !== undefined) user.address = address.trim();

    const updatedUser = await user.save();

    // Synchronize permitted changes with linked Guest record if one exists
    if (user.guest) {
      const guestUpdates = {};
      if (name !== undefined && name.trim()) {
        const parts = name.trim().split(" ");
        guestUpdates.firstName = parts[0] || "Valued";
        guestUpdates.lastName = parts.slice(1).join(" ") || "Guest";
      }
      if (phone !== undefined && phone.trim()) {
        guestUpdates.phone = phone.trim();
      }
      if (address !== undefined) {
        guestUpdates["address.street"] = address.trim();
      }

      await Guest.findByIdAndUpdate(user.guest, { $set: guestUpdates });
    }

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      address: updatedUser.address || "",
      role: updatedUser.role,
      status: updatedUser.status || "Active",
      createdAt: updatedUser.createdAt
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// Change password for logged-in user
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Please provide both current and new password" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long" });
  }

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
};
