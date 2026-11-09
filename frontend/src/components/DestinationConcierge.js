// frontend/src/components/DestinationConcierge.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaConciergeBell,
  FaTimes,
  FaPaperPlane,
  FaPhoneAlt,
  FaEnvelope,
  FaRedo,
  FaBed,
  FaUtensils,
  FaTag,
  FaArrowRight,
  FaQuestionCircle,
  FaRobot
} from 'react-icons/fa';
import { aiConciergeAPI } from '../services/api';
import './DestinationConcierge.css';

const WELCOME_MESSAGE =
  "Welcome to our Sri Lankan hotel. I'm your AI Concierge. I can help you explore our rooms, restaurants, facilities, and current offers. How may I assist you?";

const INITIAL_QUICK_PROMPTS = [
  "Explore luxury rooms",
  "Dining venues & menus",
  "Check-in & policies",
  "Current seasonal offers",
  "How to book a room"
];

const DestinationConcierge = ({ property }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'faq'
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeFaq, setActiveFaq] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const hotelName = property?.name || 'Sri Lanka Main Property';
  const phone = property?.contactPhone || '+94 11 234 5678';
  const email = property?.contactEmail || 'concierge.srilanka@hotelpms.com';
  const checkIn = property?.checkInTime || '14:00';
  const checkOut = property?.checkOutTime || '11:00';

  // Initial welcome message
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      sender: 'concierge',
      text: WELCOME_MESSAGE,
      timestamp: new Date(),
      quickReplies: INITIAL_QUICK_PROMPTS
    }
  ]);

  // Static FAQ dataset for quick reference tab
  const faqs = [
    {
      q: 'What are the check-in and check-out times?',
      a: `Check-in begins at ${checkIn} (2:00 PM), and check-out is until ${checkOut} (11:00 AM). Early arrival or late departure may be requested upon booking.`
    },
    {
      q: 'Are airport chauffeur transfers available from BIA?',
      a: 'Yes, our 24/7 concierge can arrange private airport luxury vehicle transfers between Bandaranaike International Airport and the resort.'
    },
    {
      q: 'Is breakfast & Wi-Fi included in direct bookings?',
      a: 'All direct guest portal reservations include high-speed complimentary fiber Wi-Fi and best rate guarantee with zero hidden service fees.'
    },
    {
      q: 'What dining options and dietary preferences are accommodated?',
      a: 'Our chefs cater to vegetarian, vegan, halal, and gluten-free dietary requirements using fresh local spices and organic Ceylon produce.'
    }
  ];

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen, activeTab]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, activeTab]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Listen for custom 'open-ai-concierge' event from anywhere in the application
  useEffect(() => {
    const handleOpenEvent = (e) => {
      setIsOpen(true);
      setActiveTab('chat');
      const customPrompt = e?.detail?.prompt;
      if (customPrompt) {
        setTimeout(() => {
          handleSendMessage(customPrompt);
        }, 300);
      }
    };
    window.addEventListener('open-ai-concierge', handleOpenEvent);
    return () => window.removeEventListener('open-ai-concierge', handleOpenEvent);
  }, []);

  // Send message to backend AI concierge API
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    setInputValue('');
    setErrorMessage(null);

    // Guest message
    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'guest',
      text: text,
      timestamp: new Date()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Build lightweight conversation history for the backend
      const historyPayload = newMessages
        .slice(-8)
        .map((m) => ({
          role: m.sender === 'guest' ? 'user' : 'assistant',
          content: m.text
        }));

      const res = await aiConciergeAPI.sendMessage({
        message: text,
        conversationHistory: historyPayload,
        propertyId: property?._id
      });

      const data = res.data;
      if (data && data.success) {
        const conciergeReply = {
          id: `concierge-${Date.now()}`,
          sender: 'concierge',
          text: data.reply,
          recommendations: data.recommendations || [],
          quickReplies: data.quickReplies || [],
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, conciergeReply]);
      } else {
        throw new Error(data?.error || 'Unable to reach concierge');
      }
    } catch (err) {
      console.error('Concierge chat error:', err);
      setErrorMessage(
        'Our hospitality AI is temporarily resting. Please try again or reach our 24/7 guest desk.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPromptClick = (promptText) => {
    handleSendMessage(promptText);
  };

  const handleActionClick = (actionUrl) => {
    if (!actionUrl) return;
    if (actionUrl.startsWith('#')) {
      const element = document.querySelector(actionUrl);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        setIsOpen(false);
      }
    } else {
      navigate(actionUrl);
      setIsOpen(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'concierge',
        text: WELCOME_MESSAGE,
        timestamp: new Date(),
        quickReplies: INITIAL_QUICK_PROMPTS
      }
    ]);
    setErrorMessage(null);
  };

  const formatTime = (date) => {
    try {
      return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <button
        type="button"
        className="ai-concierge-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open AI Hotel Concierge"
        aria-expanded={isOpen}
      >
        <span className="ai-concierge-pulse-dot" />
        <FaConciergeBell size={16} style={{ color: 'var(--c-brass-light, #D4AF6E)' }} />
        <span>AI Concierge</span>
      </button>

      {/* Floating Chat Drawer Panel */}
      {isOpen && (
        <div
          className="ai-concierge-panel"
          role="dialog"
          aria-modal="true"
          aria-label="AI Concierge Assistant"
        >
          {/* Header */}
          <div className="ai-concierge-header">
            <div className="ai-concierge-header-info">
              <div className="ai-concierge-avatar">
                <FaConciergeBell />
              </div>
              <div>
                <div className="ai-concierge-title">Serendib AI Concierge</div>
                <div className="ai-concierge-subtitle">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                  <span>{hotelName}</span>
                </div>
              </div>
            </div>

            <div className="ai-concierge-actions">
              <button
                type="button"
                className="ai-concierge-icon-btn"
                onClick={handleResetChat}
                title="Restart Conversation"
                aria-label="Restart Conversation"
              >
                <FaRedo size={12} />
              </button>
              <button
                type="button"
                className="ai-concierge-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close Concierge"
                aria-label="Close Concierge"
              >
                <FaTimes size={15} />
              </button>
            </div>
          </div>

          {/* Sub-Tabs: AI Chat vs Quick Reference */}
          <div className="ai-concierge-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              className={`ai-concierge-tab ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <FaRobot style={{ marginRight: 6 }} /> AI Concierge
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'faq'}
              className={`ai-concierge-tab ${activeTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveTab('faq')}
            >
              <FaQuestionCircle style={{ marginRight: 6 }} /> Quick FAQs & Desk
            </button>
          </div>

          {/* Tab 1: AI Chat Assistant */}
          {activeTab === 'chat' && (
            <>
              <div className="ai-concierge-messages" aria-live="polite">
                {messages.map((msg) => (
                  <div key={msg.id} className={`ai-message-row ${msg.sender}`}>
                    {msg.sender === 'concierge' && (
                      <div className="ai-message-avatar">
                        <FaConciergeBell />
                      </div>
                    )}
                    <div>
                      <div className="ai-message-bubble">
                        <div>{msg.text}</div>

                        {/* Recommendation Cards */}
                        {msg.recommendations && msg.recommendations.length > 0 && (
                          <div style={{ marginTop: '0.65rem' }}>
                            {msg.recommendations.map((rec, rIdx) => (
                              <div key={rIdx} className="ai-recommendation-card">
                                <div className="ai-rec-header">
                                  <span className="ai-rec-title">{rec.title}</span>
                                  {rec.subtitle && <span className="ai-rec-subtitle">{rec.subtitle}</span>}
                                </div>
                                {rec.description && <p className="ai-rec-desc">{rec.description}</p>}
                                {rec.actionUrl && (
                                  <button
                                    type="button"
                                    className="ai-rec-cta"
                                    onClick={() => handleActionClick(rec.actionUrl)}
                                  >
                                    {rec.type === 'room' && <FaBed size={11} />}
                                    {rec.type === 'restaurant' && <FaUtensils size={11} />}
                                    {rec.type === 'offer' && <FaTag size={11} />}
                                    <span>{rec.type === 'room' ? 'View Room' : rec.type === 'restaurant' ? 'Explore Venue' : 'View Offer'}</span>
                                    <FaArrowRight size={10} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="ai-message-time">{formatTime(msg.timestamp)}</div>
                      </div>

                      {/* Quick Prompt Suggestions */}
                      {msg.quickReplies && msg.quickReplies.length > 0 && (
                        <div className="ai-concierge-quick-prompts">
                          {msg.quickReplies.map((prompt, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              className="ai-prompt-chip"
                              onClick={() => handleQuickPromptClick(prompt)}
                            >
                              <span>{prompt}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Live Typing Indicator */}
                {isLoading && (
                  <div className="ai-message-row concierge">
                    <div className="ai-message-avatar">
                      <FaConciergeBell />
                    </div>
                    <div className="ai-typing-indicator" aria-label="Concierge is typing">
                      <span className="ai-typing-dot" />
                      <span className="ai-typing-dot" />
                      <span className="ai-typing-dot" />
                    </div>
                  </div>
                )}

                {/* Error Box */}
                {errorMessage && (
                  <div className="ai-error-box">
                    <span>{errorMessage}</span>
                    <button
                      type="button"
                      className="ai-retry-btn"
                      onClick={() => handleSendMessage(messages[messages.length - 1]?.text)}
                    >
                      <FaRedo size={10} style={{ marginRight: 4 }} /> Retry
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Footer */}
              <div className="ai-concierge-footer">
                <form
                  className="ai-concierge-input-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    className="ai-concierge-input"
                    placeholder="Ask about rooms, dining, offers..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={isLoading}
                    maxLength={1000}
                    aria-label="Message for AI concierge"
                  />
                  <button
                    type="submit"
                    className="ai-concierge-send-btn"
                    disabled={!inputValue.trim() || isLoading}
                    aria-label="Send message"
                  >
                    <FaPaperPlane />
                  </button>
                </form>
                <div className="ai-concierge-disclaimer">
                  Verified Sri Lankan hotel information powered by AI Concierge.
                </div>
              </div>
            </>
          )}

          {/* Tab 2: Quick FAQs & Front Desk Reference */}
          {activeTab === 'faq' && (
            <div className="ai-concierge-messages">
              <p style={{ fontSize: '0.825rem', color: 'var(--c-text-secondary, #48544F)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                Quick verified policies and direct contacts for {hotelName}:
              </p>

              <div>
                {faqs.map((faq, i) => (
                  <div key={i} style={{ marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: activeFaq === i ? 'var(--c-sand, #DFD5C3)' : 'var(--c-sand-subtle, #F3EFE6)',
                        border: '1px solid var(--c-border-light, rgba(34,66,52,0.1))',
                        borderRadius: '0.65rem',
                        padding: '0.7rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: 'var(--c-forest-deep, #162E24)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>{faq.q}</span>
                      <span>{activeFaq === i ? '−' : '+'}</span>
                    </button>
                    {activeFaq === i && (
                      <div
                        style={{
                          fontSize: '0.775rem',
                          color: 'var(--c-forest, #224234)',
                          background: '#FFFFFF',
                          padding: '0.75rem 0.95rem',
                          borderRadius: '0.5rem',
                          marginTop: '0.25rem',
                          borderLeft: '3px solid var(--c-brass, #B68C48)',
                          lineHeight: 1.5
                        }}
                      >
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Direct Front Desk Contacts */}
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--c-border-light, rgba(34,66,52,0.1))', paddingTop: '1rem', fontSize: '0.8rem', color: 'var(--c-forest-deep, #162E24)' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.45rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-brass, #B68C48)' }}>
                  24/7 Front Desk Contacts
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <FaPhoneAlt style={{ color: 'var(--c-brass, #B68C48)' }} />
                  <span>{phone}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FaEnvelope style={{ color: 'var(--c-brass, #B68C48)' }} />
                  <span>{email}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default DestinationConcierge;
