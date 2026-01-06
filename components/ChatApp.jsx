'use client';

import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useCortexSSE } from '@/hooks/useCortexSSE';
import ChartComponent from '@/components/ChartComponent';
import EnhancedTableChart from '@/components/EnhancedTableChart';
import ProjectSelector from '@/components/ProjectSelector';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { apiCall } from '@/utils/api';
import { Modal, Form, Input, Button, message, Skeleton, Tooltip, Spin, Select } from 'antd';
const { TextArea } = Input;
import {
  ListCollapse,
  Expand,
  MessageSquarePlus,
  Search,
  X,
  Send,
  ChevronDown,
  ChevronUp,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  MoreVertical,
  Paperclip,
  File,
  Check,
  Loader2,
  Sparkles,
  Settings,
  LogOut,
  User,
  Shield,
  Plus,
  FolderKanban,
  Edit2,
  Trash2,
  Download,
  Moon,
  Sun
} from 'lucide-react';

const BACKEND_URL = `/api/chat`;
const CONVERSATIONS_API = `/api/conversations`;
const SAVE_CONVERSATION_API = `/api/conversations/save`;
const THREADS_API = `/api/threads`;
const AGENTS_API = `/api/agents`;
const FILES_API = `/api/files`;

function generateSessionId() {
  return (
    'sess_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10)
  );
}

function generateConversationId() {
  return (
    'conv_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10)
  );
}

// Helper functions to validate table and chart data
function hasValidTableData(table) {
  if (!table) return false;
  return Array.isArray(table.headers) && table.headers.length > 0;
}

// Helper function to safely parse JSON strings
function safeJsonParse(maybeJsonString) {
  if (typeof maybeJsonString !== "string") return maybeJsonString;
  try {
    return JSON.parse(maybeJsonString);
  } catch {
    return maybeJsonString;
  }
}

// Extract chart from raw.content[] when chartSpec is null
function extractChartFromRaw(finalAnswer) {
  if (!finalAnswer) return null;

  // If chartSpec already exists, use it
  if (finalAnswer.chartSpec) {
    return finalAnswer.chartSpec;
  }

  // Check raw.chartSpec at top level
  if (finalAnswer.raw?.chartSpec) {
    const parsed = safeJsonParse(finalAnswer.raw.chartSpec);
    if (parsed && (parsed.mark || parsed.labels || parsed.data)) {
      return parsed;
    }
  }

  // Search in raw.content[] for chart items
  if (finalAnswer.raw?.content && Array.isArray(finalAnswer.raw.content)) {
    for (const item of finalAnswer.raw.content) {
      if (item?.type === 'chart') {
        // Check for chart.chart_spec
        if (item.chart?.chart_spec) {
          const parsed = safeJsonParse(item.chart.chart_spec);
          if (parsed) return parsed;
        }
        // Check if chart itself is the spec
        if (item.chart && (item.chart.mark || item.chart.data || item.chart.encoding || item.chart.labels)) {
          return item.chart;
        }
      }
    }
  }

  return null;
}

function hasValidChartData(chartSpec) {
  if (!chartSpec) return false;

  // Check Chart.js format with labels/datasets at root
  if (chartSpec.labels && Array.isArray(chartSpec.labels) && chartSpec.labels.length > 0) return true;
  if (chartSpec.datasets && Array.isArray(chartSpec.datasets) && chartSpec.datasets.length > 0) return true;
  // Check Chart.js format with data property
  if (chartSpec.data?.labels && Array.isArray(chartSpec.data.labels) && chartSpec.data.labels.length > 0) return true;
  if (chartSpec.data?.datasets && Array.isArray(chartSpec.data.datasets) && chartSpec.data.datasets.length > 0) return true;

  // Check Vega-Lite format (has mark, encoding, and data properties)
  if (chartSpec.mark && chartSpec.encoding && chartSpec.data) return true;
  // Check if it's a Vega-Lite spec string that needs parsing
  if (typeof chartSpec === 'string' && chartSpec.includes('"mark"') && chartSpec.includes('"encoding"')) {
    try {
      const parsed = JSON.parse(chartSpec);
      if (parsed.mark && parsed.encoding && parsed.data) return true;
    } catch {
      // Not valid JSON, continue
    }
  }

  return false;
}

