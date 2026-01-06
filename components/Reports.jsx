'use client';

import React, { useState, useEffect } from 'react';
import { apiCall } from '@/utils/api';
import { Users, MessageSquare, FolderKanban, TrendingUp, Clock, Calendar, Plus, Edit2, Trash2 } from 'lucide-react';
import { Modal, Form, Input, Button, Select, Switch, message, Skeleton } from 'antd';
const { TextArea } = Input;

const Reports = () => {
    const [reports, setReports] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [error, setError] = useState(null);
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [creatingUser, setCreatingUser] = useState(false);
    const [createUserForm] = Form.useForm();
    const [editingUser, setEditingUser] = useState(null);
    const [editUserForm] = Form.useForm();
    const [savingUser, setSavingUser] = useState(false);

    useEffect(() => {
        loadReports();
        loadAllUsers();
    }, []);

    const loadReports = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await apiCall('/api/reports/summary');
            if (data) {
                setReports(data);
            }
        } catch (err) {
            setError(err.message || 'Failed to load reports');
        } finally {
            setLoading(false);
        }
    };

    const loadAllUsers = async () => {
        try {
            setLoadingUsers(true);
            const data = await apiCall('/api/reports/users');
            if (data && data.users) {
                setAllUsers(data.users);
            }
        } catch (err) {
            console.error('Failed to load all users:', err);
        } finally {
            setLoadingUsers(false);
        }
    };

    const startEditUser = (user) => {
        setEditingUser(user);
        editUserForm.setFieldsValue({
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            companyName: user.companyName || '',
            address: user.address || '',
            phone: user.phone || '',
            role: user.role,
            enableGoogleLogin: user.enableGoogleLogin !== false,
        });
    };

    const cancelEditUser = () => {
        setEditingUser(null);
        editUserForm.resetFields();
    };

    const saveUser = async (values) => {
        if (!editingUser) return;

        setSavingUser(true);
        try {
            const data = await apiCall(`/admin/users/${editingUser.id}`, {
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
            if (data && data.user) {
                setAllUsers(allUsers.map(u => u.id === editingUser.id ? data.user : u));
                setEditingUser(null);
                editUserForm.resetFields();
                message.success('User updated successfully');
                loadAllUsers(); // Refresh list
            }
        } catch (err) {
            message.error(`Error: ${err.message}`);
        } finally {
            setSavingUser(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        Modal.confirm({
            title: 'Delete User',
            content: 'Are you sure you want to delete this user? This action cannot be undone.',
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    await apiCall(`/admin/users/${userId}`, {
                        method: 'DELETE',
                    });
                    setAllUsers(allUsers.filter(u => u.id !== userId));
                    message.success('User deleted successfully!');
                    loadAllUsers(); // Refresh list
                } catch (err) {
                    message.error(`Error: ${err.message}`);
                }
            },
        });
    };

    if (loading) {
        return (
            <div className="reports-container">
                <div className="reports-header">
                    <Skeleton.Input active size="large" style={{ width: 200, height: 32 }} />
                    <Skeleton.Button active size="small" style={{ width: 80 }} />
                </div>
                <div className="reports-summary-grid">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="summary-card">
                            <Skeleton active paragraph={{ rows: 3 }} />
                        </div>
                    ))}
                </div>
                <div className="reports-section">
                    <Skeleton active paragraph={{ rows: 8 }} />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-state">
                <p>Error: {error}</p>
                <button onClick={loadReports} className="btn-primary">Retry</button>
            </div>
        );
    }

    if (!reports) {
        return <div className="error-state">No reports data available</div>;
    }

    const { summary, userActivity, conversationActivity, projectActivity } = reports;

    return (
        <div className="reports-container">
            <div className="reports-header">
                <h2>System Reports</h2>
                <div className="reports-header-actions">
                    <Button onClick={loadReports}>
                        Refresh
                    </Button>
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={() => setShowCreateUserModal(true)}
                    >
                        Create User
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="reports-summary-grid">
                {/* Users Summary */}
                <div className="summary-card">
                    <div className="summary-card-header">
                        <Users size={24} className="icon-blue" />
                        <h3>Users</h3>
                    </div>
                    <div className="summary-card-content">
                        <div className="summary-stat">
                            <span className="stat-label">Total Users</span>
                            <span className="stat-value">{summary.users.total}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Admins</span>
                            <span className="stat-value">{summary.users.admins}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Regular Users</span>
                            <span className="stat-value">{summary.users.regularUsers}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Active Users</span>
                            <span className="stat-value">{summary.users.activeUsers}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Users with Conversations</span>
                            <span className="stat-value">{summary.users.usersWithConversations}</span>
                        </div>
                    </div>
                </div>

                {/* Conversations Summary */}
                <div className="summary-card">
                    <div className="summary-card-header">
                        <MessageSquare size={24} className="icon-purple" />
                        <h3>Conversations</h3>
                    </div>
                    <div className="summary-card-content">
                        <div className="summary-stat">
                            <span className="stat-label">Total Conversations</span>
                            <span className="stat-value">{summary.conversations.total}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Unique Users</span>
                            <span className="stat-value">{summary.conversations.uniqueUsers}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Project Conversations</span>
                            <span className="stat-value">{summary.conversations.projectConversations}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Global Conversations</span>
                            <span className="stat-value">{summary.conversations.globalConversations}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Projects with Conversations</span>
                            <span className="stat-value">{summary.conversations.projectsWithConversations}</span>
                        </div>
                    </div>
                </div>

                {/* Projects Summary */}
                <div className="summary-card">
                    <div className="summary-card-header">
                        <FolderKanban size={24} className="icon-green" />
                        <h3>Projects</h3>
                    </div>
                    <div className="summary-card-content">
                        <div className="summary-stat">
                            <span className="stat-label">Total Projects</span>
                            <span className="stat-value">{summary.projects.total}</span>
                        </div>
                        <div className="summary-stat">
                            <span className="stat-label">Unique Creators</span>
                            <span className="stat-value">{summary.projects.uniqueCreators}</span>
                        </div>
                        {summary.projects.firstProjectCreated && (
                            <div className="summary-stat">
                                <span className="stat-label">First Project</span>
                                <span className="stat-value-small">
                                    {new Date(summary.projects.firstProjectCreated).toLocaleDateString()}
                                </span>
                            </div>
                        )}
                        {summary.projects.latestProjectCreated && (
                            <div className="summary-stat">
                                <span className="stat-label">Latest Project</span>
                                <span className="stat-value-small">
                                    {new Date(summary.projects.latestProjectCreated).toLocaleDateString()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* User Activity Table */}
            {userActivity && userActivity.length > 0 && (
                <div className="reports-section">
                    <h3 className="reports-section-title">
                        <TrendingUp size={20} className="icon-blue" />
                        User Activity
                    </h3>
                    <div className="reports-table-container">
                        <table className="reports-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Last Login</th>
                                    <th>Conversations</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userActivity.map(user => (
                                    <tr key={user.id}>
                                        <td>{user.name}</td>
                                        <td>{user.email}</td>
                                        <td>
                                            <span className={`role-badge ${user.role.toLowerCase()}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td>
                                            {user.lastLogin ? (
                                                <span className="date-value">
                                                    {new Date(user.lastLogin).toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted">Never</span>
                                            )}
                                        </td>
                                        <td>{user.conversationCount || 0}</td>
                                        <td>
                                            <span className="date-value">
                                                {new Date(user.createdAt).toLocaleDateString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* All Users Table */}
            <div className="reports-section">
                <div className="reports-section-header">
                    <h3 className="reports-section-title">
                        <Users size={20} className="icon-blue" />
                        All Users ({allUsers.length})
                    </h3>
                    <Button onClick={loadAllUsers} size="small">
                        Refresh
                    </Button>
                </div>
                {loadingUsers ? (
                    <div className="reports-table-container">
                        <Skeleton active paragraph={{ rows: 10 }} />
                    </div>
                ) : allUsers.length > 0 ? (
                    <div className="reports-table-container">
                        <table className="reports-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Last Login</th>
                                    <th>Conversations</th>
                                    <th>Projects Used</th>
                                    <th>Last Conversation</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allUsers.map(user => (
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
                                        <td>
                                            {user.lastLogin ? (
                                                <span className="date-value">
                                                    {new Date(user.lastLogin).toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted">Never</span>
                                            )}
                                        </td>
                                        <td>{user.conversationCount || 0}</td>
                                        <td>{user.projectsUsed || 0}</td>
                                        <td>
                                            {user.lastConversationCreated ? (
                                                <span className="date-value">
                                                    {new Date(user.lastConversationCreated).toLocaleDateString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted">None</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="date-value">
                                                {new Date(user.createdAt).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button
                                                    onClick={() => startEditUser(user)}
                                                    className="btn-icon btn-edit"
                                                    title="Edit"
                                                    type="button"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user.id)}
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
                ) : (
                    <div className="empty-state">
                        <p>No users found</p>
                    </div>
                )}
            </div>

            {/* Edit User Modal */}
            <Modal
                open={!!editingUser}
                title="Edit User"
                onCancel={cancelEditUser}
                footer={null}
                width={600}
            >
                {editingUser && (
                    <Form
                        form={editUserForm}
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
                            <Input.TextArea
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
                                    onClick={cancelEditUser}
                                    disabled={savingUser}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={savingUser}
                                >
                                    Save
                                </Button>
                            </div>
                        </Form.Item>
                    </Form>
                )}
            </Modal>

            {/* Project Activity Table */}
            {projectActivity && projectActivity.length > 0 && (
                <div className="reports-section">
                    <h3 className="reports-section-title">
                        <FolderKanban size={20} className="icon-green" />
                        Project Activity
                    </h3>
                    <div className="reports-table-container">
                        <table className="reports-table">
                            <thead>
                                <tr>
                                    <th>Project Name</th>
                                    <th>Creator</th>
                                    <th>Conversations</th>
                                    <th>Unique Users</th>
                                    <th>Last Activity</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projectActivity.map(project => (
                                    <tr key={project.id}>
                                        <td>
                                            <div className="project-name-cell">
                                                <strong>{project.name}</strong>
                                                {project.description && (
                                                    <small className="project-description-text">{project.description}</small>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <div>{project.creatorName}</div>
                                                <small className="text-muted">{project.creatorEmail}</small>
                                            </div>
                                        </td>
                                        <td>{project.conversationCount || 0}</td>
                                        <td>{project.uniqueUsers || 0}</td>
                                        <td>
                                            {project.lastConversationCreated ? (
                                                <span className="date-value">
                                                    {new Date(project.lastConversationCreated).toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted">No activity</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="date-value">
                                                {new Date(project.createdAt).toLocaleDateString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create User Modal */}
            <Modal
                open={showCreateUserModal}
                title="Create New User"
                onCancel={() => {
                    setShowCreateUserModal(false);
                    createUserForm.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={createUserForm}
                    layout="vertical"
                    onFinish={async (values) => {
                        setCreatingUser(true);
                        try {
                            const data = await apiCall('/admin/users', {
                                method: 'POST',
                                body: JSON.stringify({
                                    firstName: values.firstName.trim(),
                                    lastName: values.lastName.trim(),
                                    email: values.email.trim(),
                                    companyName: values.companyName.trim(),
                                    address: values.address?.trim() || null,
                                    phone: values.phone.trim(),
                                    role: values.role,
                                    enableGoogleLogin: values.enableGoogleLogin !== false,
                                }),
                            });
                            if (data && data.user) {
                                setShowCreateUserModal(false);
                                createUserForm.resetFields();
                                message.success('User created successfully!');
                                // Refresh users list
                                loadAllUsers();
                                // Refresh reports
                                loadReports();
                            }
                        } catch (err) {
                            message.error(`Error: ${err.message}`);
                        } finally {
                            setCreatingUser(false);
                        }
                    }}
                    autoComplete="off"
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Form.Item
                            label="First Name"
                            name="firstName"
                            rules={[
                                { required: true, message: 'Please enter first name' },
                                { whitespace: true, message: 'First name cannot be empty' }
                            ]}
                        >
                            <Input placeholder="Enter first name" />
                        </Form.Item>
                        <Form.Item
                            label="Last Name"
                            name="lastName"
                            rules={[
                                { required: true, message: 'Please enter last name' },
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
                            { required: true, message: 'Please enter email' },
                            { type: 'email', message: 'Please enter a valid email' }
                        ]}
                    >
                        <Input type="email" placeholder="Enter email address" />
                    </Form.Item>
                    <Form.Item
                        label="Company Name"
                        name="companyName"
                        rules={[
                            { required: true, message: 'Please enter company name' },
                            { whitespace: true, message: 'Company name cannot be empty' }
                        ]}
                    >
                        <Input placeholder="Enter company name" />
                    </Form.Item>
                    <Form.Item
                        label="Phone"
                        name="phone"
                        rules={[
                            { required: true, message: 'Please enter phone number' },
                            { whitespace: true, message: 'Phone number cannot be empty' }
                        ]}
                    >
                        <Input placeholder="Enter phone number (e.g., +1-555-123-4567)" />
                    </Form.Item>
                    <Form.Item
                        label="Address"
                        name="address"
                    >
                        <Input.TextArea
                            rows={2}
                            placeholder="Enter address (optional)"
                        />
                    </Form.Item>
                    <Form.Item
                        label="Role"
                        name="role"
                        rules={[
                            { required: true, message: 'Please select a role' }
                        ]}
                    >
                        <Select placeholder="Select role">
                            <Select.Option value="ADMIN">ADMIN</Select.Option>
                            <Select.Option value="USER">User</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Enable Google Login"
                        name="enableGoogleLogin"
                        valuePropName="checked"
                        initialValue={true}
                        rules={[
                            { required: true, message: 'Please specify Google login status' }
                        ]}
                    >
                        <Switch
                            checkedChildren="Enabled"
                            unCheckedChildren="Disabled"
                        />
                    </Form.Item>
                    <Form.Item>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <Button
                                onClick={() => {
                                    setShowCreateUserModal(false);
                                    createUserForm.resetFields();
                                }}
                                disabled={creatingUser}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={creatingUser}
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

export default Reports;

