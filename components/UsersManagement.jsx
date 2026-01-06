'use client';

import React, { useState, useEffect } from 'react';
import { apiCall } from '@/utils/api';
import { Edit2, Trash2, Plus } from 'lucide-react';
import { Modal, Form, Input, Button, Select, Switch, message, Skeleton, Table } from 'antd';
const { TextArea } = Input;

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/api/admin/users?limit=100&offset=0');
      if (data) {
        setUsers(data.users || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (user) => {
    setEditingUser(user);
    form.setFieldsValue({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      companyName: user.companyName || '',
      address: user.address || '',
      phone: user.phone || '',
      role: user.role,
      enableGoogleLogin: user.enableGoogleLogin !== false,
    });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    form.resetFields();
  };

  const handleCreate = async (values) => {
    setSaving(true);
    try {
      console.log('[UsersManagement] Creating user:', values);
      const data = await apiCall('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim(),
          companyName: values.companyName.trim(),
          address: values.address?.trim() || null,
          phone: values.phone.trim(),
          enableGoogleLogin: values.enableGoogleLogin !== false,
          role: values.role || 'USER',
        }),
      });
      console.log('[UsersManagement] Create response:', data);
      if (data && data.user) {
        setUsers([data.user, ...users]);
        createForm.resetFields();
        setShowCreateModal(false);
        message.success('User created successfully!');
        // Refresh the list
        setTimeout(() => loadUsers(), 500);
      } else {
        throw new Error(data?.error || 'Failed to create user');
      }
    } catch (err) {
      console.error('[UsersManagement] Create error:', err);
      message.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const cancelCreate = () => {
    setShowCreateModal(false);
    createForm.resetFields();
  };

  const saveUser = async (values) => {
    if (!editingUser) return;

    setSaving(true);
    try {
      console.log('[UsersManagement] Updating user:', editingUser.id, values);
      const data = await apiCall(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: values.firstName?.trim() || null,
          lastName: values.lastName?.trim() || null,
          companyName: values.companyName?.trim() || null,
          address: values.address?.trim() || null,
          phone: values.phone?.trim() || null,
          role: values.role,
          enableGoogleLogin: values.enableGoogleLogin !== false,
        }),
      });
      console.log('[UsersManagement] Update response:', data);
      if (data && data.user) {
        setUsers(users.map(u => u.id === editingUser.id ? data.user : u));
        setEditingUser(null);
        form.resetFields();
        message.success('User updated successfully!');
        // Refresh the list to ensure data is up to date
        setTimeout(() => loadUsers(), 500);
      } else {
        throw new Error(data?.error || 'Failed to update user');
      }
    } catch (err) {
      console.error('[UsersManagement] Update error:', err);
      message.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId) => {
    Modal.confirm({
      title: 'Delete User',
      content: 'Are you sure you want to delete this user? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          console.log('[UsersManagement] Deleting user:', userId);
          const response = await apiCall(`/api/admin/users/${userId}`, {
            method: 'DELETE',
          });
          console.log('[UsersManagement] Delete response:', response);
          if (response && (response.success || response.message)) {
            setUsers(users.filter(u => u.id !== userId));
            message.success('User deleted successfully!');
          } else {
            throw new Error(response?.error || 'Failed to delete user');
          }
        } catch (err) {
          console.error('[UsersManagement] Delete error:', err);
          message.error(`Error: ${err.message}`);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="users-management">
        <div className="section-header">
          <Skeleton.Input active size="large" style={{ width: 200, height: 32 }} />
          <Skeleton.Button active size="small" style={{ width: 80 }} />
        </div>
        <div className="users-table-container">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Error: {error}</p>
        <button onClick={loadUsers} className="btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="users-management">
      <div className="section-header">
        <h2>All Users ({users.length})</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Add User
          </button>
          <button onClick={loadUsers} className="btn-secondary">Refresh</button>
        </div>
      </div>
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>
                  <div className="user-info">
                    {user.picture && (
                      <img src={user.picture} alt={user.name} className="user-avatar" />
                    )}
                    <span>{user.name}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role.toLowerCase()}`}>
                    {user.role}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => startEdit(user)}
                      className="btn-icon btn-edit"
                      title="Edit"
                      type="button"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="btn-icon btn-delete"
                      title="Delete"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit User Modal */}
      <Modal
        open={!!editingUser}
        title="Edit User"
        onCancel={cancelEdit}
        footer={null}
      >
        {editingUser && (
          <Form
            form={form}
            layout="vertical"
            onFinish={saveUser}
            autoComplete="off"
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Form.Item
                label="First Name"
                name="firstName"
                rules={[
                  { whitespace: true, message: 'First name cannot be empty' }
                ]}
              >
                <Input placeholder="Enter first name" />
              </Form.Item>
              <Form.Item
                label="Last Name"
                name="lastName"
                rules={[
                  { whitespace: true, message: 'Last name cannot be empty' }
                ]}
              >
                <Input placeholder="Enter last name" />
              </Form.Item>
            </div>
            <Form.Item
              label="Email"
            >
              <Input
                value={editingUser.email}
                disabled
              />
              <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                Email cannot be changed
              </small>
            </Form.Item>
            <Form.Item
              label="Company Name"
              name="companyName"
              rules={[
                { whitespace: true, message: 'Company name cannot be empty' }
              ]}
            >
              <Input placeholder="Enter company name" />
            </Form.Item>
            <Form.Item
              label="Phone"
              name="phone"
              rules={[
                { whitespace: true, message: 'Phone number cannot be empty' }
              ]}
            >
              <Input placeholder="Enter phone number (e.g., +1-555-123-4567)" />
            </Form.Item>
            <Form.Item
              label="Address"
              name="address"
            >
              <TextArea
                rows={2}
                placeholder="Enter address (optional)"
              />
            </Form.Item>
            <Form.Item
              label="Role"
              name="role"
              rules={[{ required: true, message: 'Please select a role' }]}
            >
              <Select placeholder="Select role">
                <Select.Option value="USER">User</Select.Option>
                <Select.Option value="ADMIN">ADMIN</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              label="Enable Google Login"
              name="enableGoogleLogin"
              valuePropName="checked"
            >
              <Switch
                checkedChildren="Enabled"
                unCheckedChildren="Disabled"
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
        )}
      </Modal>

      {/* Create User Modal */}
      <Modal
        open={showCreateModal}
        title="Create New User"
        onCancel={cancelCreate}
        footer={null}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          autoComplete="off"
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              label="First Name"
              name="firstName"
              rules={[
                { required: true, message: 'First name is required' },
                { whitespace: true, message: 'First name cannot be empty' }
              ]}
            >
              <Input placeholder="Enter first name" />
            </Form.Item>
            <Form.Item
              label="Last Name"
              name="lastName"
              rules={[
                { required: true, message: 'Last name is required' },
                { whitespace: true, message: 'Last name cannot be empty' }
              ]}
            >
              <Input placeholder="Enter last name" />
            </Form.Item>
          </div>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Please enter a valid email' }
            ]}
          >
            <Input placeholder="Enter email address" type="email" />
          </Form.Item>
          <Form.Item
            label="Company Name"
            name="companyName"
            rules={[
              { required: true, message: 'Company name is required' },
              { whitespace: true, message: 'Company name cannot be empty' }
            ]}
          >
            <Input placeholder="Enter company name" />
          </Form.Item>
          <Form.Item
            label="Phone"
            name="phone"
            rules={[
              { required: true, message: 'Phone number is required' },
              { whitespace: true, message: 'Phone number cannot be empty' }
            ]}
          >
            <Input placeholder="Enter phone number (e.g., +1-555-123-4567)" />
          </Form.Item>
          <Form.Item
            label="Address"
            name="address"
          >
            <TextArea
              rows={2}
              placeholder="Enter address (optional)"
            />
          </Form.Item>
          <Form.Item
            label="Role"
            name="role"
            initialValue="USER"
            rules={[{ required: true, message: 'Please select a role' }]}
          >
            <Select placeholder="Select role">
              <Select.Option value="USER">User</Select.Option>
              <Select.Option value="ADMIN">Admin</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Enable Google Login"
            name="enableGoogleLogin"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch
              checkedChildren="Enabled"
              unCheckedChildren="Disabled"
            />
          </Form.Item>
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                onClick={cancelCreate}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Create User
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersManagement;