export default function App() {
  const [sessionId, setSessionId] = useState('');
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingConversationMessages, setIsLoadingConversationMessages] = useState(false);
  const [currentStreamingMessageId, setCurrentStreamingMessageId] = useState(null);
  const [currentUserQuestion, setCurrentUserQuestion] = useState(null); // Track the current user question for streaming
  const [showDetails, setShowDetails] = useState(false); // Track if details are shown for current stream
  const [expandedPlanning, setExpandedPlanning] = useState({}); // Track which completed messages show details
  const messagesEndRef = useRef(null); // Ref for auto-scrolling
  const messagesContainerRef = useRef(null); // Ref for messages container
  const [searchQuery, setSearchQuery] = useState(''); // Search query for conversations
  const [searchResults, setSearchResults] = useState([]); // Separate search results for modal
  const [isSearching, setIsSearching] = useState(false); // Track search loading state
  const [isDeleting, setIsDeleting] = useState({}); // Track which conversation is being deleted
  const [showSearchModal, setShowSearchModal] = useState(false); // Show/hide search modal
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Collapse/expand sidebar
  const [deleteDialog, setDeleteDialog] = useState({ show: false, conversationId: null }); // Delete confirmation dialog
  // Thread management state
  const [threads, setThreads] = useState({}); // Map conversationId -> { thread_id, last_assistant_message_id }
  // Agent management state
  const [availableAgents, setAvailableAgents] = useState([]); // List of available agents
  const [selectedAgentId, setSelectedAgentId] = useState(null); // Currently selected agent ID
  const [projectName, setProjectName] = useState('AI Intelligence Platform'); // Project name from backend
  const [selectedProjectId, setSelectedProjectId] = useState(''); // Selected project for conversations (empty string = global conversations)
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState([]); // Files uploaded for current conversation
  const [isUploading, setIsUploading] = useState(false); // Upload in progress
  const [uploadProgress, setUploadProgress] = useState(0); // Upload progress percentage
  const [removingFileId, setRemovingFileId] = useState(null); // File ID being removed
  const fileInputRef = useRef(null); // Reference to hidden file input
  const textInputRef = useRef(null); // Reference to text input/textarea
  const { user, logout, isAdmin, isDemoMode } = useAuth(); // Authentication
  const { theme, toggleTheme } = useTheme(); // Theme

  // localStorage helper functions for demo mode
  const DEMO_STORAGE_KEY = 'demo_conversations';

  const loadDemoConversations = () => {
    try {
      const stored = localStorage.getItem(DEMO_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (err) {
      console.error('Error loading demo conversations:', err);
    }
    return [];
  };

  const saveDemoConversation = (conversationId, sessionId, title, messages, projectId) => {
    try {
      const conversations = loadDemoConversations();
      const existingIndex = conversations.findIndex(c => c.id === conversationId);
      const existingConv = existingIndex >= 0 ? conversations[existingIndex] : null;
      const conversation = {
        id: conversationId,
        sessionId,
        title,
        messages,
        projectId: projectId || null,
        createdAt: existingConv?.createdAt || Date.now(),
        updatedAt: Date.now(),
        // Preserve like and feedback state
        isLiked: existingConv?.isLiked || false,
        feedback: existingConv?.feedback || null,
        feedbackSubmittedAt: existingConv?.feedbackSubmittedAt || null
      };

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.push(conversation);
      }

      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(conversations));
      return true;
    } catch (err) {
      console.error('Error saving demo conversation:', err);
      return false;
    }
  };

  const deleteDemoConversation = (conversationId) => {
    try {
      const conversations = loadDemoConversations();
      const filtered = conversations.filter(c => c.id !== conversationId);
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch (err) {
      console.error('Error deleting demo conversation:', err);
      return false;
    }
  };

  const clearAllDemoConversations = () => {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      return true;
    } catch (err) {
      console.error('Error clearing demo conversations:', err);
      return false;
    }
  };
  // Project creation modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm] = Form.useForm();
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectRefreshTrigger, setProjectRefreshTrigger] = useState(0);
  // Sidebar sections collapse state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    actions: false,
    projects: false,
    chats: false
  });
  // Projects list for sidebar
  const [sidebarProjects, setSidebarProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState(null);
  const [hoveredMoreBtn, setHoveredMoreBtn] = useState(null);
  const [globalConversationCount, setGlobalConversationCount] = useState(0);
  // Project edit/delete state
  const [editingProject, setEditingProject] = useState(null);
  const [editProjectForm] = Form.useForm();
  const [savingProject, setSavingProject] = useState(false);

  // Explore panel state
  const [explorePanel, setExplorePanel] = useState({
    isOpen: false,
    chartSpec: null,
    tableData: null,
    title: null
  });
  const [exploreChartType, setExploreChartType] = useState('bar');
  const [exploreViewMode, setExploreViewMode] = useState('table'); // 'table' or 'sql'
  const previousSidebarState = useRef(false); // Track sidebar state before explore
  const [showSettingsMenu, setShowSettingsMenu] = useState(false); // Settings dropdown menu
  const settingsMenuRef = useRef(null); // Ref for settings menu
  // Like and feedback state
  const [conversationLikes, setConversationLikes] = useState({}); // Map conversationId -> isLiked
  const [conversationUnlikes, setConversationUnlikes] = useState({}); // Map conversationId -> isUnliked (feedback given)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false); // Show feedback modal
  const [feedbackConversationId, setFeedbackConversationId] = useState(null); // Conversation ID for feedback
  const [feedbackText, setFeedbackText] = useState(''); // Feedback text
  const [submittingFeedback, setSubmittingFeedback] = useState(false); // Feedback submission state

  // Use the Cortex SSE hook
  const {
    streamState,
    agentStatus,
    toolTimeline,
    analysisText,
    finalAnswer,
    error: streamError,
    messageIds, // Get message IDs from metadata events
    startStream,
    stop,
    reset: resetStream,
  } = useCortexSSE();

  // Initialize session ID
  useEffect(() => {
    // Get or create session ID (only sessionId stored in localStorage)
    let storedSession = window.localStorage.getItem('cortex_session_id');
    if (!storedSession) {
      storedSession = generateSessionId();
      window.localStorage.setItem('cortex_session_id', storedSession);
    }
    setSessionId(storedSession);
  }, []);

  // Track if conversations have been loaded to prevent unnecessary reloads
  // Use user + project as key, NOT sessionId, so same user sees same conversations across browsers
  const conversationsLoadedRef = useRef(false);
  const lastUserProjectRef = useRef(null);
  const lastDemoModeRef = useRef(isDemoMode); // Track previous demo mode state

  // Load conversations from database (lightweight metadata only) or localStorage (demo mode)
  useEffect(() => {
    if (!user) return; // Only need user, not sessionId

    // Detect demo mode change and reset loaded state
    const demoModeChanged = lastDemoModeRef.current !== isDemoMode;
    if (demoModeChanged) {
      console.log(`[App] Demo mode changed from ${lastDemoModeRef.current} to ${isDemoMode} - resetting conversations`);
      conversationsLoadedRef.current = false;
      lastUserProjectRef.current = null;
      lastDemoModeRef.current = isDemoMode;
      // Clear conversations when mode changes
      setConversations([]);
      setCurrentConversationId(null);
      setMessages([]);
    }

    // Only reload if user/project changed or conversations haven't been loaded
    // Use user.id + projectId as key (not sessionId) so all browsers show same conversations
    const userProjectKey = `${user.id}-${selectedProjectId || 'global'}`;
    const userProjectChanged = lastUserProjectRef.current !== userProjectKey;

    if (!conversationsLoadedRef.current || userProjectChanged || demoModeChanged) {
      lastUserProjectRef.current = userProjectKey;
      if (!demoModeChanged) {
        lastDemoModeRef.current = isDemoMode;
      }

      async function loadConversations() {
        try {
          setIsLoadingConversations(true);

          // In demo mode, load from localStorage
          if (isDemoMode) {
            const demoConversations = loadDemoConversations();
            // Filter by projectId if selected
            const filtered = selectedProjectId && selectedProjectId !== ''
              ? demoConversations.filter(c => c.projectId === selectedProjectId)
              : demoConversations.filter(c => !c.projectId || c.projectId === '');

            const formattedConversations = filtered.map(conv => ({
              id: conv.id,
              title: conv.title,
              projectId: conv.projectId,
              createdAt: conv.createdAt || Date.now(),
              updatedAt: conv.updatedAt || Date.now(),
              messages: conv.messages || []
            }));
            setConversations(formattedConversations);
            conversationsLoadedRef.current = true;
            setIsLoadingConversations(false);
            return;
          }

          const token = localStorage.getItem('authToken');
          if (!token) {
            console.warn('No auth token available');
            return;
          }
          // Use metadataOnly=true to get lightweight data (no messages)
          // Use a placeholder sessionId in URL (API ignores it and filters by user_id/project_id only)
          // This ensures same user sees same conversations across all browsers/devices
          const placeholderSessionId = sessionId || 'all';
          let url = `${CONVERSATIONS_API}/${placeholderSessionId}?metadataOnly=true`;
          if (selectedProjectId && selectedProjectId !== '') {
            url += `&project_id=${selectedProjectId}`;
          }
          const res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (res.ok) {
            const response = await res.json();
            const data = response.conversations || [];
            // Transform lightweight metadata to frontend format
            const formattedConversations = (Array.isArray(data) ? data : []).map(conv => ({
              id: conv.id,
              title: conv.title,
              projectId: conv.projectId,
              createdAt: conv.createdAt ? new Date(conv.createdAt).getTime() : Date.now(),
              updatedAt: conv.updatedAt ? new Date(conv.updatedAt).getTime() : Date.now(),
              lastMessagePreview: conv.lastMessagePreview,
              // Messages will be loaded on-demand when conversation is clicked
              messages: []
            }));
            setConversations(formattedConversations);

            // Don't show message or switch projects - just show empty state
            // User can create new conversations in the selected project

            // Don't auto-select any conversation - show new chat UI by default
            // User can click on a conversation to load it
            conversationsLoadedRef.current = true;
          } else {
            console.error('Failed to load conversations:', res.statusText);
          }
        } catch (err) {
          console.error('Error loading conversations:', err);
        } finally {
          setIsLoadingConversations(false);
        }
      }

      loadConversations();
    } else {
      // Reset loading state if we're not loading
      setIsLoadingConversations(false);
    }
  }, [selectedProjectId, user, isDemoMode]); // Added isDemoMode dependency

  // Track if projects have been loaded to prevent unnecessary reloads
  const projectsLoadedRef = useRef(false);
  const lastUserRef = useRef(null);
  const lastDemoModeForProjectsRef = useRef(isDemoMode); // Track previous demo mode state for projects

  // Load projects for sidebar - only on initial load or explicit refresh, but wait for user auth
  useEffect(() => {
    if (!user) return; // Wait for user to be authenticated

    // Detect demo mode change and reset loaded state
    const demoModeChanged = lastDemoModeForProjectsRef.current !== isDemoMode;
    if (demoModeChanged) {
      console.log(`[App] Demo mode changed - resetting projects`);
      projectsLoadedRef.current = false;
      lastUserRef.current = null;
      lastDemoModeForProjectsRef.current = isDemoMode;
      // Clear projects when mode changes
      setSidebarProjects([]);
    }

    // Only reload if user changed or explicit refresh triggered or demo mode changed
    const userChanged = lastUserRef.current !== user?.id;
    if (!projectsLoadedRef.current || userChanged || projectRefreshTrigger > 0 || demoModeChanged) {
      lastUserRef.current = user?.id;
      if (!demoModeChanged) {
        lastDemoModeForProjectsRef.current = isDemoMode;
      }
      loadSidebarProjects();
      projectsLoadedRef.current = true;
    }
  }, [projectRefreshTrigger, user, isDemoMode]);

  // Track if counts have been loaded to prevent unnecessary reloads
  const countsLoadedRef = useRef(false);
  const lastProjectRef = useRef(null);

  // Load conversation counts using the new count API
  useEffect(() => {
    if (!sessionId || !user) return;

    // Only reload if project changed or counts haven't been loaded
    const projectChanged = lastProjectRef.current !== selectedProjectId;
    if (!countsLoadedRef.current || projectChanged) {
      lastProjectRef.current = selectedProjectId;
      loadConversationCounts();
      countsLoadedRef.current = true;
    }
  }, [sessionId, user, selectedProjectId]);

  const loadConversationCounts = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('No auth token available for loading conversation count');
        return;
      }

      // Always get all counts (total, global, and per-project)
      const url = '/api/conversations/count';

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        const counts = data.counts || {};

        // Set global count (conversations without project)
        setGlobalConversationCount(counts.global || 0);

        // Update project counts in sidebar
        if (counts.byProject && Object.keys(counts.byProject).length > 0) {
          setSidebarProjects(prev => prev.map(project => ({
            ...project,
            conversationsCount: counts.byProject[project.id] || 0
          })));
        }

        // Mark as loaded
        countsLoadedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to fetch conversation counts:', error);
    }
  };

  const loadSidebarProjects = async () => {
    try {
      setLoadingProjects(true);
      console.log('[ChatApp] Loading projects...');
      // Projects API now includes counts in a single optimized query
      const data = await apiCall('/api/projects?limit=100&offset=0&includeCounts=true');
      console.log('[ChatApp] Projects response:', data);
      if (data) {
        const projects = data.projects || [];
        console.log(`[ChatApp] Loaded ${projects.length} projects`);
        setSidebarProjects(projects);

        // Also refresh global counts (reset flag to allow reload)
        countsLoadedRef.current = false;
        loadConversationCounts();
      } else {
        console.warn('[ChatApp] No data received from projects API');
        setSidebarProjects([]);
      }
    } catch (err) {
      console.error('[ChatApp] Failed to load projects:', err);
      message.error(`Failed to load projects: ${err.message}`);
      setSidebarProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleProjectEdit = (project) => {
    setEditingProject(project);
    editProjectForm.setFieldsValue({
      name: project.name,
      description: project.description || '',
    });
  };

  const cancelProjectEdit = () => {
    setEditingProject(null);
    editProjectForm.resetFields();
  };

  const handleProjectUpdate = async (values) => {
    if (!editingProject) return;

    setSavingProject(true);
    try {
      console.log('[ChatApp] Updating project:', editingProject.id, values);
      const data = await apiCall(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description?.trim() || '',
        }),
      });
      console.log('[ChatApp] Update response:', data);
      if (data && data.project) {
        setSidebarProjects(sidebarProjects.map(p => p.id === editingProject.id ? data.project : p));
        setEditingProject(null);
        editProjectForm.resetFields();
        message.success('Project updated successfully!');
        // Refresh projects list
        setTimeout(() => {
          loadSidebarProjects();
          setProjectRefreshTrigger(prev => prev + 1);
        }, 500);
      } else {
        throw new Error(data?.error || 'Failed to update project');
      }
    } catch (err) {
      console.error('[ChatApp] Update error:', err);
      message.error(`Error: ${err.message}`);
    } finally {
      setSavingProject(false);
    }
  };

  const handleProjectDelete = async (projectId) => {
    Modal.confirm({
      title: 'Delete Project',
      content: 'Are you sure you want to delete this project? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          console.log('[ChatApp] Deleting project:', projectId);
          const response = await apiCall(`/api/projects/${projectId}`, {
            method: 'DELETE',
          });
          console.log('[ChatApp] Delete response:', response);
          if (response && (response.success || response.message)) {
            // Remove project from list immediately without reloading
            setSidebarProjects(prev => prev.filter(p => p.id !== projectId));

            // If deleted project was selected, clear selection
            if (selectedProjectId === projectId) {
              setSelectedProjectId('');
            }

            message.success('Project deleted successfully!');
          } else {
            throw new Error(response?.error || 'Failed to delete project');
          }
        } catch (err) {
          console.error('[ChatApp] Delete error:', err);
          message.error(`Error: ${err.message}`);
          if (selectedProjectId === projectId) {
            setSelectedProjectId('');
          }
        }
      },
    });
  };

  // Load available agents
  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await fetch(AGENTS_API);
        if (res.ok) {
          const data = await res.json();
          setAvailableAgents(data.agents || []);
          setProjectName(data.projectName || 'AI Intelligence Platform');

          // Auto-select first agent if available
          if (data.agents && data.agents.length > 0) {
            setSelectedAgentId(data.agents[0].id);
          }
        } else {
          console.error('Failed to load agents:', res.statusText);
        }
      } catch (err) {
        console.error('Error loading agents:', err);
      }
    }

    loadAgents();
  }, []);

  // Search conversations in modal (separate from sidebar)
  useEffect(() => {
    if (sessionId && showSearchModal) {
      setIsSearching(true);
      const timeoutId = setTimeout(() => {
        async function searchConversations() {
          try {
            const token = localStorage.getItem('authToken');
            // Use metadataOnly for search results too (faster)
            // Use placeholder sessionId (API ignores it and filters by user_id/project_id only)
            const placeholderSessionId = sessionId || 'all';
            let url = `${CONVERSATIONS_API}/${placeholderSessionId}?metadataOnly=true`;
            if (searchQuery.trim()) {
              url += `&search=${encodeURIComponent(searchQuery.trim())}`;
            } else if (selectedProjectId && selectedProjectId !== '') {
              url += `&project_id=${selectedProjectId}`;
            }
            const res = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (res.ok) {
              const response = await res.json();
              const data = response.conversations || [];
              // Transform lightweight metadata to frontend format
              const formattedConversations = (Array.isArray(data) ? data : []).map(conv => ({
                id: conv.id,
                title: conv.title,
                projectId: conv.projectId,
                createdAt: conv.createdAt ? new Date(conv.createdAt).getTime() : Date.now(),
                updatedAt: conv.updatedAt ? new Date(conv.updatedAt).getTime() : Date.now(),
                lastMessagePreview: conv.lastMessagePreview,
                // Messages will be loaded on-demand when conversation is clicked
                messages: []
              }));
              setSearchResults(formattedConversations);
            }
          } catch (err) {
            console.error('Error searching conversations:', err);
          } finally {
            setIsSearching(false);
          }
        }
        searchConversations();
      }, 300); // Debounce search

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, showSearchModal, selectedProjectId]); // Removed sessionId dependency

  // Load messages for current conversation
  useEffect(() => {
    if (currentConversationId && !isLoadingConversations) {
      // Try to find conversation in local state first
      const conversation = conversations.find(c => c.id === currentConversationId);

      // If conversation exists and has messages loaded, use them
      // Otherwise, fetch from database (lightweight metadata has empty messages array)
      if (conversation && conversation.messages && conversation.messages.length > 0) {
        console.log(`[App] Using cached messages for conversation ${currentConversationId}`);
        setIsLoadingConversationMessages(false);
        setMessages(conversation.messages);
      } else if (conversation && conversation.title === 'New Conversation' && (!conversation.messages || conversation.messages.length === 0)) {
        // New conversation - don't fetch from API, just show empty state
        console.log(`[App] New conversation ${currentConversationId} - showing empty state`);
        setIsLoadingConversationMessages(false);
        setMessages([]);
      } else {
        // If not found locally or has no messages, fetch from database or localStorage
        console.log(`[App] Loading conversation ${currentConversationId}...`);
        setIsLoadingConversationMessages(true);
        setMessages([]); // Clear messages to show skeleton loader
        async function loadConversation() {
          try {
            // In demo mode, load from localStorage
            if (isDemoMode) {
              const demoConversations = loadDemoConversations();
              const conv = demoConversations.find(c => c.id === currentConversationId);
              if (conv) {
                console.log(`[App] Loaded conversation ${currentConversationId} from localStorage with ${conv.messages?.length || 0} messages`);
                setMessages(conv.messages || []);

                // Load like state from demo conversation
                if (conv.isLiked !== undefined) {
                  setConversationLikes(prev => ({
                    ...prev,
                    [currentConversationId]: conv.isLiked
                  }));
                }

                // Load unliked state (feedback given) from demo conversation
                if (conv.feedback && conv.feedback.trim() !== '') {
                  setConversationUnlikes(prev => ({
                    ...prev,
                    [currentConversationId]: true
                  }));
                }

                // Update local conversations list
                setConversations(prev => {
                  const exists = prev.find(c => c.id === conv.id);
                  if (exists) {
                    return prev.map(c => c.id === conv.id ? {
                      id: conv.id,
                      title: conv.title,
                      createdAt: conv.createdAt,
                      messages: conv.messages || []
                    } : c);
                  } else {
                    return [{
                      id: conv.id,
                      title: conv.title,
                      createdAt: conv.createdAt,
                      messages: conv.messages || []
                    }, ...prev];
                  }
                });
              } else {
                setMessages([]);
              }
              setIsLoadingConversationMessages(false);
              return;
            }

            const token = localStorage.getItem('authToken');
            const res = await fetch(`${CONVERSATIONS_API}/${sessionId}/${currentConversationId}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (res.ok) {
              const conv = await res.json();
              console.log(`[App] Loaded conversation ${currentConversationId} with ${conv.messages?.length || 0} messages`);

              // Load like state
              if (conv.isLiked !== undefined) {
                setConversationLikes(prev => ({
                  ...prev,
                  [currentConversationId]: conv.isLiked
                }));
              }

              // Load unliked state (feedback given)
              if (conv.feedback && conv.feedback.trim() !== '') {
                setConversationUnlikes(prev => ({
                  ...prev,
                  [currentConversationId]: true
                }));
              }

              // Handle message format: extract text from streamData.finalAnswer for assistant messages
              const loadedMessages = (conv.messages || []).map(msg => {
                // Handle message format: ensure text is extracted properly
                if (msg.role === 'assistant' && msg.streamData?.finalAnswer?.text) {
                  // For assistant messages with streamData, extract the text from finalAnswer
                  return {
                    ...msg,
                    text: msg.streamData.finalAnswer.text
                  };
                }
                // For user messages or messages without streamData, use text directly
                return msg;
              });
              setMessages(loadedMessages);

              // Restore thread state from loaded messages
              // Find the last assistant message and restore its Snowflake message_id
              // The last assistant message_id will be used as parent_message_id for the next message
              const assistantMessages = loadedMessages.filter(m => m.role === 'assistant');
              if (assistantMessages.length > 0) {
                const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                if (lastAssistantMessage.snowflakeMessageId) {
                  setThreads(prev => {
                    const currentThread = prev[currentConversationId] || {};
                    return {
                      ...prev,
                      [currentConversationId]: {
                        ...currentThread,
                        last_assistant_message_id: lastAssistantMessage.snowflakeMessageId
                      }
                    };
                  });
                  console.log(`[App] Restored last_assistant_message_id: ${lastAssistantMessage.snowflakeMessageId} from loaded conversation`);
                }
              }

              // Update local conversations list with processed messages
              setConversations(prev => {
                const exists = prev.find(c => c.id === conv.id);
                if (exists) {
                  return prev.map(c => c.id === conv.id ? {
                    id: conv.id,
                    title: conv.title,
                    createdAt: new Date(conv.createdAt).getTime(),
                    messages: loadedMessages // Use processed messages with extracted text
                  } : c);
                } else {
                  return [{
                    id: conv.id,
                    title: conv.title,
                    createdAt: new Date(conv.createdAt).getTime(),
                    messages: loadedMessages // Use processed messages with extracted text
                  }, ...prev];
                }
              });
            }
          } catch (err) {
            console.error('Error loading conversation:', err);
            setMessages([]);
          } finally {
            setIsLoadingConversationMessages(false);
          }
        }
        loadConversation();
      }
    } else {
      // No conversation selected - clear messages
      setMessages([]);
    }
  }, [currentConversationId, conversations, sessionId, isLoadingConversations]);

  function createNewConversation() {
    const newId = generateConversationId();
    const now = new Date(); // Use current date/time
    const newConversation = {
      id: newId,
      title: 'New Conversation',
      createdAt: now.getTime(), // Store as timestamp
      messages: []
    };
    console.log('Creating new conversation with createdAt:', new Date(newConversation.createdAt));
    // Add to local state (will be saved to DB when first message is sent)
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newId);
    setMessages([]);
    // Clear uploaded files when creating new conversation
    setUploadedFiles([]);
    // Thread will be created when first message is sent

    // Update conversation counts in background without reloading projects
    loadConversationCounts();

    return newId;
  }

  function switchConversation(conversationId) {
    setCurrentConversationId(conversationId);
    setShowSearchModal(false); // Close search modal when selecting conversation
    // Clear messages immediately to show skeleton while loading
    setMessages([]);
    // Clear uploaded files when switching conversations (they'll be loaded if they exist for this conversation)
    setUploadedFiles([]);
  }

  // Handle like conversation (toggle green, clear unlike state)
  async function handleLikeConversation(conversationId) {
    if (!conversationId) return;

    const currentLiked = conversationLikes[conversationId] || false;
    const newLikedState = !currentLiked; // Toggle: if liked, unliked; if not liked, liked

    // Update local state immediately for better UX
    setConversationLikes(prev => ({
      ...prev,
      [conversationId]: newLikedState
    }));

    // Clear unlike state when liking (mutually exclusive)
    if (newLikedState) {
      setConversationUnlikes(prev => ({
        ...prev,
        [conversationId]: false
      }));
    }

    // In demo mode, save to localStorage
    if (isDemoMode) {
      try {
        const demoConversations = loadDemoConversations();
        const index = demoConversations.findIndex(c => c.id === conversationId);
        if (index >= 0) {
          demoConversations[index].isLiked = newLikedState;
          // Clear feedback when liking (mutually exclusive)
          if (newLikedState) {
            demoConversations[index].feedback = null;
            demoConversations[index].feedbackSubmittedAt = null;
          }
          demoConversations[index].updatedAt = Date.now();
          localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoConversations));
        }
      } catch (err) {
        console.error('Error saving like in demo mode:', err);
      }
      return;
    }

    // Update in database
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${CONVERSATIONS_API}/${sessionId}/${conversationId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isLiked: newLikedState })
      });

      if (!res.ok) {
        // Revert local state on error
        setConversationLikes(prev => ({
          ...prev,
          [conversationId]: currentLiked
        }));
        // Revert unlike state if we had cleared it
        if (newLikedState) {
          setConversationUnlikes(prev => {
            const prevUnliked = prev[conversationId];
            if (prevUnliked) {
              return { ...prev, [conversationId]: true };
            }
            return prev;
          });
        }
        const error = await res.json();
        message.error(error.error || 'Failed to update like status');
      } else if (newLikedState) {
        // If successfully liked, clear feedback on server side
        // Note: The API might handle this, but we ensure local state is correct
        try {
          const token = localStorage.getItem('authToken');
          await fetch(`${CONVERSATIONS_API}/${sessionId}/${conversationId}/feedback`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (err) {
          // Ignore error if feedback deletion fails, it's not critical
          console.warn('Could not clear feedback when liking:', err);
        }
      }
    } catch (err) {
      console.error('Error updating like status:', err);
      // Revert local state on error
      setConversationLikes(prev => ({
        ...prev,
        [conversationId]: currentLiked
      }));
      // Revert unlike state if we had cleared it
      if (newLikedState) {
        setConversationUnlikes(prev => {
          const prevUnliked = prev[conversationId];
          if (prevUnliked) {
            return { ...prev, [conversationId]: true };
          }
          return prev;
        });
      }
      message.error('Failed to update like status');
    }
  }

  // Handle feedback submission
  async function handleSubmitFeedback() {
    if (!feedbackConversationId || !feedbackText.trim()) {
      message.warning('Please enter your feedback');
      return;
    }

    setSubmittingFeedback(true);

    // In demo mode, save to localStorage
    if (isDemoMode) {
      try {
        const demoConversations = loadDemoConversations();
        const index = demoConversations.findIndex(c => c.id === feedbackConversationId);
        if (index >= 0) {
          demoConversations[index].feedback = feedbackText.trim();
          demoConversations[index].feedbackSubmittedAt = Date.now();
          // Clear like state when unliking (mutually exclusive)
          demoConversations[index].isLiked = false;
          demoConversations[index].updatedAt = Date.now();
          localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoConversations));
        }
        // Mark conversation as unliked (feedback given) - add red color to unlike button
        setConversationUnlikes(prev => ({
          ...prev,
          [feedbackConversationId]: true
        }));
        // Clear like state when unliking (mutually exclusive)
        setConversationLikes(prev => ({
          ...prev,
          [feedbackConversationId]: false
        }));
        message.success('Feedback submitted successfully');
        setShowFeedbackModal(false);
        setFeedbackText('');
        setFeedbackConversationId(null);
      } catch (err) {
        console.error('Error saving feedback in demo mode:', err);
        message.error('Failed to submit feedback');
      } finally {
        setSubmittingFeedback(false);
      }
      return;
    }

    // Submit to database
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${CONVERSATIONS_API}/${sessionId}/${feedbackConversationId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ feedback: feedbackText.trim() })
      });

      if (res.ok) {
        // Mark conversation as unliked (feedback given) - add red color to unlike button
        setConversationUnlikes(prev => ({
          ...prev,
          [feedbackConversationId]: true
        }));
        // Clear like state when unliking (mutually exclusive)
        setConversationLikes(prev => ({
          ...prev,
          [feedbackConversationId]: false
        }));
        // Also clear like in database
        try {
          await fetch(`${CONVERSATIONS_API}/${sessionId}/${feedbackConversationId}/like`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ isLiked: false })
          });
        } catch (err) {
          // Ignore error if like clearing fails, it's not critical
          console.warn('Could not clear like when submitting feedback:', err);
        }
        message.success('Feedback submitted successfully');
        setShowFeedbackModal(false);
        setFeedbackText('');
        setFeedbackConversationId(null);
      } else {
        const error = await res.json();
        message.error(error.error || 'Failed to submit feedback');
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      message.error('Failed to submit feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  }

  // Open feedback modal
  function handleOpenFeedbackModal(conversationId) {
    setFeedbackConversationId(conversationId);
    setShowFeedbackModal(true);
  }

  // Get time-based greeting
  function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  }

  // Categorize conversations by time
  function categorizeConversations(convs) {
    const now = new Date();
    // Set to start of today (midnight)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Set to start of yesterday (midnight)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    // Set to 7 days ago (midnight)
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const categorized = {
      today: [],
      yesterday: [],
      lastWeek: [],
      older: []
    };

    convs.forEach(conv => {
      const convDate = new Date(conv.createdAt);

      if (convDate >= today) {
        // Today: from midnight today onwards
        categorized.today.push(conv);
      } else if (convDate >= yesterday && convDate < today) {
        // Yesterday: from midnight yesterday to midnight today
        categorized.yesterday.push(conv);
      } else if (convDate >= lastWeek && convDate < yesterday) {
        // Last week: from 7 days ago to yesterday
        categorized.lastWeek.push(conv);
      } else {
        // Older: before 7 days ago
        categorized.older.push(conv);
      }
    });

    return categorized;
  }

  function openDeleteDialog(conversationId, e) {
    e.stopPropagation(); // Prevent switching conversation when clicking delete
    setDeleteDialog({ show: true, conversationId });
  }

  function closeDeleteDialog() {
    setDeleteDialog({ show: false, conversationId: null });
  }

  // Explore panel functions
  function openExplorePanel(chartSpec, tableData, title) {
    // Save current sidebar state before collapsing
    previousSidebarState.current = isSidebarCollapsed;
    // Collapse sidebar when explore opens
    setIsSidebarCollapsed(true);
    setExplorePanel({
      isOpen: true,
      chartSpec,
      tableData,
      title: title || chartSpec?.title || 'Data Explorer'
    });
    setExploreViewMode('table');
  }

  function closeExplorePanel() {
    // Restore previous sidebar state
    setIsSidebarCollapsed(previousSidebarState.current);
    setExplorePanel({
      isOpen: false,
      chartSpec: null,
      tableData: null,
      title: null
    });
  }

  async function confirmDeleteConversation() {
    const conversationId = deleteDialog.conversationId;
    if (!conversationId) return;

    closeDeleteDialog();
    setIsDeleting(prev => ({ ...prev, [conversationId]: true }));

    try {
      // In demo mode, delete from localStorage
      if (isDemoMode) {
        deleteDemoConversation(conversationId);

        // Get the projectId of the deleted conversation before removing it
        const deletedConversation = conversations.find(c => c.id === conversationId);
        const deletedProjectId = deletedConversation?.projectId;

        // Remove conversation from local state immediately
        setConversations(prev => prev.filter(c => c.id !== conversationId));

        // Show success toast
        message.success('Conversation deleted successfully');

        // Also update project counts in sidebar
        if (deletedProjectId) {
          // Update the specific project count
          setSidebarProjects(prev => prev.map(p =>
            p.id === deletedProjectId
              ? { ...p, conversationsCount: Math.max(0, (p.conversationsCount || 0) - 1) }
              : p
          ));
        } else {
          // Update global count immediately (optimistic update)
          setGlobalConversationCount(prev => Math.max(0, prev - 1));
        }

        // If deleted conversation was current, show new chat interface
        if (currentConversationId === conversationId) {
          setCurrentConversationId(null);
          setMessages([]);
        }

        setIsDeleting(prev => {
          const updated = { ...prev };
          delete updated[conversationId];
          return updated;
        });
        return;
      }

      const token = localStorage.getItem('authToken');
      const res = await fetch(`${CONVERSATIONS_API}/${sessionId}/${conversationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Check if delete was successful (2xx status)
      if (res.ok || res.status === 200 || res.status === 204) {
        // Get success message from response
        const responseData = await res.json().catch(() => ({ message: 'Conversation deleted successfully' }));

        // Get the projectId of the deleted conversation before removing it
        const deletedConversation = conversations.find(c => c.id === conversationId);
        const deletedProjectId = deletedConversation?.projectId;

        // Remove conversation from local state immediately
        setConversations(prev => prev.filter(c => c.id !== conversationId));

        // Show success toast
        message.success(responseData.message || 'Conversation deleted successfully');

        // Update conversation counts immediately (global and project)
        loadConversationCounts();

        // Also update project counts in sidebar
        if (deletedProjectId) {
          // Update the specific project count
          setSidebarProjects(prev => prev.map(p =>
            p.id === deletedProjectId
              ? { ...p, conversationsCount: Math.max(0, (p.conversationsCount || 0) - 1) }
              : p
          ));
        } else {
          // Update global count immediately (optimistic update)
          setGlobalConversationCount(prev => Math.max(0, prev - 1));
        }

        // If deleted conversation was current, show new chat interface
        if (currentConversationId === conversationId) {
          setCurrentConversationId(null);
          setMessages([]);
        }

        // Don't reload conversations - just remove from list (already done above)
      } else {
        // Delete failed - show error toast
        const data = await res.json().catch(() => ({}));
        console.error('Delete failed:', res.status, data);
        message.error(data.error || data.message || 'Failed to delete conversation');
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
      message.error('Failed to delete conversation: ' + (err.message || 'Network error'));
    } finally {
      setIsDeleting(prev => {
        const updated = { ...prev };
        delete updated[conversationId];
        return updated;
      });
    }
  }

  function updateConversationTitle(conversationId, title) {
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, title } : c))
    );
  }

  // Clear all conversations
  async function handleClearAllConversations() {
    Modal.confirm({
      title: 'Clear All Conversations',
      content: 'Are you sure you want to delete all conversations? This action cannot be undone.',
      okText: 'Clear All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // In demo mode, clear from localStorage
          if (isDemoMode) {
            clearAllDemoConversations();
            // Clear local state
            setConversations([]);
            setCurrentConversationId(null);
            setMessages([]);
            setGlobalConversationCount(0);
            setSidebarProjects(prev => prev.map(p => ({ ...p, conversationsCount: 0 })));
            // Mark as loaded to prevent reload
            conversationsLoadedRef.current = true;
            // Reset selected project if any
            setSelectedProjectId('');
            message.success('All conversations cleared successfully');
            setShowSettingsMenu(false);
            return;
          }

          const token = localStorage.getItem('authToken');
          const res = await fetch(`${CONVERSATIONS_API}/${sessionId}/clear-all`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (res.ok) {
            // Clear local state
            setConversations([]);
            setCurrentConversationId(null);
            setMessages([]);
            setGlobalConversationCount(0);
            setSidebarProjects(prev => prev.map(p => ({ ...p, conversationsCount: 0 })));

            // Mark as loaded to prevent reload from server
            conversationsLoadedRef.current = true;

            // Reset selected project if any
            setSelectedProjectId('');

            message.success('All conversations cleared successfully');
            setShowSettingsMenu(false);
          } else {
            const errorData = await res.json().catch(() => ({ error: 'Failed to clear conversations' }));
            throw new Error(errorData.error || 'Failed to clear conversations');
          }
        } catch (err) {
          console.error('Failed to clear conversations:', err);
          message.error(`Error: ${err.message}`);
        }
      }
    });
  }

  // Clear project conversations
  async function handleClearProjectConversations(projectId = null) {
    const targetProjectId = projectId || selectedProjectId;
    if (!targetProjectId) return;

    Modal.confirm({
      title: 'Clear Project Conversations',
      content: 'Are you sure you want to delete all conversations in this project? This action cannot be undone.',
      okText: 'Clear All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // In demo mode, delete from localStorage
          if (isDemoMode) {
            const demoConversations = loadDemoConversations();
            const filtered = demoConversations.filter(c => c.projectId !== targetProjectId);
            localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(filtered));

            // Remove conversations from local state
            setConversations(prev => prev.filter(c => c.projectId !== targetProjectId));

            // Clear current conversation if it belongs to this project
            if (currentConversationId) {
              const currentConv = conversations.find(c => c.id === currentConversationId);
              if (currentConv?.projectId === targetProjectId) {
                setCurrentConversationId(null);
                setMessages([]);
              }
            }

            // Update project count
            setSidebarProjects(prev => prev.map(p =>
              p.id === targetProjectId ? { ...p, conversationsCount: 0 } : p
            ));

            // If we cleared the currently selected project, switch to global
            if (selectedProjectId === targetProjectId) {
              setSelectedProjectId('');
              // Mark as loaded to prevent reload
              conversationsLoadedRef.current = true;
            }

            message.success('Project conversations cleared successfully');
            setShowSettingsMenu(false);
            return;
          }

          const token = localStorage.getItem('authToken');
          const res = await fetch(`${CONVERSATIONS_API}/${sessionId}/clear-project/${targetProjectId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (res.ok) {
            // Remove conversations from local state
            setConversations(prev => prev.filter(c => c.projectId !== targetProjectId));

            // Clear current conversation if it belongs to this project
            if (currentConversationId) {
              const currentConv = conversations.find(c => c.id === currentConversationId);
              if (currentConv?.projectId === targetProjectId) {
                setCurrentConversationId(null);
                setMessages([]);
              }
            }

            // Update project count
            setSidebarProjects(prev => prev.map(p =>
              p.id === targetProjectId ? { ...p, conversationsCount: 0 } : p
            ));

            // If we cleared the currently selected project, switch to global
            if (selectedProjectId === targetProjectId) {
              setSelectedProjectId('');
              // Mark as loaded to prevent reload
              conversationsLoadedRef.current = true;
            }

            message.success('Project conversations cleared successfully');
            setShowSettingsMenu(false);
          } else {
            const errorData = await res.json().catch(() => ({ error: 'Failed to clear project conversations' }));
            throw new Error(errorData.error || 'Failed to clear project conversations');
          }
        } catch (err) {
          console.error('Failed to clear project conversations:', err);
          message.error(`Error: ${err.message}`);
        }
      }
    });
  }

  // Close settings menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    }

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsMenu]);

  // Remove suggested questions section from text before rendering
  // Removes the suggested questions that will be displayed separately at the bottom
  function removeSuggestedQuestions(text) {
    if (!text) return text;

    // First, get the questions that will be extracted and shown at bottom
    const extractedQuestions = extractSuggestedQuestions(text);

    if (extractedQuestions.length === 0) {
      // No suggested questions found, return text as-is
      return text;
    }

    let cleaned = text;

    // Remove the section header if present
    const headerPattern = /(?:Suggested questions?|Follow-up questions?|Suggested follow-up questions?|You might also ask|Related questions?|Questions you might ask)[:\s]*\n?/gi;
    cleaned = cleaned.replace(headerPattern, '');

    // Remove each extracted question from the text (only if it appears)
    extractedQuestions.forEach(question => {
      // Escape special regex characters
      const escaped = question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Remove the question in various formats:
      // 1. As a standalone line (with optional numbering/bullets)
      const linePattern = new RegExp(`^\\s*(?:\\d+[\.\)]\\s*|[-*•]\\s*)?${escaped}\\s*$`, 'gim');
      cleaned = cleaned.replace(linePattern, '');

      // 2. As part of a line with newlines around it
      const blockPattern = new RegExp(`(?:^|\\n)\\s*(?:\\d+[\.\)]\\s*|[-*•]\\s*)?${escaped}\\s*(?:\\n|$)`, 'gi');
      cleaned = cleaned.replace(blockPattern, '');
    });

    // Clean up extra newlines and whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();

    // SAFEGUARD: If cleaned text is empty but original had content, return original
    // This prevents accidentally removing all content
    if (!cleaned.trim() && text.trim()) {
      return text;
    }

    return cleaned;
  }

  // Extract suggested follow-up questions from response text
  // Looks for patterns like "Suggested questions:", "Follow-up:", or questions at the end
  function extractSuggestedQuestions(text) {
    if (!text) return [];

    const questions = [];

    // Pattern 1: Look for explicit "Suggested questions:" or similar sections
    const sectionPattern = /(?:Suggested questions?|Follow-up questions?|Suggested follow-up questions?|You might also ask|Related questions?|Questions you might ask)[:\s]*\n?\s*([^\n]+(?:\n[^\n]+)*)/i;
    const sectionMatch = text.match(sectionPattern);

    if (sectionMatch) {
      const section = sectionMatch[1];
      // Extract questions from the section (numbered list, bullet points, or plain text)
      const questionLines = section.split('\n').filter(l => l.trim());
      questionLines.forEach(line => {
        const trimmed = line.trim();
        // Remove numbering (1., 2., etc.) or bullets (-, *, •)
        const cleanQ = trimmed.replace(/^\d+[\.\)]\s*|^[-*•]\s*/, '').trim();
        // Check if it looks like a question (ends with ? or is a reasonable length)
        if (cleanQ && (cleanQ.endsWith('?') || cleanQ.length > 15) && cleanQ.length < 200) {
          // Ensure it ends with ? if it's a question
          const finalQ = cleanQ.endsWith('?') ? cleanQ : cleanQ + '?';
          if (!questions.includes(finalQ)) {
            questions.push(finalQ);
          }
        }
      });
    }

    // Pattern 2: Look for questions at the end of the text (last 2-4 lines that end with ?)
    if (questions.length === 0) {
      const lines = text.split('\n').filter(l => l.trim());
      // Check last 4 lines for questions
      const lastLines = lines.slice(-4);

      lastLines.forEach(line => {
        const trimmed = line.trim();
        // Check if it looks like a question (ends with ? and is reasonable length)
        if (trimmed.endsWith('?') && trimmed.length > 10 && trimmed.length < 200) {
          // Remove numbering/bullets
          const cleanQ = trimmed.replace(/^\d+[\.\)]\s*|^[-*•]\s*/, '').trim();
          if (cleanQ && !questions.includes(cleanQ)) {
            questions.push(cleanQ);
          }
        }
      });
    }

    // Pattern 3: Look for questions separated by newlines at the very end
    if (questions.length === 0) {
      // Get the last paragraph or section
      const lastParagraph = text.split('\n\n').pop() || '';
      const lastLines = lastParagraph.split('\n').filter(l => l.trim());

      lastLines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.endsWith('?') && trimmed.length > 10 && trimmed.length < 200) {
          const cleanQ = trimmed.replace(/^\d+[\.\)]\s*|^[-*•]\s*/, '').trim();
          if (cleanQ && !questions.includes(cleanQ)) {
            questions.push(cleanQ);
          }
        }
      });
    }

    // Remove duplicates and limit to 3 questions max
    const uniqueQuestions = [...new Set(questions)];
    return uniqueQuestions.slice(0, 3);
  }

  // Handle clicking on a suggested question
  function handleSuggestedQuestionClick(question, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Set the input value
    setInput(question);

    // Reset user scrolling flag to allow auto-scroll after new message
    if (isUserScrolling.current) {
      isUserScrolling.current = false;
    }

    // Wait for state to update, then trigger submit
    setTimeout(() => {
      // Create a synthetic submit event
      const syntheticEvent = {
        preventDefault: () => { },
        stopPropagation: () => { },
        target: { value: question }
      };

      // Call handleSubmit with the synthetic event
      handleSubmit(syntheticEvent);

      // Force scroll to bottom after message is added
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const container = messagesContainerRef.current;
          requestAnimationFrame(() => {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
            });
          });
        }
      }, 150);
    }, 50);
  }

  // Handle file selection
  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Only allow one file at a time
    if (files.length > 1) {
      message.warning('Please select only one file at a time.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // If a file already exists, ask user to remove it first or create new chat
    if (uploadedFiles.length > 0) {
      Modal.confirm({
        title: 'File Already Attached',
        content: 'A file is already attached to this chat. Would you like to remove the existing file and upload a new one, or create a new chat?',
        okText: 'Remove & Replace',
        cancelText: 'Cancel',
        onOk: () => {
          // Remove existing file first
          removeFile(uploadedFiles[0].id, true).then(() => {
            // After removal, upload the new file
            uploadFiles(files);
          });
        },
        footer: (_, { OkBtn, CancelBtn }) => (
          <>
            <Button
              onClick={() => {
                Modal.destroyAll();
                // Create new chat
                setUploadedFiles([]);
                setCurrentConversationId(null);
                setMessages([]);
                // Then upload the file
                setTimeout(() => {
                  uploadFiles(files);
                }, 100);
              }}
            >
              New Chat
            </Button>
            <CancelBtn />
            <OkBtn />
          </>
        ),
      });
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    uploadFiles(files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Upload files to backend with progress tracking
  async function uploadFiles(files) {
    if (!currentConversationId) {
      const newConvId = createNewConversation();
      setCurrentConversationId(newConvId);
    }

    // Set uploading state first, before creating formData
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    // Only append conversationId if it exists (not null)
    if (currentConversationId) {
      formData.append('conversationId', currentConversationId);
    }
    formData.append('sessionId', sessionId);

    try {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            console.log('Upload progress:', percentComplete);
            setUploadProgress(percentComplete);
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          setIsUploading(false);
          setUploadProgress(0);

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const newFiles = data.files || [];
              if (newFiles.length === 0) {
                console.error('Upload response had no files:', data);
                message.error('Files were not uploaded. Check console for details.');
                reject(new Error('No files in response'));
              } else {
                // Only keep the first file (since we only allow one)
                setUploadedFiles([newFiles[0]]);
                console.log('Files uploaded successfully:', newFiles);
                message.success('File uploaded successfully!');
                resolve(newFiles);
              }
            } catch (parseErr) {
              console.error('Error parsing upload response:', parseErr);
              message.error('Error processing upload response.');
              reject(parseErr);
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              const errorMsg = errorData.error || 'Failed to upload files';
              const details = errorData.details ? `\n\nDetails: ${errorData.details}` : '';
              console.error('Upload error:', errorData);
              message.error(errorMsg);
              reject(new Error(errorMsg));
            } catch (parseErr) {
              message.error('Failed to upload files');
              reject(new Error('Upload failed'));
            }
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          console.error('Error uploading files');
          setIsUploading(false);
          setUploadProgress(0);
          message.error('Error uploading files. Please try again.');
          reject(new Error('Network error'));
        });

        // Handle abort
        xhr.addEventListener('abort', () => {
          setIsUploading(false);
          setUploadProgress(0);
          message.warning('Upload cancelled');
          reject(new Error('Upload cancelled'));
        });

        // Send request
        xhr.open('POST', FILES_API);
        const token = localStorage.getItem('authToken');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(formData);
      });
    } catch (err) {
      console.error('Error uploading files:', err);
      setIsUploading(false);
      setUploadProgress(0);
      message.error('Error uploading files. Please try again.');
      throw err;
    }
  }

  // Remove uploaded file with loading state
  async function removeFile(fileId, silent = false) {
    setRemovingFileId(fileId);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${FILES_API}/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
        if (!silent) {
          message.success('File removed successfully');
        }
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to remove file';
        message.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('Error removing file:', err);
      if (!silent) {
        message.error('Error removing file. Please try again.');
      }
      throw err;
    } finally {
      setRemovingFileId(null);
    }
  }

  // Track previous conversation ID to detect actual conversation switches
  const prevConversationIdRef = useRef(null);

  // Load files for current conversation
  useEffect(() => {
    // Only load files when explicitly switching to a different conversation
    // Don't reload if we're just creating a new conversation from null
    if (currentConversationId) {
      const prevConvId = prevConversationIdRef.current;

      // Only reload if:
      // 1. We're switching from one conversation to another (not null -> conversation)
      // 2. OR we don't have any files yet
      if (prevConvId && prevConvId !== currentConversationId) {
        // Switching to a different conversation - load its files
        fetch(`${FILES_API}?conversationId=${currentConversationId}`)
          .then(res => res.json())
          .then(data => {
            setUploadedFiles(data.files || []);
          })
          .catch(err => {
            console.error('Error loading files:', err);
          });
      }
      // If prevConvId is null, we're creating a new conversation - preserve existing files

      prevConversationIdRef.current = currentConversationId;
    } else {
      // Only clear files if explicitly clearing conversation (user action)
      // Don't clear on initial mount
      if (prevConversationIdRef.current !== null) {
        // User is switching away from a conversation
        setUploadedFiles([]);
      }
      prevConversationIdRef.current = null;
    }
  }, [currentConversationId]);

  // Handle stream completion and update thread message IDs
  useEffect(() => {
    if (streamState === 'done' && currentStreamingMessageId) {
      const conversation = conversations.find(c => c.id === currentConversationId);

      // Create final assistant message with stream data
      // Include Snowflake message_id from metadata events for thread continuation
      const assistantMessage = {
        id: currentStreamingMessageId,
        role: 'assistant',
        snowflakeMessageId: messageIds.assistant || null, // Store Snowflake's message_id
        streamData: {
          toolTimeline: [...toolTimeline],
          analysisText,
          finalAnswer: finalAnswer ? { ...finalAnswer } : null
        }
      };

      setMessages(prev => {
        // Double check to avoid duplicates - if message already exists, don't add it again
        const existing = prev.find(m => m.id === currentStreamingMessageId);
        if (existing) {
          // Message already exists, just update it
          return prev.map(m => m.id === currentStreamingMessageId ? assistantMessage : m);
        }
        // Message doesn't exist, add it
        return [...prev, assistantMessage];
      });

      // Update thread with last successful assistant message ID from metadata events
      // According to Snowflake docs, we must use assistant message_id as parent_message_id for continuation
      // Handle case where assistant metadata might be missing (use last successful)
      if (currentConversationId) {
        setThreads(prev => {
          const currentThread = prev[currentConversationId] || {};
          // Ensure thread_id is just the ID value, not an object
          let threadId = currentThread.thread_id;
          if (threadId && typeof threadId === 'object' && threadId !== null) {
            threadId = threadId.thread_id || threadId.threadId || threadId.id || threadId;
          }

          // Store the assistant message_id to use as parent_message_id for the next message
          // The assistant message_id is what we use for thread continuation
          const lastAssistantMessageId = messageIds.assistant || currentThread.last_assistant_message_id;

          if (lastAssistantMessageId) {
            console.log(`[App] Updated last_assistant_message_id: ${lastAssistantMessageId} for conversation ${currentConversationId}`);
          }

          return {
            ...prev,
            [currentConversationId]: {
              thread_id: threadId, // Store just the ID value
              last_assistant_message_id: lastAssistantMessageId || null // Store assistant message_id for next message
            }
          };
        });
      }

      // Also update the last user message with its Snowflake message_id
      if (messageIds.user && currentConversationId) {
        setMessages(prev => {
          // Find the last user message and update it with Snowflake message_id
          const userMessages = prev.filter(m => m.role === 'user');
          if (userMessages.length > 0) {
            const lastUserMessage = userMessages[userMessages.length - 1];
            return prev.map(m =>
              m.id === lastUserMessage.id
                ? { ...m, snowflakeMessageId: messageIds.user }
                : m
            );
          }
          return prev;
        });
      }

      // Update conversation and save
      // Use messages state as source of truth - it includes all updates (assistant message, user message updates)
      // Filter out the old assistant message if it exists, then add the new one
      const updatedMessages = [...messages.filter(m => m.id !== currentStreamingMessageId), assistantMessage];

      // Get conversation title from existing conversation or use default
      const conversationTitle = conversation?.title || 'New Conversation';

      if (conversation) {
        const updatedConversation = {
          ...conversation,
          messages: updatedMessages,
          title: conversationTitle
        };
        setConversations(prev =>
          prev.map(c =>
            c.id === currentConversationId
              ? updatedConversation
              : c
          )
        );
      } else if (currentConversationId) {
        // Conversation doesn't exist in array yet - create it and add to state
        const newConversation = {
          id: currentConversationId,
          sessionId,
          title: conversationTitle,
          messages: updatedMessages,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        setConversations(prev => [newConversation, ...prev]);
      }

      // Save conversation (localStorage in demo mode, API in normal mode)
      // Save even if conversation object wasn't in the array (handles new conversations)
      if (currentConversationId && updatedMessages.length > 0) {
        if (isDemoMode) {
          saveDemoConversation(
            currentConversationId,
            sessionId,
            conversationTitle,
            updatedMessages,
            selectedProjectId && selectedProjectId !== '' ? selectedProjectId : undefined
          );
        } else {
          fetch(SAVE_CONVERSATION_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
              sessionId,
              conversationId: currentConversationId,
              title: conversationTitle,
              messages: updatedMessages,
              projectId: selectedProjectId && selectedProjectId !== '' ? selectedProjectId : undefined
            })
          })
            .then(() => {
              // Update conversation counts in background without reloading projects
              // Add small delay to ensure database is updated
              setTimeout(() => {
                loadConversationCounts();
              }, 500);
            })
            .catch(err => console.error('Failed to save:', err));
        }
      }

      setCurrentStreamingMessageId(null);
      setShowDetails(false); // Reset show details for next stream
      resetStream(); // Reset stream state to clear analysis text and other stream data
    }
  }, [streamState, currentStreamingMessageId, toolTimeline, analysisText, finalAnswer, conversations, currentConversationId, sessionId, resetStream, messageIds, isDemoMode, selectedProjectId, messages]);

  // Auto-open details panel when analysis text becomes available
  useEffect(() => {
    if (analysisText && analysisText.trim().length > 0 && streamState === 'streaming') {
      setShowDetails(true);
    }
  }, [analysisText, streamState]);

  // Smooth auto-scroll like Gemini AI - only when user is at bottom
  const isUserScrolling = useRef(false);
  const lastScrollTop = useRef(0);
  const scrollTimeoutRef = useRef(null);

  // Detect if user is manually scrolling up
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // If user scrolled up (any amount), they're manually scrolling
      if (scrollTop < lastScrollTop.current) {
        isUserScrolling.current = true;
        // Clear any pending auto-scroll
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = null;
        }
      }

      // If user scrolls back to near bottom (within 50px), resume auto-scroll
      if (distanceFromBottom < 50) {
        isUserScrolling.current = false;
      }

      lastScrollTop.current = scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth scroll to bottom - only during streaming and when user hasn't scrolled up
  useEffect(() => {
    const smoothScrollToBottom = () => {
      if (!messagesContainerRef.current || isUserScrolling.current) return;

      const container = messagesContainerRef.current;
      const targetScrollTop = container.scrollHeight - container.clientHeight;

      // Only scroll if not already at bottom
      if (Math.abs(container.scrollTop - targetScrollTop) > 10) {
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    };

    // Initial scroll on new messages (only if user hasn't scrolled up)
    if (messages.length > 0 && !isUserScrolling.current) {
      smoothScrollToBottom();
    }

    // During streaming, scroll periodically but less aggressively
    if (streamState === 'streaming') {
      const intervalId = setInterval(() => {
        if (!isUserScrolling.current) {
          smoothScrollToBottom();
        }
      }, 500); // Check every 500ms instead of continuous animation

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [messages, streamState, finalAnswer, analysisText]);

  async function handleSubmit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Get message text from event target or input state
    const messageText = (e?.target?.value || input).trim();
    if (!messageText || !sessionId) return;

    // Create new conversation if none exists
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = createNewConversation();
      setCurrentConversationId(conversationId);

      // If we have uploaded files, update them to associate with the new conversation
      if (uploadedFiles.length > 0) {
        // Files will be associated with conversationId when they were uploaded
        // Since we just created the conversation, files uploaded before will need to be updated
        // For now, files will remain in state and be used in the message
      }
    }

    // Create user message - Snowflake message_id will be added when metadata event is received
    const userMessage = {
      id: Date.now() + '_user',
      role: 'user',
      text: messageText,
      snowflakeMessageId: null // Will be set when metadata event is received
    };

    setInput('');

    // Reset textarea height
    if (textInputRef.current) {
      textInputRef.current.style.height = 'auto';
    }

    // Update conversation title if it's the first message
    let conversationTitle = 'New Conversation';
    setConversations(prev => {
      const conversation = prev.find(c => c.id === conversationId);
      const isFirstMessage = !conversation || conversation.messages.length === 0;
      conversationTitle = conversation?.title || 'New Conversation';

      if (isFirstMessage && conversationTitle === 'New Conversation') {
        conversationTitle = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
        // Update local state immediately so title shows right away
        const updated = prev.map(c =>
          c.id === conversationId
            ? { ...c, title: conversationTitle }
            : c
        );
        // Also save to backend
        updateConversationTitle(conversationId, conversationTitle);
        return updated;
      }
      return prev;
    });

    // Add user message immediately (Snowflake message_id will be added when metadata event is received)
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // Reset scroll flag and force scroll to bottom when user sends a new message
    isUserScrolling.current = false;
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);

    // Update conversation with user message - need to get the title from state
    setConversations(prev => {
      const conversation = prev.find(c => c.id === conversationId);
      const finalTitle = conversation?.title || conversationTitle;
      return prev.map(c =>
        c.id === conversationId
          ? { ...c, title: finalTitle, messages: updatedMessages }
          : c
      );
    });

    // Create assistant message ID for this stream
    const assistantMessageId = Date.now() + '_assistant';
    setCurrentStreamingMessageId(assistantMessageId);
    setCurrentUserQuestion(messageText); // Store the user question for display in status bar

    // Reset stream state (this also resets messageIds)
    resetStream();

    // Get thread information for this conversation
    let threadInfo = threads[conversationId];
    let threadId = threadInfo?.thread_id;

    // Extract thread_id if it's an object (handle both formats)
    if (threadId && typeof threadId === 'object') {
      threadId = threadId.thread_id || threadId.threadId || threadId;
    }

    // Determine parent_message_id for thread continuation
    // Flow: First message -> parent_message_id: 0
    //       Receive assistant metadata with message_id -> Store it
    //       Next message -> Use stored assistant message_id as parent_message_id
    let parentMessageId = 0; // Default to 0 for new thread

    if (threadInfo?.last_assistant_message_id) {
      // Use the stored last assistant message_id from previous turn
      parentMessageId = threadInfo.last_assistant_message_id;
      console.log(`[App] Using stored last_assistant_message_id as parent_message_id: ${parentMessageId}`);
    } else if (messages.length > 0) {
      // Try to find the last assistant message and use its Snowflake message_id
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      if (assistantMessages.length > 0) {
        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
        if (lastAssistantMessage.snowflakeMessageId) {
          parentMessageId = lastAssistantMessage.snowflakeMessageId;
          console.log(`[App] Using last assistant message's Snowflake message_id as parent_message_id: ${parentMessageId}`);
        }
      }
    }

    // If still 0, it's a new thread (first message)
    if (parentMessageId === 0) {
      console.log(`[App] Starting new thread - parent_message_id = 0`);
    }

    // If no thread exists, create one before sending the message
    if (!threadId) {
      try {
        const threadResponse = await fetch(THREADS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin_application: 'cortex-chat'
          })
        });

        if (threadResponse.ok) {
          const threadResponseData = await threadResponse.json();

          // Extract thread_id - handle if it's a string/number or an object
          if (typeof threadResponseData === 'object' && threadResponseData !== null) {
            threadId = threadResponseData.thread_id || threadResponseData.threadId || threadResponseData;
          } else {
            threadId = threadResponseData; // It's already just the ID
          }

          console.log('[Frontend] Created thread with ID:', threadId);

          // Store thread_id for this conversation (store only the ID, not the object)
          setThreads(prev => ({
            ...prev,
            [conversationId]: {
              thread_id: threadId, // Store just the ID value
              last_assistant_message_id: null // Will be set when assistant metadata is received
            }
          }));
          parentMessageId = 0; // First message in thread
        } else {
          const errorText = await threadResponse.text();
          console.error('Failed to create thread:', errorText);
          // Continue without thread - app will still work but without thread persistence
        }
      } catch (err) {
        console.error('Error creating thread:', err);
        // Continue without thread - app will still work but without thread persistence
      }
    }

    // Fetch file contents if files are uploaded
    let fileContents = '';
    if (uploadedFiles.length > 0) {
      try {
        const fileContentPromises = uploadedFiles.map(file =>
          fetch(`${FILES_API}/${file.id}/content`)
            .then(res => res.json())
            .then(data => `[File: ${file.filename}]\n${data.content || ''}`)
            .catch(() => '')
        );
        const contents = await Promise.all(fileContentPromises);
        fileContents = '\n\n' + contents.filter(c => c).join('\n\n');
      } catch (err) {
        console.error('Error fetching file contents:', err);
      }
    }

    // Prepare request body with thread support
    // According to Snowflake docs:
    // - thread_id: required when using threads
    // - parent_message_id: 0 for new thread, last assistant message_id for continuation
    // - messages: exactly one user message
    const requestBody = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: messageText + fileContents
            }
          ]
        }
      ],
      stream: true
    };

    // Add thread_id if available - ensure it's just the ID value, not an object
    if (threadId) {
      // Extract numeric/string ID if threadId is an object
      if (typeof threadId === 'object' && threadId !== null) {
        requestBody.thread_id = threadId.thread_id || threadId.threadId || threadId;
      } else {
        requestBody.thread_id = threadId;
      }
    }

    // Add parent_message_id (0 for new thread, assistant message_id for continuation)
    requestBody.parent_message_id = parentMessageId;

    // Add agent_id if selected
    if (selectedAgentId) {
      requestBody.agent_id = selectedAgentId;
    }

    console.log('[Frontend] Sending request with thread_id:', requestBody.thread_id, 'parent_message_id:', requestBody.parent_message_id, 'agent_id:', requestBody.agent_id);

    // Start streaming with thread support
    startStream(requestBody);
  }

  return (
    <div className="app-root">
      <div className="app-container">
        {/* Left Pane - Conversations */}
        <aside className={`conversations-pane ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Fixed Header */}
          <div className="sidebar-fixed-header">
            <div className="sidebar-logo">
              <span className="logo-text">{projectName}</span>
            </div>
            <Tooltip title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                className="sidebar-toggle-btn"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                {isSidebarCollapsed ? (
                  <Expand size={20} />
                ) : (
                  <ListCollapse size={20} />
                )}
              </button>
            </Tooltip>
          </div>

          {/* Fixed Actions Section */}
          <div className="sidebar-fixed-actions">
            <div className="sidebar-actions">
              <Tooltip title="New chat">
                <button
                  className="sidebar-action-btn"
                  onClick={createNewConversation}
                >
                  <MessageSquarePlus size={16} className="icon-blue" />
                  <span>New Chat</span>
                </button>
              </Tooltip>
              {isAdmin && (
                <Tooltip title="Create new project">
                  <button
                    className="sidebar-action-btn"
                    onClick={() => setShowProjectModal(true)}
                  >
                    <Plus size={16} className="icon-green" />
                    <span>New Project</span>
                  </button>
                </Tooltip>
              )}
              <Tooltip title="Search chats">
                <button
                  className="sidebar-action-btn"
                  onClick={() => setShowSearchModal(true)}
                >
                  <Search size={16} className="icon-gray" />
                  <span>Search Chat</span>
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Scrollable Content Area */}
          {!isSidebarCollapsed && (
            <div className="sidebar-scrollable-content">
              {/* Projects Section - Only show if projects are available */}
              {(!loadingProjects && sidebarProjects.length > 0) && (
                <div className="sidebar-section">
                  <div
                    className="sidebar-section-header"
                    onClick={() => setSectionsCollapsed(prev => ({ ...prev, projects: !prev.projects }))}
                  >
                    <span className="sidebar-section-title">Projects</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedProjectId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectId('');
                            setCurrentConversationId(null);
                            setMessages([]);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#ff4d4f',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 77, 79, 0.1)';
                            e.currentTarget.style.color = '#ff7875';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'none';
                            e.currentTarget.style.color = '#ff4d4f';
                          }}
                          title="Clear selection"
                        >
                          Unselect
                        </button>
                      )}
                      {sectionsCollapsed.projects ? (
                        <ChevronDown size={16} className="section-chevron" />
                      ) : (
                        <ChevronUp size={16} className="section-chevron" />
                      )}
                    </div>
                  </div>
                  {!sectionsCollapsed.projects && (
                    <div className="sidebar-projects-list">
                      {loadingProjects ? (
                        <div className="projects-loading">
                          <Spin size="small" />
                        </div>
                      ) : (
                        <>
                          {sidebarProjects.map(project => (
                            <div
                              key={project.id}
                              className={`sidebar-project-item ${selectedProjectId === project.id ? 'active' : ''}`}
                              onClick={() => {
                                // Select project and show new chat interface (even if 0 conversations)
                                setSelectedProjectId(project.id);
                                setCurrentConversationId(null);
                                setMessages([]);
                                // Mark as loaded to prevent unnecessary reload
                                conversationsLoadedRef.current = true;
                              }}
                              onMouseEnter={() => setHoveredProjectId(project.id)}
                              onMouseLeave={() => {
                                if (hoveredMoreBtn !== project.id) {
                                  setHoveredProjectId(null);
                                }
                              }}
                            >
                              <FolderKanban size={16} className="icon-purple" />
                              <span className="project-item-name">{project.name}</span>
                              <span className="project-count">{project.conversationsCount || 0}</span>
                              <div className="project-item-actions">
                                <button
                                  className="project-more-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHoveredMoreBtn(hoveredMoreBtn === project.id ? null : project.id);
                                  }}
                                  type="button"
                                >
                                  <MoreVertical size={14} />
                                </button>
                                {hoveredMoreBtn === project.id && (
                                  <div
                                    className="project-more-menu"
                                    onMouseEnter={() => setHoveredMoreBtn(project.id)}
                                    onMouseLeave={() => {
                                      setHoveredMoreBtn(null);
                                      setHoveredProjectId(null);
                                    }}
                                  >
                                    <button
                                      className="project-menu-item"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleProjectEdit(project);
                                        setHoveredMoreBtn(null);
                                        setHoveredProjectId(null);
                                      }}
                                      type="button"
                                    >
                                      <Edit2 size={14} />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      className="project-menu-item project-menu-item-danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClearProjectConversations(project.id);
                                        setHoveredMoreBtn(null);
                                        setHoveredProjectId(null);
                                      }}
                                      type="button"
                                    >
                                      <Trash2 size={14} />
                                      <span>Clear Conversations</span>
                                    </button>
                                    <button
                                      className="project-menu-item project-menu-item-danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleProjectDelete(project.id);
                                        setHoveredMoreBtn(null);
                                        setHoveredProjectId(null);
                                      }}
                                      type="button"
                                    >
                                      <Trash2 size={14} />
                                      <span>Delete Project</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Chats Section */}
              <div className="sidebar-section">
                <div
                  className="sidebar-section-header"
                  onClick={() => setSectionsCollapsed(prev => ({ ...prev, chats: !prev.chats }))}
                >
                  <span className="sidebar-section-title">Chats</span>
                  {sectionsCollapsed.chats ? (
                    <ChevronDown size={16} className="section-chevron" />
                  ) : (
                    <ChevronUp size={16} className="section-chevron" />
                  )}
                </div>
                {!sectionsCollapsed.chats && (
                  <div className="conversations-list">
                    {isLoadingConversations ? (
                      <div className="conversations-skeleton">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <div key={i} className="conversation-skeleton-item">
                            <div className="conversation-skeleton-content">
                              <Skeleton.Input
                                active
                                size="small"
                                className={`delay-${i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1}`}
                                style={{
                                  width: '100%',
                                  height: '16px',
                                  borderRadius: '4px'
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (() => {
                      const categorized = categorizeConversations(conversations);
                      const hasAny = categorized.today.length > 0 || categorized.yesterday.length > 0 ||
                        categorized.lastWeek.length > 0 || categorized.older.length > 0;

                      if (!hasAny) {
                        return (
                          <div className="conversations-empty">
                            <p>No conversations yet</p>
                            <p className="hint">Start chatting to create one</p>
                          </div>
                        );
                      }

                      return (
                        <>
                          {categorized.today.length > 0 && (
                            <div className="conversation-group">
                              <div className="group-header">Today</div>
                              {categorized.today.map((conv) => (
                                <div
                                  key={conv.id}
                                  className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  <div className="conversation-content">
                                    <div className="conversation-title">{conv.title.length > 40 ? conv.title.substring(0, 40) + '...' : conv.title}</div>
                                  </div>
                                  <Tooltip title="Delete conversation">
                                    <button
                                      className="delete-conversation-btn"
                                      onClick={(e) => openDeleteDialog(conv.id, e)}
                                      disabled={isDeleting[conv.id]}
                                    >
                                      {isDeleting[conv.id] ? (
                                        <span className="delete-spinner"></span>
                                      ) : (
                                        <X size={14} />
                                      )}
                                    </button>
                                  </Tooltip>
                                </div>
                              ))}
                            </div>
                          )}
                          {categorized.yesterday.length > 0 && (
                            <div className="conversation-group">
                              <div className="group-header">Yesterday</div>
                              {categorized.yesterday.map((conv) => (
                                <div
                                  key={conv.id}
                                  className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  <div className="conversation-content">
                                    <div className="conversation-title">{conv.title.length > 40 ? conv.title.substring(0, 40) + '...' : conv.title}</div>
                                  </div>
                                  <Tooltip title="Delete conversation">
                                    <button
                                      className="delete-conversation-btn"
                                      onClick={(e) => openDeleteDialog(conv.id, e)}
                                      disabled={isDeleting[conv.id]}
                                    >
                                      {isDeleting[conv.id] ? (
                                        <span className="delete-spinner"></span>
                                      ) : (
                                        <X size={14} />
                                      )}
                                    </button>
                                  </Tooltip>
                                </div>
                              ))}
                            </div>
                          )}
                          {categorized.lastWeek.length > 0 && (
                            <div className="conversation-group">
                              <div className="group-header">Last week</div>
                              {categorized.lastWeek.map((conv) => (
                                <div
                                  key={conv.id}
                                  className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  <div className="conversation-content">
                                    <div className="conversation-title">{conv.title.length > 40 ? conv.title.substring(0, 40) + '...' : conv.title}</div>
                                  </div>
                                  <Tooltip title="Delete conversation">
                                    <button
                                      className="delete-conversation-btn"
                                      onClick={(e) => openDeleteDialog(conv.id, e)}
                                      disabled={isDeleting[conv.id]}
                                    >
                                      {isDeleting[conv.id] ? (
                                        <span className="delete-spinner"></span>
                                      ) : (
                                        <X size={14} />
                                      )}
                                    </button>
                                  </Tooltip>
                                </div>
                              ))}
                            </div>
                          )}
                          {categorized.older.length > 0 && (
                            <div className="conversation-group">
                              <div className="group-header">Older</div>
                              {categorized.older.map((conv) => (
                                <div
                                  key={conv.id}
                                  className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  <div className="conversation-content">
                                    <div className="conversation-title">{conv.title.length > 40 ? conv.title.substring(0, 40) + '...' : conv.title}</div>
                                  </div>
                                  <Tooltip title="Delete conversation">
                                    <button
                                      className="delete-conversation-btn"
                                      onClick={(e) => openDeleteDialog(conv.id, e)}
                                      disabled={isDeleting[conv.id]}
                                    >
                                      {isDeleting[conv.id] ? (
                                        <span className="delete-spinner"></span>
                                      ) : (
                                        <X size={14} />
                                      )}
                                    </button>
                                  </Tooltip>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fixed Profile Section */}
          {!isSidebarCollapsed && user && (
            <div className="sidebar-fixed-profile">
              <div className="user-info">
                {user.picture && (
                  <img src={user.picture} alt={user.name} className="user-avatar-small" />
                )}
                <div className="user-details">
                  <div className="user-name">{user.name}</div>
                  <div className="user-email">{user.email}</div>
                  {user.role && (
                    <div className="user-role">
                      <span className={`role-badge ${user.role.toLowerCase()}`}>
                        {user.role}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="user-actions">
                {isAdmin && (
                  <Tooltip title="Admin Dashboard">
                    <a href="/admin" className="user-action-btn">
                      <Shield size={16} className="icon-yellow" />
                    </a>
                  </Tooltip>
                )}
                <div className="settings-menu-wrapper" ref={settingsMenuRef}>
                  <Tooltip title="Settings">
                    <button
                      className="user-action-btn"
                      onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                    >
                      <Settings size={16} className="icon-gray" />
                    </button>
                  </Tooltip>
                  {showSettingsMenu && (
                    <div className="settings-dropdown">
                      <div className="settings-menu-header">
                        <span className="settings-menu-title">Settings</span>
                      </div>
                      <button
                        className="settings-menu-item"
                        onClick={() => {
                          toggleTheme();
                          setShowSettingsMenu(false);
                        }}
                      >
                        <div className="settings-menu-item-content">
                          <div className="settings-menu-item-icon">
                            {theme === 'light' ? (
                              <Moon size={16} />
                            ) : (
                              <Sun size={16} />
                            )}
                          </div>
                          <div className="settings-menu-item-text">
                            <div className="settings-menu-item-label">
                              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                            </div>
                            <div className="settings-menu-item-description">
                              Switch to {theme === 'light' ? 'dark' : 'light'} theme
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        className="settings-menu-item settings-menu-item-danger"
                        onClick={handleClearAllConversations}
                      >
                        <div className="settings-menu-item-content">
                          <div className="settings-menu-item-icon">
                            <Trash2 size={16} />
                          </div>
                          <div className="settings-menu-item-text">
                            <div className="settings-menu-item-label">Clear All Conversations</div>
                            <div className="settings-menu-item-description">
                              Delete all your conversations permanently
                            </div>
                          </div>
                        </div>
                      </button>
                      {selectedProjectId && (
                        <button
                          className="settings-menu-item settings-menu-item-danger"
                          onClick={handleClearProjectConversations}
                        >
                          <div className="settings-menu-item-content">
                            <div className="settings-menu-item-icon">
                              <Trash2 size={16} />
                            </div>
                            <div className="settings-menu-item-text">
                              <div className="settings-menu-item-label">Clear Project Conversations</div>
                              <div className="settings-menu-item-description">
                                Delete all conversations in this project
                              </div>
                            </div>
                          </div>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <Tooltip title="Logout">
                  <button onClick={logout} className="user-action-btn">
                    <LogOut size={16} className="icon-red" />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </aside>

        {/* Search Modal */}
        {
          showSearchModal && (
            <div className="search-modal-overlay" onClick={() => setShowSearchModal(false)}>
              <div className="search-modal" onClick={(e) => e.stopPropagation()}>
                <div className="search-modal-header">
                  <h2>Search chats</h2>
                  <button className="close-modal-btn" onClick={() => setShowSearchModal(false)}>
                    <X size={20} />
                  </button>
                </div>
                <div className="search-modal-input-wrapper">
                  <Search className="search-icon" size={16} />
                  <input
                    type="text"
                    placeholder="Search chats..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-modal-input"
                    autoFocus
                  />
                </div>
                <div className="search-modal-results">
                  {isSearching ? (
                    <div className="conversations-skeleton">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="conversation-skeleton-item">
                          <div className="conversation-skeleton-content">
                            <Skeleton.Input
                              active
                              size="small"
                              className={`delay-${i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1}`}
                              style={{
                                width: '100%',
                                height: '16px',
                                borderRadius: '4px'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (() => {
                    const categorized = categorizeConversations(searchResults);
                    const hasAny = categorized.today.length > 0 || categorized.yesterday.length > 0 ||
                      categorized.lastWeek.length > 0 || categorized.older.length > 0;

                    if (!hasAny) {
                      return <div className="search-empty">No conversations found</div>;
                    }

                    return (
                      <>
                        {categorized.today.length > 0 && (
                          <div className="search-group">
                            <div className="group-header">Today</div>
                            {categorized.today.map((conv) => (
                              <div
                                key={conv.id}
                                className={`search-result-item ${currentConversationId === conv.id ? 'active' : ''}`}
                              >
                                <div
                                  className="search-result-content"
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  {conv.title}
                                </div>
                                <Tooltip title="Delete conversation">
                                  <button
                                    className="delete-conversation-btn"
                                    onClick={(e) => openDeleteDialog(conv.id, e)}
                                    disabled={isDeleting[conv.id]}
                                  >
                                    {isDeleting[conv.id] ? (
                                      <span className="delete-spinner"></span>
                                    ) : (
                                      <X size={14} />
                                    )}
                                  </button>
                                </Tooltip>
                              </div>
                            ))}
                          </div>
                        )}
                        {categorized.yesterday.length > 0 && (
                          <div className="search-group">
                            <div className="group-header">Yesterday</div>
                            {categorized.yesterday.map((conv) => (
                              <div
                                key={conv.id}
                                className={`search-result-item ${currentConversationId === conv.id ? 'active' : ''}`}
                              >
                                <div
                                  className="search-result-content"
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  {conv.title}
                                </div>
                                <Tooltip title="Delete conversation">
                                  <button
                                    className="delete-conversation-btn"
                                    onClick={(e) => openDeleteDialog(conv.id, e)}
                                    disabled={isDeleting[conv.id]}
                                  >
                                    {isDeleting[conv.id] ? (
                                      <span className="delete-spinner"></span>
                                    ) : (
                                      <X size={14} />
                                    )}
                                  </button>
                                </Tooltip>
                              </div>
                            ))}
                          </div>
                        )}
                        {categorized.lastWeek.length > 0 && (
                          <div className="search-group">
                            <div className="group-header">Last week</div>
                            {categorized.lastWeek.map((conv) => (
                              <div
                                key={conv.id}
                                className={`search-result-item ${currentConversationId === conv.id ? 'active' : ''}`}
                              >
                                <div
                                  className="search-result-content"
                                  onClick={() => switchConversation(conv.id)}
                                >
                                  {conv.title}
                                </div>
                                <Tooltip title="Delete conversation">
                                  <button
                                    className="delete-conversation-btn"
                                    onClick={(e) => openDeleteDialog(conv.id, e)}
                                    disabled={isDeleting[conv.id]}
                                  >
                                    {isDeleting[conv.id] ? (
                                      <span className="delete-spinner"></span>
                                    ) : (
                                      <X size={14} />
                                    )}
                                  </button>
                                </Tooltip>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )
        }

        {/* Main Content Area - Chat + Explore Panel */}
        <div className={`main-content-area ${explorePanel.isOpen ? 'with-explore' : ''}`}>
          {/* Chat Card */}
          <div className={`chat-card ${explorePanel.isOpen ? 'shrink' : ''}`}>
            {/* Header removed - greeting is in empty state */}

            <main className="chat-main">
              <div className="messages" ref={messagesContainerRef}>
                {/* Skeleton loader while loading conversation messages */}
                {isLoadingConversationMessages && (
                  <div className="chat-skeleton-messages">
                    <div className="skeleton-row skeleton-row-in">
                      <div className="skeleton-avatar skeleton delay-1" aria-hidden="true"></div>
                      <div className="skeleton-bubble">
                        <div className="skeleton-bubble-lines">
                          <div className="skeleton-line skeleton w-70"></div>
                          <div className="skeleton-line skeleton w-90 delay-2"></div>
                          <div className="skeleton-line skeleton w-50 delay-3"></div>
                          <div className="skeleton-line skeleton skeleton-meta delay-1"></div>
                        </div>
                      </div>
                    </div>

                    <div className="skeleton-row skeleton-row-out">
                      <div className="skeleton-bubble">
                        <div className="skeleton-bubble-lines">
                          <div className="skeleton-line skeleton w-60"></div>
                          <div className="skeleton-line skeleton w-80 delay-2"></div>
                          <div className="skeleton-line skeleton w-40 delay-3"></div>
                          <div className="skeleton-line skeleton skeleton-meta delay-1"></div>
                        </div>
                      </div>
                    </div>

                    <div className="skeleton-row skeleton-row-in">
                      <div className="skeleton-avatar skeleton delay-2" aria-hidden="true"></div>
                      <div className="skeleton-bubble">
                        <div className="skeleton-bubble-lines">
                          <div className="skeleton-line skeleton w-50"></div>
                          <div className="skeleton-line skeleton w-30 delay-2"></div>
                          <div className="skeleton-line skeleton skeleton-meta delay-3"></div>
                        </div>
                      </div>
                    </div>

                    <div className="skeleton-row skeleton-row-out">
                      <div className="skeleton-bubble">
                        <div className="skeleton-bubble-lines">
                          <div className="skeleton-line skeleton w-80"></div>
                          <div className="skeleton-line skeleton w-90 delay-2"></div>
                          <div className="skeleton-line skeleton w-70 delay-3"></div>
                          <div className="skeleton-line skeleton w-40 delay-1"></div>
                          <div className="skeleton-line skeleton skeleton-meta delay-2"></div>
                        </div>
                      </div>
                    </div>

                    <div className="skeleton-row skeleton-row-in">
                      <div className="skeleton-avatar skeleton delay-3" aria-hidden="true"></div>
                      <div className="skeleton-bubble">
                        <div className="skeleton-bubble-lines">
                          <div className="skeleton-line skeleton w-40"></div>
                          <div className="skeleton-line skeleton skeleton-meta delay-1"></div>
                        </div>
                      </div>
                    </div>

                    <div className="skeleton-row skeleton-row-out">
                      <div className="skeleton-bubble">
                        <div className="skeleton-bubble-lines">
                          <div className="skeleton-line skeleton w-50"></div>
                          <div className="skeleton-line skeleton w-30 delay-2"></div>
                          <div className="skeleton-line skeleton skeleton-meta delay-3"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty state - only show when not loading and no messages */}
                {messages.length === 0 && !isLoadingConversationMessages && (
                  <div className="empty-state">
                    <div className="greeting-section">
                      <h1 className="greeting-title">{getTimeBasedGreeting()}, {user?.name || user?.firstName || 'User'}</h1>
                      <p className="greeting-subtitle">What insights can I help with?</p>
                    </div>

                    {/* Centered Search Bar - New Design */}
                    <div className="centered-search-container">
                      <form onSubmit={handleSubmit} className="new-chat-input-box">
                        {/* Hidden File Input */}
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                          accept=".txt,.pdf,.doc,.docx,.csv,.xls,.xlsx,.json"
                        />

                        {/* Uploading Indicator with Progress */}
                        {isUploading && (
                          <div className="uploading-indicator">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div className="upload-progress-circle">
                                <svg className="progress-ring" width="32" height="32">
                                  {/* Background circle */}
                                  <circle
                                    className="progress-ring-circle-bg"
                                    stroke="#e5e7eb"
                                    strokeWidth="3"
                                    fill="transparent"
                                    r="14"
                                    cx="16"
                                    cy="16"
                                  />
                                  {/* Progress circle */}
                                  <circle
                                    className="progress-ring-circle"
                                    stroke="#3b82f6"
                                    strokeWidth="3"
                                    fill="transparent"
                                    r="14"
                                    cx="16"
                                    cy="16"
                                    style={{
                                      strokeDasharray: `${2 * Math.PI * 14}`,
                                      strokeDashoffset: `${2 * Math.PI * 14 * (1 - uploadProgress / 100)}`,
                                      transition: 'stroke-dashoffset 0.3s'
                                    }}
                                  />
                                </svg>
                                <span className="progress-percentage">{uploadProgress}%</span>
                              </div>
                              <span>Uploading file...</span>
                            </div>
                          </div>
                        )}

                        {/* Uploaded Files Display */}
                        {uploadedFiles.length > 0 && (
                          <div className="uploaded-files-list">
                            {uploadedFiles.map((file) => (
                              <div key={file.id} className="uploaded-file-item">
                                <File size={14} />
                                <span className="file-name">{file.filename}</span>
                                <button
                                  type="button"
                                  className="remove-file-btn"
                                  onClick={() => removeFile(file.id)}
                                  disabled={isUploading || streamState === 'streaming' || removingFileId === file.id}
                                >
                                  {removingFileId === file.id ? (
                                    <Loader2 size={12} className="spinning" />
                                  ) : (
                                    <X size={12} />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Main Input Area */}
                        <div className="new-input-area">
                          <textarea
                            ref={textInputRef}
                            placeholder={
                              selectedAgentId && availableAgents.length > 0
                                ? `Ask ${availableAgents.find(a => a.id === selectedAgentId)?.name || 'Intelligence'} Intelligence...`
                                : availableAgents.length > 0
                                  ? `Ask ${availableAgents[0].name} Intelligence...`
                                  : "Ask Intelligence..."
                            }
                            value={input}
                            onChange={(e) => {
                              setInput(e.target.value);
                              // Auto-resize textarea
                              e.target.style.height = 'auto';
                              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                            }}
                            onKeyDown={(e) => {
                              // Submit on Enter (without Shift) - only if not streaming
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (streamState !== 'streaming') {
                                  handleSubmit(e);
                                }
                              }
                            }}
                            className="new-chat-input"
                            disabled={!sessionId}
                            rows={1}
                          />
                        </div>

                        {/* Bottom Actions */}
                        <div className="new-input-footer">
                          <div className="new-input-left">
                            <Tooltip title={uploadedFiles.length > 0 ? "Remove existing file first" : "Attach file"}>
                              <button
                                type="button"
                                className="new-icon-btn"
                                onClick={() => {
                                  if (uploadedFiles.length > 0) {
                                    message.info('Please remove the existing file first or create a new chat to upload another file.');
                                    return;
                                  }
                                  fileInputRef.current?.click();
                                }}
                                disabled={streamState === 'streaming' || isUploading || !sessionId || uploadedFiles.length > 0}
                              >
                                <Paperclip size={18} />
                              </button>
                            </Tooltip>

                            {/* Agent Chip */}
                            {availableAgents.length > 0 && (
                              <div className="agent-chip-wrapper">
                                <Select
                                  value={selectedAgentId || undefined}
                                  onChange={(value) => setSelectedAgentId(value)}
                                  className="agent-chip-select"
                                  disabled={streamState === 'streaming'}
                                  style={{ minWidth: 120 }}
                                  placeholder="Select agent"
                                >
                                  {availableAgents.map((agent) => (
                                    <Select.Option key={agent.id} value={agent.id}>
                                      {agent.name}
                                    </Select.Option>
                                  ))}
                                </Select>
                              </div>
                            )}
                          </div>

                          <div className="new-input-right">
                            <button
                              type="submit"
                              className="new-send-btn"
                              disabled={streamState === 'streaming' || !input.trim()}
                            >
                              <Send size={18} />
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* Messages - only show when not loading */}
                {!isLoadingConversationMessages && messages.map((m) => {
                  if (m.role === 'user') {
                    return (
                      <div key={m.id} className="message message-user">
                        <div className="message-text">{m.text}</div>
                      </div>
                    );
                  }

                  // For assistant messages, use stored stream data
                  const streamData = m.streamData;
                  const messageShowDetails = expandedPlanning[m.id] || false;

                  // Find the previous user message (the question that triggered this response)
                  const messageIndex = messages.findIndex(msg => msg.id === m.id);
                  const previousUserMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                  const userQuestion = previousUserMessage && previousUserMessage.role === 'user' ? previousUserMessage.text : null;

                  return (
                    <div key={m.id} className="message message-assistant">
                      {/* Unified Thinking Progress Box (saved messages) */}
                      {(streamData?.toolTimeline?.length > 0 || streamData?.analysisText) && (
                        <div className="thinking-progress-box completed">
                          {/* Header */}
                          <div
                            className="thinking-progress-header"
                            onClick={() => setExpandedPlanning(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                          >
                            <div className="thinking-progress-left">
                              <Check size={18} className="thinking-progress-icon" />
                              <span className="thinking-progress-text">Thinking completed</span>
                            </div>
                            <button className="thinking-progress-toggle">
                              {messageShowDetails ? "Hide Details" : "Show Details"}
                              {messageShowDetails ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </button>
                          </div>

                          {/* Expandable Content */}
                          {messageShowDetails && (
                            <div className="thinking-progress-content">
                              {/* Analysis content */}
                              {streamData?.analysisText && (
                                <div className="thinking-analysis">
                                  <ReactMarkdown>{streamData.analysisText}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Final Answer - CRITICAL ORDER: Summary Text → Tables/Charts → Follow-up Questions */}
                      {/* Extract chart from raw.content[] if chartSpec is null */}
                      {(() => {
                        const finalAnswer = streamData?.finalAnswer;
                        if (!finalAnswer) return null;

                        // Extract chart from raw if chartSpec is null
                        const extractedChart = extractChartFromRaw(finalAnswer);
                        const displayChartSpec = finalAnswer.chartSpec || extractedChart;

                        // Debug: Log finalAnswer data
                        console.log('[ChatApp] streamData.finalAnswer:', {
                          text: finalAnswer.text?.length,
                          table: finalAnswer.table ? { headers: finalAnswer.table.headers?.length, rows: finalAnswer.table.rows?.length } : null,
                          chartSpec: finalAnswer.chartSpec ? 'present' : null,
                          extractedChart: extractedChart ? 'present' : null,
                          displayChartSpec: displayChartSpec ? 'present' : null
                        });

                        if (!(finalAnswer.text || finalAnswer.table || displayChartSpec)) return null;

                        return (
                          <div className="final-answer-bubble">
                            {/* SUMMARY TEXT - Show EXACTLY what was streamed, no modifications */}
                            {streamData.finalAnswer.text && streamData.finalAnswer.text.trim() && (
                              <div
                                className="answer-text-content"
                                style={{ display: 'block', visibility: 'visible' }}
                                onClick={(e) => {
                                  // Handle clicks on links/buttons in markdown to prevent scroll to top
                                  const target = e.target;
                                  if (target.tagName === 'A' || target.closest('a')) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const link = target.tagName === 'A' ? target : target.closest('a');
                                    const questionText = link?.textContent?.trim();
                                    if (questionText && questionText.includes('?')) {
                                      handleSuggestedQuestionClick(questionText, e);
                                    }
                                  }
                                }}
                              >
                                <ReactMarkdown
                                  components={{
                                    a: ({ node, ...props }) => {
                                      const questionText = props.children?.toString() || '';
                                      if (questionText.includes('?') || questionText.length > 10) {
                                        return (
                                          <button
                                            type="button"
                                            className="suggested-question-btn"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleSuggestedQuestionClick(questionText, e);
                                            }}
                                            style={{
                                              background: 'transparent',
                                              border: 'none',
                                              color: '#3b82f6',
                                              textDecoration: 'underline',
                                              cursor: 'pointer',
                                              padding: 0,
                                              font: 'inherit'
                                            }}
                                          >
                                            {props.children}
                                          </button>
                                        );
                                      }
                                      return <a {...props} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} />;
                                    }
                                  }}
                                >
                                  {streamData.finalAnswer.text}
                                </ReactMarkdown>
                              </div>
                            )}

                            {/* TABLES AND CHARTS - Show only when valid table or chart data exists */}
                            {(hasValidTableData(streamData.finalAnswer.table) || hasValidChartData(displayChartSpec)) && (
                              <div className="answer-table-chart-section">
                                <EnhancedTableChart
                                  tableData={streamData.finalAnswer.table || null}
                                  chartSpec={displayChartSpec || null}
                                  title={streamData.finalAnswer.table?.title || displayChartSpec?.title || null}
                                  onExplore={openExplorePanel}
                                />
                              </div>
                            )}

                            {/* Interaction Buttons */}
                            {streamData.finalAnswer.text && (
                              <div className="message-actions">
                                <Tooltip title="Copy">
                                  <button
                                    className="action-btn"
                                    onClick={() => navigator.clipboard.writeText(streamData.finalAnswer.text)}
                                  >
                                    <Copy size={16} />
                                  </button>
                                </Tooltip>
                                <Tooltip title={conversationLikes[currentConversationId] ? "Remove like" : "Like"}>
                                  <button
                                    className={`action-btn ${conversationLikes[currentConversationId] ? 'liked' : ''}`}
                                    onClick={() => handleLikeConversation(currentConversationId)}
                                  >
                                    <ThumbsUp size={16} />
                                  </button>
                                </Tooltip>
                                <Tooltip title={conversationUnlikes[currentConversationId] ? "Feedback provided" : "Provide feedback"}>
                                  <button
                                    className={`action-btn ${conversationUnlikes[currentConversationId] ? 'unliked' : ''}`}
                                    onClick={() => handleOpenFeedbackModal(currentConversationId)}
                                  >
                                    <ThumbsDown size={16} />
                                  </button>
                                </Tooltip>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Show streaming UI for current message - only if message doesn't exist in messages yet */}
                {currentStreamingMessageId && !messages.find(m => m.id === currentStreamingMessageId) && (streamState === 'streaming' || streamState === 'done' || finalAnswer) && (
                  <div className="message message-assistant">

                    {/* Unified Thinking Progress Box (streaming) */}
                    {(toolTimeline?.length > 0 || analysisText || streamState === 'streaming') && (
                      <div className={`thinking-progress-box ${streamState === 'done' ? 'completed' : 'streaming'}`}>
                        {/* Header */}
                        <div
                          className="thinking-progress-header"
                          onClick={() => setShowDetails((v) => !v)}
                        >
                          <div className="thinking-progress-left">
                            {streamState === 'streaming' ? (
                              <div className="thinking-spinner"></div>
                            ) : (
                              <Check size={18} className="thinking-progress-icon" />
                            )}
                            <span className={`thinking-progress-text ${streamState === 'streaming' ? 'streaming' : ''}`}>
                              {streamState === 'done' ? 'Thinking completed' : agentStatus?.message || 'Analyzing your request...'}
                            </span>
                          </div>
                          <button className="thinking-progress-toggle">
                            {showDetails ? "Hide Details" : "Show Details"}
                            {showDetails ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                        </div>

                        {/* Expandable Content */}
                        {showDetails && analysisText && (
                          <div className="thinking-progress-content">
                            {/* Analysis content */}
                            <div className="thinking-analysis">
                              <ReactMarkdown>{analysisText}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===== FINAL ANSWER - CRITICAL ORDER: Summary Text → Tables/Charts → Follow-up Questions ===== */}
                    {/* Extract chart from raw.content[] if chartSpec is null */}
                    {(() => {
                      if (!finalAnswer) return null;

                      // Extract chart from raw if chartSpec is null
                      const extractedChart = extractChartFromRaw(finalAnswer);
                      const displayChartSpec = finalAnswer.chartSpec || extractedChart;

                      // Debug: Log streaming finalAnswer data
                      console.log('[ChatApp] Streaming finalAnswer:', {
                        text: finalAnswer.text?.length,
                        table: finalAnswer.table ? { headers: finalAnswer.table.headers?.length, rows: finalAnswer.table.rows?.length } : null,
                        chartSpec: finalAnswer.chartSpec ? 'present' : null,
                        extractedChart: extractedChart ? 'present' : null,
                        displayChartSpec: displayChartSpec ? 'present' : null
                      });

                      if (!(finalAnswer.text || finalAnswer.table || displayChartSpec)) return null;

                      return (
                        <div className="final-answer-bubble">
                          {/* SUMMARY TEXT - Show EXACTLY what is being streamed, no modifications */}
                          {finalAnswer.text && finalAnswer.text.trim() && (
                            <div
                              className="answer-text-content"
                              style={{ display: 'block', visibility: 'visible' }}
                              onClick={(e) => {
                                // Handle clicks on links/buttons in markdown to prevent scroll to top
                                const target = e.target;
                                if (target.tagName === 'A' || target.closest('a')) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const link = target.tagName === 'A' ? target : target.closest('a');
                                  const questionText = link?.textContent?.trim();
                                  if (questionText && questionText.includes('?')) {
                                    handleSuggestedQuestionClick(questionText, e);
                                  }
                                }
                              }}
                            >
                              <ReactMarkdown
                                components={{
                                  a: ({ node, ...props }) => {
                                    const questionText = props.children?.toString() || '';
                                    if (questionText.includes('?') || questionText.length > 10) {
                                      return (
                                        <button
                                          type="button"
                                          className="suggested-question-btn"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleSuggestedQuestionClick(questionText, e);
                                          }}
                                          style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#3b82f6',
                                            textDecoration: 'underline',
                                            cursor: 'pointer',
                                            padding: 0,
                                            font: 'inherit'
                                          }}
                                        >
                                          {props.children}
                                        </button>
                                      );
                                    }
                                    return <a {...props} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} />;
                                  }
                                }}
                              >
                                {finalAnswer.text}
                              </ReactMarkdown>
                            </div>
                          )}

                          {/* TABLES AND CHARTS - Show only when valid table or chart data exists (can show during streaming) */}
                          {(hasValidTableData(finalAnswer.table) || hasValidChartData(displayChartSpec)) && (
                            <div className="answer-table-chart-section">
                              <EnhancedTableChart
                                tableData={finalAnswer.table || null}
                                chartSpec={displayChartSpec || null}
                                title={finalAnswer.table?.title || displayChartSpec?.title || null}
                                onExplore={openExplorePanel}
                              />
                            </div>
                          )}

                          {/* Interaction Buttons */}
                          {finalAnswer?.text && (
                            <div className="message-actions">
                              <Tooltip title="Copy">
                                <button
                                  className="action-btn"
                                  onClick={() => navigator.clipboard.writeText(finalAnswer.text)}
                                >
                                  <Copy size={16} />
                                </button>
                              </Tooltip>
                              <Tooltip title={conversationLikes[currentConversationId] ? "Remove like" : "Like"}>
                                <button
                                  className={`action-btn ${conversationLikes[currentConversationId] ? 'liked' : ''}`}
                                  onClick={() => handleLikeConversation(currentConversationId)}
                                >
                                  <ThumbsUp size={16} />
                                </button>
                              </Tooltip>
                              <Tooltip title={conversationUnlikes[currentConversationId] ? "Feedback provided" : "Provide feedback"}>
                                <button
                                  className={`action-btn ${conversationUnlikes[currentConversationId] ? 'unliked' : ''}`}
                                  onClick={() => handleOpenFeedbackModal(currentConversationId)}
                                >
                                  <ThumbsDown size={16} />
                                </button>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Scroll anchor for auto-scroll */}
                <div ref={messagesEndRef} />
              </div>
            </main>

            {/* Bottom Search Bar - Show when messages exist */}
            {messages.length > 0 && (
              <footer className="chat-footer">
                <form onSubmit={handleSubmit} className="new-chat-input-box bottom-input-box">
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept=".txt,.pdf,.doc,.docx,.csv,.xls,.xlsx,.json"
                  />

                  {/* Uploading Indicator with Progress */}
                  {isUploading && (
                    <div className="uploading-indicator">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="upload-progress-circle">
                          <svg className="progress-ring" width="32" height="32">
                            <circle
                              className="progress-ring-circle"
                              stroke="currentColor"
                              strokeWidth="3"
                              fill="transparent"
                              r="14"
                              cx="16"
                              cy="16"
                              style={{
                                strokeDasharray: `${2 * Math.PI * 14}`,
                                strokeDashoffset: `${2 * Math.PI * 14 * (1 - uploadProgress / 100)}`,
                                transition: 'stroke-dashoffset 0.3s'
                              }}
                            />
                          </svg>
                          <span className="progress-percentage">{uploadProgress}%</span>
                        </div>
                        <span>Uploading file...</span>
                      </div>
                    </div>
                  )}

                  {/* Uploaded Files Display */}
                  {uploadedFiles.length > 0 && (
                    <div className="uploaded-files-list">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="uploaded-file-item">
                          <File size={14} />
                          <span className="file-name">{file.filename}</span>
                          <button
                            type="button"
                            className="remove-file-btn"
                            onClick={() => removeFile(file.id)}
                            disabled={isUploading || streamState === 'streaming' || removingFileId === file.id}
                          >
                            {removingFileId === file.id ? (
                              <Loader2 size={12} className="spinning" />
                            ) : (
                              <X size={12} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Main Input Area */}
                  <div className="new-input-area">
                    <textarea
                      ref={textInputRef}
                      placeholder={
                        selectedAgentId && availableAgents.length > 0
                          ? `Ask ${availableAgents.find(a => a.id === selectedAgentId)?.name || 'Intelligence'}...`
                          : availableAgents.length > 0
                            ? `Ask ${availableAgents[0].name} Intelligence...`
                            : "Ask Intelligence..."
                      }
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        // Auto-resize textarea
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                      }}
                      onKeyDown={(e) => {
                        // Submit on Enter (without Shift) - only if not streaming
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (streamState !== 'streaming') {
                            handleSubmit(e);
                          }
                        }
                      }}
                      className="new-chat-input"
                      disabled={!sessionId}
                      rows={1}
                    />
                  </div>

                  {/* Bottom Actions */}
                  <div className="new-input-footer">
                    <div className="new-input-left">
                      <Tooltip title="Attach file">
                        <button
                          type="button"
                          className="new-icon-btn"
                          onClick={() => {
                            if (uploadedFiles.length > 0) {
                              message.info('Please remove the existing file first or create a new chat to upload another file.');
                              return;
                            }
                            fileInputRef.current?.click();
                          }}
                          disabled={streamState === 'streaming' || isUploading || !sessionId || uploadedFiles.length > 0}
                        >
                          <Paperclip size={18} />
                        </button>
                      </Tooltip>

                      {/* Agent Chip */}
                      {availableAgents.length > 0 && (
                        <div className="agent-chip-wrapper">
                          <Select
                            value={selectedAgentId || undefined}
                            onChange={(value) => setSelectedAgentId(value)}
                            className="agent-chip-select"
                            disabled={streamState === 'streaming'}
                            style={{ minWidth: 120 }}
                            placeholder="Select agent"
                          >
                            {availableAgents.map((agent) => (
                              <Select.Option key={agent.id} value={agent.id}>
                                {agent.name}
                              </Select.Option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="new-input-right">
                      <button
                        type="submit"
                        className="new-send-btn"
                        disabled={streamState === 'streaming' || !input.trim()}
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </form>
                {streamError && <div className="error-banner">{streamError}</div>}
              </footer>
            )}
          </div>

          {/* Explore Panel - Right Side Panel (part of layout) */}
          {explorePanel.isOpen && (
            <div className="explore-panel">
              {/* Header */}
              <div className="explore-panel-header">
                <h2 className="explore-panel-title">{explorePanel.title}</h2>
                <div className="explore-panel-actions">
                  {/* Only show download button if table data is available */}
                  {hasValidTableData(explorePanel.tableData) && (
                    <Tooltip title="Download CSV">
                      <button
                        className="explore-action-btn"
                        onClick={() => {
                          if (!explorePanel.tableData?.headers || !explorePanel.tableData?.rows) return;
                          const headers = explorePanel.tableData.headers.join(',');
                          const rows = explorePanel.tableData.rows.map(row =>
                            row.map(cell => {
                              const cellStr = String(cell || '');
                              if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                                return `"${cellStr.replace(/"/g, '""')}"`;
                              }
                              return cellStr;
                            }).join(',')
                          ).join('\n');
                          const csvContent = `${headers}\n${rows}`;
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          const url = URL.createObjectURL(blob);
                          link.setAttribute('href', url);
                          link.setAttribute('download', `${(explorePanel.title || 'data').replace(/[^a-z0-9]/gi, '_')}.csv`);
                          link.style.visibility = 'hidden';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        <Download size={18} />
                      </button>
                    </Tooltip>
                  )}
                  {/* Only show copy button if table data is available */}
                  {hasValidTableData(explorePanel.tableData) && (
                    <Tooltip title="Copy to clipboard">
                      <button
                        className="explore-action-btn"
                        onClick={() => {
                          if (!explorePanel.tableData?.headers || !explorePanel.tableData?.rows) return;
                          const text = [
                            explorePanel.tableData.headers.join('\t'),
                            ...explorePanel.tableData.rows.map(row => row.join('\t'))
                          ].join('\n');
                          navigator.clipboard.writeText(text);
                          message.success('Copied to clipboard');
                        }}
                      >
                        <Copy size={18} />
                      </button>
                    </Tooltip>
                  )}
                  <button className="explore-close-btn" onClick={closeExplorePanel}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="explore-panel-content">
                {/* Chart Section */}
                <div className="explore-chart-section">
                  <div className="explore-chart-header">
                    <Select
                      className="explore-chart-type-select"
                      value={exploreChartType}
                      onChange={(value) => setExploreChartType(value)}
                      style={{ minWidth: 150 }}
                    >
                      <Select.Option value="bar">Bar chart</Select.Option>
                      <Select.Option value="line">Line chart</Select.Option>
                      <Select.Option value="pie">Pie chart</Select.Option>
                    </Select>
                  </div>
                  <div className="explore-chart-container">
                    <ChartComponent
                      chartSpec={explorePanel.chartSpec}
                      tableData={explorePanel.tableData}
                      chartType={exploreChartType}
                    />
                  </div>
                </div>

                {/* Table Section - Only show if table data is available */}
                {hasValidTableData(explorePanel.tableData) && (
                  <div className="explore-table-section">
                    <div className="explore-table-header">
                      <span className="explore-table-label">Table</span>
                    </div>
                    <div className="explore-table-content">
                      {explorePanel.tableData?.headers && (
                        <div className="explore-table-wrapper">
                          <table className="explore-table">
                            <thead>
                              <tr>
                                {explorePanel.tableData.headers.map((header, idx) => (
                                  <th key={idx}>{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {explorePanel.tableData.rows?.map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  {row.map((cell, cellIdx) => (
                                    <td key={cellIdx}>{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div >

      {/* Delete Confirmation Dialog */}
      {
        deleteDialog.show && (
          <div className="dialog-overlay" onClick={closeDeleteDialog}>
            <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
              <h3 className="dialog-title">Delete Conversation</h3>
              <p className="dialog-message">Are you sure you want to delete this conversation? This action cannot be undone.</p>
              <div className="dialog-actions">
                <button className="dialog-btn dialog-btn-cancel" onClick={closeDeleteDialog}>
                  Cancel
                </button>
                <button className="dialog-btn dialog-btn-confirm" onClick={confirmDeleteConversation}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Create Project Modal */}
      <Modal
        open={showProjectModal}
        title="Create New Project"
        onCancel={() => {
          setShowProjectModal(false);
          projectForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={projectForm}
          layout="vertical"
          onFinish={async (values) => {
            setCreatingProject(true);
            try {
              const data = await apiCall('/api/projects', {
                method: 'POST',
                body: JSON.stringify({
                  name: values.name.trim(),
                  description: values.description?.trim() || '',
                }),
              });
              if (data && data.project) {
                // Add new project to list immediately without reloading
                // Ensure conversationsCount is set (default to 0 for new project)
                const newProject = {
                  ...data.project,
                  conversationsCount: data.project.conversationsCount || 0
                };
                setSidebarProjects(prev => [newProject, ...prev]);
                setShowProjectModal(false);
                projectForm.resetFields();
                message.success('Project created successfully!');
              }
            } catch (err) {
              message.error(`Error: ${err.message}`);
            } finally {
              setCreatingProject(false);
            }
          }}
          autoComplete="off"
        >
          <Form.Item
            label="Project Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter project name' },
              { whitespace: true, message: 'Project name cannot be empty' }
            ]}
          >
            <Input placeholder="Enter project name" />
          </Form.Item>
          <Form.Item
            label="Description"
            name="description"
          >
            <TextArea
              rows={4}
              placeholder="Enter project description (optional)"
            />
          </Form.Item>
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                onClick={() => {
                  setShowProjectModal(false);
                  projectForm.resetFields();
                }}
                disabled={creatingProject}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={creatingProject}
              >
                Create Project
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        open={!!editingProject}
        title="Edit Project"
        onCancel={cancelProjectEdit}
        footer={null}
      >
        <Form
          form={editProjectForm}
          layout="vertical"
          onFinish={handleProjectUpdate}
          autoComplete="off"
        >
          <Form.Item
            label="Project Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter project name' },
              { whitespace: true, message: 'Project name cannot be empty' }
            ]}
          >
            <Input placeholder="Enter project name" />
          </Form.Item>
          <Form.Item
            label="Description"
            name="description"
          >
            <TextArea
              rows={4}
              placeholder="Enter project description (optional)"
            />
          </Form.Item>
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                onClick={cancelProjectEdit}
                disabled={savingProject}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={savingProject}
              >
                Save
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Feedback Modal */}
      <Modal
        title="Provide Feedback"
        open={showFeedbackModal}
        onCancel={() => {
          setShowFeedbackModal(false);
          setFeedbackText('');
          setFeedbackConversationId(null);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setShowFeedbackModal(false);
              setFeedbackText('');
              setFeedbackConversationId(null);
            }}
          >
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submittingFeedback}
            onClick={handleSubmitFeedback}
            disabled={!feedbackText.trim()}
          >
            Submit Feedback
          </Button>
        ]}
      >
        <div style={{ marginBottom: '16px' }}>
          <p>Your feedback helps us improve. Please share your thoughts about this conversation.</p>
        </div>
        <TextArea
          rows={6}
          placeholder="Enter your feedback here..."
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          maxLength={2000}
          showCount
        />
      </Modal>

    </div >
  );
}

