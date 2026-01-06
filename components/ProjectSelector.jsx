'use client';

import React, { useState, useEffect } from 'react';
import { apiCall } from '@/utils/api';
import { FolderKanban, Plus, Edit2, Trash2 } from 'lucide-react';
import { Select, Modal, Form, Input, Button, message } from 'antd';
const { TextArea } = Input;

const ProjectSelector = ({ selectedProjectId, onSelect, showGlobal = true, refreshTrigger, sessionId, conversationsCount }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalCount, setGlobalCount] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingProject, setEditingProject] = useState(null);

  // Fetch projects
  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiCall('/api/projects');
      if (data && data.projects) {
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      message.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  // Fetch global conversations count
  const fetchGlobalCount = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      // Use placeholder sessionId (API ignores it and filters by user_id/project_id only)
      // Add project_id=null to get only global conversations
      const placeholderSessionId = sessionId || 'all';
      const res = await fetch(`/api/conversations/${placeholderSessionId}?metadataOnly=true&project_id=null`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        // Count global conversations (project_id is null)
        const globalConversations = data.conversations || [];
        setGlobalCount(globalConversations.length);
      }
    } catch (error) {
      console.error('Failed to fetch global count:', error);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [refreshTrigger]);

  useEffect(() => {
    if (showGlobal) {
      fetchGlobalCount();
    }
  }, [showGlobal, refreshTrigger]); // Removed sessionId dependency - count is based on user_id only

  const handleCreate = async (values) => {
    try {
      await apiCall('/api/projects', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      message.success('Project created successfully');
      setIsModalOpen(false);
      form.resetFields();
      fetchProjects();
    } catch (error) {
      message.error('Failed to create project');
      console.error('Create project error:', error);
    }
  };

  const handleEdit = async (values) => {
    try {
      await apiCall(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values)
      });
      message.success('Project updated successfully');
      setIsModalOpen(false);
      setEditingProject(null);
      form.resetFields();
      fetchProjects();
    } catch (error) {
      message.error('Failed to update project');
      console.error('Update project error:', error);
    }
  };

  const handleDelete = async (projectId) => {
    try {
      await apiCall(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      message.success('Project deleted successfully');
      fetchProjects();
      // If deleted project was selected, select global
      if (selectedProjectId === projectId) {
        onSelect(null);
      }
    } catch (error) {
      message.error('Failed to delete project');
      console.error('Delete project error:', error);
    }
  };

  const openCreateModal = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    form.setFieldsValue({
      name: project.name,
      description: project.description || ''
    });
    setIsModalOpen(true);
  };

  const options = [
    ...(showGlobal ? [{
      value: null,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🌍 Global Conversations</span>
          <span style={{ fontSize: '12px', color: '#888' }}>{globalCount}</span>
        </div>
      )
    }] : []),
    ...projects.map(project => ({
      value: project.id,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderKanban size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>
              {project.conversationsCount || 0}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button
                type="text"
                size="small"
                icon={<Edit2 size={12} />}
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(project);
                }}
                style={{ padding: '2px 4px', minWidth: 'auto' }}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<Trash2 size={12} />}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
                    handleDelete(project.id);
                  }
                }}
                style={{ padding: '2px 4px', minWidth: 'auto' }}
              />
            </div>
          </div>
        </div>
      )
    }))
  ];

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <Select
        value={selectedProjectId}
        onChange={onSelect}
        placeholder="Select a project"
        style={{ flex: 1, minWidth: 200 }}
        loading={loading}
        options={options}
        optionLabelProp="label"
        dropdownRender={(menu) => (
          <>
            {menu}
            <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
              <Button
                type="dashed"
                onClick={openCreateModal}
                icon={<Plus size={14} />}
                block
                size="small"
              >
                Create Project
              </Button>
            </div>
          </>
        )}
      />
      
      <Modal
        title={editingProject ? 'Edit Project' : 'Create Project'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingProject(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingProject ? handleEdit : handleCreate}
        >
          <Form.Item
            name="name"
            label="Project Name"
            rules={[{ required: true, message: 'Please enter project name' }]}
          >
            <Input placeholder="Enter project name" />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea rows={3} placeholder="Enter project description (optional)" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingProject ? 'Update' : 'Create'} Project
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectSelector;
