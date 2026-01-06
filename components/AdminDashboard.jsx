'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from 'antd';
import Reports from '@/components/Reports';

const AdminDashboard = () => {
  const router = useRouter();

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <div className="admin-header-content">
          <Button
            type="text"
            icon={<ArrowLeft size={18} />}
            onClick={() => router.push('/')}
            className="back-button"
          >
            Back to Chat
          </Button>
          <h1>Admin Dashboard</h1>
        </div>
      </div>
      <div className="admin-content">
        <Reports />
      </div>
    </div>
  );
};

export default AdminDashboard;

