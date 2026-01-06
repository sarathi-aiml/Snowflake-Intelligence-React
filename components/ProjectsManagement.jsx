'use client';

import React, { useState, useEffect } from 'react';
import { apiCall } from '@/utils/api';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { Modal, Form, Input, Button, message, Skeleton } from 'antd';
const { TextArea } = Input;

const ProjectsManagement = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/api/projects?limit=100&offset=0');
      if (data) {
        setProjects(data.projects || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values) => {
    setSaving(true);
    try {
      const data = await apiCall('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description?.trim() || '',
        }),
      });
      if (data && data.project) {
        setProjects([data.project, ...projects]);
        createForm.resetFields();
        setShowCreateModal(false);
        message.success('Project created successfully!');
      }
    } catch (err) {
      message.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (project) => {
    setEditingProject(project);
    editForm.setFieldsValue({
      name: project.name,
      description: project.description || '',
    });
  };

  const cancelEdit = () => {
    setEditingProject(null);
    editForm.resetFields();
  };

  const handleUpdate = async (values) => {
    if (!editingProject) return;

    setSaving(true);
    try {
      console.log('[ProjectsManagement] Updating project:', editingProject.id, values);
      const data = await apiCall(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description?.trim() || '',
        }),
      });
      console.log('[ProjectsManagement] Update response:', data);
      if (data && data.project) {
        setProjects(projects.map(p => p.id === editingProject.id ? data.project : p));
        setEditingProject(null);
        editForm.resetFields();
        message.success('Project updated successfully!');
        // Refresh the list
        setTimeout(() => loadProjects(), 500);
      } else {
        throw new Error(data?.error || 'Failed to update project');
      }
    } catch (err) {
      console.error('[ProjectsManagement] Update error:', err);
      message.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (projectId) => {
    Modal.confirm({
      title: 'Delete Project',
      content: 'Are you sure you want to delete this project? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          console.log('[ProjectsManagement] Deleting project:', projectId);
          const response = await apiCall(`/api/projects/${projectId}`, {
            method: 'DELETE',
          });
          console.log('[ProjectsManagement] Delete response:', response);
          if (response && (response.success || response.message)) {
            setProjects(projects.filter(p => p.id !== projectId));
            message.success('Project deleted successfully!');
          } else {
            throw new Error(response?.error || 'Failed to delete project');
          }
        } catch (err) {
          console.error('[ProjectsManagement] Delete error:', err);
          message.error(`Error: ${err.message}`);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="projects-management">
        <div className="section-header">
          <Skeleton.Input active size="large" style={{ width: 200, height: 32 }} />
          <div className="header-actions">
            <Skeleton.Button active size="small" style={{ width: 80 }} />
            <Skeleton.Button active size="small" style={{ width: 120 }} />
          </div>
        </div>
        <div className="projects-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="project-card">
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Error: {error}</p>
        <button onClick={loadProjects} className="btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="projects-management">
      <div className="section-header">
        <h2>Projects ({projects.length})</h2>
        <div className="header-actions">
          <button onClick={loadProjects} className="btn-secondary">Refresh</button>
          <button
            onClick={() => {
              createForm.resetFields();
              setShowCreateModal(true);
            }}
            className="btn-primary btn-with-icon"
          >
            <Plus size={18} className="icon-blue" />
            Create Project
          </button>
        </div>
      </div>

      {/* Create Project Modal */}
      <Modal
        open={showCreateModal}
        title="Create New Project"
        onCancel={() => {
          setShowCreateModal(false);
          createForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
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
                  setShowCreateModal(false);
                  createForm.resetFields();
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Create
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        open={!!editingProject}
        title="Edit Project"
        onCancel={cancelEdit}
        footer={null}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdate}
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
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Save
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <div className="projects-grid">
        {projects.map(project => (
          <div key={project.id} className="project-card">
            <div className="project-header">
              <h3>{project.name}</h3>
              <div className="project-actions">
                <button
                  onClick={() => startEdit(project)}
                  className="btn-icon btn-edit"
                  title="Edit"
                  type="button"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(project.id)}
                  className="btn-icon btn-delete"
                  title="Delete"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {project.description && (
              <p className="project-description">{project.description}</p>
            )}
            <div className="project-meta">
              <span>Conversations: {project.conversationsCount || 0}</span>
              <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectsManagement;

