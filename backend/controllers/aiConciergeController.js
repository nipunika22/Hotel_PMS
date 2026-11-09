// backend/controllers/aiConciergeController.js
/**
 * Controller for AI Hotel Concierge endpoint.
 */

const { processConciergeChat } = require("../services/aiConciergeService");
const aiConfig = require("../config/aiConfig");

/**
 * @route   POST /api/ai/concierge/chat
 * @desc    Chat with the AI Hotel Concierge
 * @access  Public (Guest visitors & authenticated users)
 */
exports.chat = async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    // 1. Validate user query
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "A valid message text is required."
      });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length > aiConfig.maxUserMessageLength) {
      return res.status(400).json({
        success: false,
        error: `Message exceeds maximum allowed length of ${aiConfig.maxUserMessageLength} characters.`
      });
    }

    // 2. Validate conversation history structure
    let validHistory = [];
    if (conversationHistory) {
      if (!Array.isArray(conversationHistory)) {
        return res.status(400).json({
          success: false,
          error: "conversationHistory must be an array of message objects."
        });
      }

      validHistory = conversationHistory
        .filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
        .slice(-aiConfig.maxHistoryMessages);
    }

    // 3. Verify server-side property context
    if (!req.property || !req.propertyId) {
      return res.status(400).json({
        success: false,
        error: "Active hotel property context is required."
      });
    }

    // 4. Process chat via AI Concierge Service
    const response = await processConciergeChat({
      message: trimmedMessage,
      conversationHistory: validHistory,
      property: req.property,
      user: req.user
    });

    return res.status(200).json({
      success: true,
      reply: response.reply,
      recommendations: response.recommendations || [],
      quickReplies: response.quickReplies || [],
      property: {
        id: req.property._id,
        name: req.property.name,
        code: req.property.code
      }
    });
  } catch (err) {
    console.error("AI Concierge Controller Error:", err);
    return res.status(500).json({
      success: false,
      error: "An unexpected error occurred while communicating with the concierge.",
      reply: "We are currently experiencing technical difficulty. Please contact our front desk or refresh the page."
    });
  }
};
