'use client';

import { useState, useEffect } from 'react';

type ConnectionType = 'IMAP' | 'POP3' | 'GMAIL_API' | 'OUTLOOK_API';

interface EmailConfig {
  id?: string;
  emailAddress: string;
  connectionType: ConnectionType;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  token?: string;
  isActive?: boolean;
  attachments?: PDFAttachment[];
  lastChecked?: Date;
}

interface PDFAttachment {
  id: string;
  fromAddress: string;
  dateReceived: string;
  subject: string;
  fileName: string;
  localPath: string;
}

interface EmailCheckStatus {
  configId: string;
  status: 'checking' | 'success' | 'error';
  lastChecked?: Date;
  message?: string;
}

export default function EmailConfigPage() {
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [currentConfig, setCurrentConfig] = useState<EmailConfig>({
    emailAddress: '',
    connectionType: 'IMAP',
    host: 'imap.example.com',
    port: 993,
    isActive: true,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [checkStatuses, setCheckStatuses] = useState<Record<string, EmailCheckStatus>>({});
  
  useEffect(() => {
    fetchConfigs();
    // Set up periodic email checking
    const checkInterval = setInterval(checkAllEmailsForPDFs, 300000); // Check every 5 minutes
    return () => clearInterval(checkInterval);
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/email-ingestion/configs');
      const data = await response.json();
      setConfigs(data);
    } catch (error) {
      console.error('Error fetching configs:', error);
    }
  };

  const checkAllEmailsForPDFs = async () => {
    for (const config of configs) {
      if (config.id && config.isActive) {
        await checkEmailForPDFs(config.id);
      }
    }
  };

  const checkEmailForPDFs = async (configId: string) => {
    setCheckStatuses(prev => ({
      ...prev,
      [configId]: { configId, status: 'checking' }
    }));

    try {
      const response = await fetch(`/api/email-ingestion/check/${configId}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      setCheckStatuses(prev => ({
        ...prev,
        [configId]: {
          configId,
          status: 'success',
          lastChecked: new Date(),
          message: `Found ${data.newAttachments} new PDF(s)`
        }
      }));

      // Refresh configs to get updated attachment list
      fetchConfigs();
    } catch (error) {
      setCheckStatuses(prev => ({
        ...prev,
        [configId]: {
          configId,
          status: 'error',
          message: 'Failed to check emails'
        }
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = isEditing
      ? `/api/email-ingestion/configs/${currentConfig.id}`
      : '/api/email-ingestion/configs';

    const method = isEditing ? 'PUT' : 'POST';

    try {
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentConfig),
      });

      setCurrentConfig({
        emailAddress: '',
        connectionType: 'IMAP',
        host: 'imap.example.com',
        port: 993,
        isActive: true,
      });
      setIsEditing(false);
      fetchConfigs();
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this configuration?')) {
      try {
        await fetch(`/api/email-ingestion/configs/${id}`, { method: 'DELETE' });
        fetchConfigs();
      } catch (error) {
        console.error('Error deleting config:', error);
      }
    }
  };

  const handleEdit = (config: EmailConfig) => {
    setCurrentConfig(config);
    setIsEditing(true);
  };

  const getStatusBadgeColor = (status: EmailCheckStatus['status']) => {
    switch (status) {
      case 'checking': return 'bg-blue-100 text-blue-700';
      case 'success': return 'bg-green-100 text-green-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Email Configuration Dashboard</h1>
          <button
            onClick={checkAllEmailsForPDFs}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Check All Emails Now
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Form Card */}
          <div className="bg-white rounded shadow p-6 lg:col-span-1 h-fit">
            <h2 className="text-lg font-medium mb-4 text-gray-800">
              {isEditing ? 'Edit Configuration' : 'New Configuration'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={currentConfig.emailAddress}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, emailAddress: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connection Type
                </label>
                <select
                  value={currentConfig.connectionType}
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      connectionType: e.target.value as ConnectionType,
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="IMAP">IMAP</option>
                  <option value="POP3">POP3</option>
                  <option value="GMAIL_API">Gmail API</option>
                  <option value="OUTLOOK_API">Outlook API</option>
                </select>
              </div>

              {(currentConfig.connectionType === 'IMAP' || currentConfig.connectionType === 'POP3') && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={currentConfig.username ?? ''}
                        onChange={(e) =>
                          setCurrentConfig({ ...currentConfig, username: e.target.value })
                        }
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        value={currentConfig.password ?? ''}
                        onChange={(e) =>
                          setCurrentConfig({ ...currentConfig, password: e.target.value })
                        }
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Host
                      </label>
                      <input
                        type="text"
                        value={currentConfig.host ?? ''}
                        onChange={(e) =>
                          setCurrentConfig({ ...currentConfig, host: e.target.value })
                        }
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={currentConfig.port ?? ''}
                        onChange={(e) =>
                          setCurrentConfig({
                            ...currentConfig,
                            port: parseInt(e.target.value),
                          })
                        }
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {(currentConfig.connectionType === 'GMAIL_API' || currentConfig.connectionType === 'OUTLOOK_API') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OAuth Token
                  </label>
                  <input
                    type="password"
                    value={currentConfig.token ?? ''}
                    onChange={(e) =>
                      setCurrentConfig({ ...currentConfig, token: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex items-center">
                <input
                  id="active-config"
                  type="checkbox"
                  checked={currentConfig.isActive}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, isActive: e.target.checked })
                  }
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <label htmlFor="active-config" className="ml-2 text-sm text-gray-700">
                  Active Configuration
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentConfig({
                        emailAddress: '',
                        connectionType: 'IMAP',
                        host: 'imap.example.com',
                        port: 993,
                        isActive: true,
                      });
                      setIsEditing(false);
                    }}
                    className="px-3 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {isEditing ? 'Update' : 'Add Configuration'}
                </button>
              </div>
            </form>
          </div>

          {/* Existing Configurations Card */}
          <div className="bg-white rounded shadow p-6 lg:col-span-2">
            <h2 className="text-lg font-medium mb-4 text-gray-800">Existing Configurations</h2>
            
            {configs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded">
                No configurations added yet
              </div>
            ) : (
              <div className="space-y-4">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="border border-gray-200 rounded p-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
                      <div className="space-y-1 mb-2 md:mb-0">
                        <div className="flex flex-wrap gap-2 items-center">
                          <h3 className="font-medium text-gray-900">{config.emailAddress}</h3>
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {config.connectionType}
                          </span>
                          {config.isActive && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          Host: {config.host || 'N/A'} • Port: {config.port || 'N/A'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => config.id && checkEmailForPDFs(config.id)}
                          className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                        >
                          Check Now
                        </button>
                        <button
                          onClick={() => handleEdit(config)}
                          className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => config.id && handleDelete(config.id)}
                          className="px-2 py-1 text-xs font-medium bg-red-50 text-red-700 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {checkStatuses[config.id!] && (
                      <div className={`mb-3 px-2 py-1 text-xs font-medium rounded inline-block ${getStatusBadgeColor(checkStatuses[config.id!].status)}`}>
                        {checkStatuses[config.id!].status === 'checking' ? 'Checking emails...' : checkStatuses[config.id!].message}
                      </div>
                    )}

                    {config.attachments && config.attachments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">PDF Attachments</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {config.attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded"
                            >
                              <svg
                                className="w-4 h-4 mr-2 text-red-500 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                />
                              </svg>
                              <div className="truncate flex-1">
                                <span className="truncate block">{attachment.fileName}</span>
                                <span className="text-xs text-gray-500">
                                  ({formatDate(attachment.dateReceived)})
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}