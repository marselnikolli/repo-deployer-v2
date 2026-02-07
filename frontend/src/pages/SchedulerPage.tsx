import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Play, CheckCircle, AlertCircle, XCircle, Loader } from 'lucide-react';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';

interface Task {
  id: number;
  name: string;
  task_type: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
}

interface TaskStats {
  total_tasks: number;
  enabled_tasks: number;
  disabled_tasks: number;
  recent_runs_24h: number;
  successful_runs: number;
  failed_runs: number;
}

export function SchedulerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<number | null>(null);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean; title: string; message: string; itemCount: number; onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    itemCount: 0,
    onConfirm: () => {}
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    task_type: 'metadata_sync',
    schedule_type: 'interval',
    cron_expression: '0 0 * * *',
    interval_hours: 24,
    enabled: true
  });

  useEffect(() => {
    fetchTasks();
    fetchStats();
    const interval = setInterval(() => {
      fetchTasks();
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/scheduler/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/scheduler/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/scheduler/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSuccess('✓ Task created successfully');
        setFormData({
          name: '',
          description: '',
          task_type: 'metadata_sync',
          schedule_type: 'interval',
          cron_expression: '0 0 * * *',
          interval_hours: 24,
          enabled: true
        });
        setShowForm(false);
        fetchTasks();
        fetchStats();
      } else {
        const errData = await response.json();
        setError(errData.detail || 'Failed to create task');
      }
    } catch (err) {
      setError('Failed to create task');
    }
  };

  const handleToggleTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/scheduler/tasks/${taskId}/toggle`, {
        method: 'POST'
      });
      if (response.ok) {
        setSuccess('✓ Task toggled');
        fetchTasks();
      } else {
        setError('Failed to toggle task');
      }
    } catch (err) {
      setError('Error toggling task');
    }
  };

  const handleRunTask = async (taskId: number) => {
    try {
      setRunningTaskId(taskId);
      const response = await fetch(`/api/scheduler/tasks/${taskId}/run`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        setSuccess(`✓ Task executed: ${data.status}`);
        fetchTasks();
        fetchStats();
      } else {
        const errData = await response.json();
        setError(errData.detail || 'Failed to run task');
      }
    } catch (err) {
      setError('Error running task');
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    setDeleteModal({
      isOpen: true,
      title: 'Delete Scheduler Task',
      message: 'Are you sure you want to delete this scheduled task? This action cannot be undone.',
      itemCount: 1,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/scheduler/tasks/${taskId}`, {
            method: 'DELETE'
          });
          if (response.ok) {
            setSuccess('✓ Task deleted');
            fetchTasks();
            fetchStats();
            setDeleteModal(prev => ({...prev, isOpen: false}))
          } else {
            setError('Failed to delete task');
          }
        } catch (err) {
          setError('Error deleting task');
        }
      }
    });
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failure':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const taskTypeColors: Record<string, string> = {
    metadata_sync: 'bg-blue-100 text-blue-800',
    health_check: 'bg-green-100 text-green-800',
    stale_detection: 'bg-yellow-100 text-yellow-800',
    auto_pull: 'bg-purple-100 text-purple-800'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Clock className="w-8 h-8 text-blue-600" />
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">Task Scheduler</h2>
          <p className="text-sm text-gray-600">Automate repository maintenance and monitoring</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          New Task
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-2">Total Tasks</p>
            <p className="text-3xl font-bold text-gray-900">{stats.total_tasks}</p>
            <p className="text-xs text-gray-500 mt-2">{stats.enabled_tasks} enabled, {stats.disabled_tasks} disabled</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-2">Recent Runs (24h)</p>
            <p className="text-3xl font-bold text-gray-900">{stats.recent_runs_24h}</p>
            <p className="text-xs text-gray-500 mt-2">{stats.successful_runs} successful</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-2">Failed Runs</p>
            <p className={`text-3xl font-bold ${stats.failed_runs > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.failed_runs}
            </p>
            <p className="text-xs text-gray-500 mt-2">in last 24 hours</p>
          </div>
        </div>
      )}

      {/* Create Task Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Task</h3>
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="e.g., Daily Metadata Sync"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Type *</label>
                <select
                  value={formData.task_type}
                  onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="metadata_sync">Metadata Sync</option>
                  <option value="health_check">Health Check</option>
                  <option value="stale_detection">Stale Detection</option>
                  <option value="auto_pull">Auto Pull</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="Optional task description"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Type *</label>
                <select
                  value={formData.schedule_type}
                  onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="interval">Interval (hours)</option>
                  <option value="cron">Cron Expression</option>
                </select>
              </div>
              <div>
                {formData.schedule_type === 'interval' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Interval (hours)</label>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={formData.interval_hours}
                      onChange={(e) => setFormData({ ...formData, interval_hours: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cron Expression</label>
                    <input
                      type="text"
                      value={formData.cron_expression}
                      onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      placeholder="0 0 * * * (daily at midnight)"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                Enable immediately
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Create Task
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tasks List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Scheduled Tasks ({tasks.length})</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {tasks.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No scheduled tasks yet. Create one to get started!
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="p-6 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-900">{task.name}</h4>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          taskTypeColors[task.task_type] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {task.task_type.replace('_', ' ')}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          task.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {task.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.last_run_status && getStatusIcon(task.last_run_status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  {task.last_run && (
                    <div>
                      <p className="text-gray-600">Last Run</p>
                      <p className="text-gray-900 font-medium">
                        {new Date(task.last_run).toLocaleDateString()} {new Date(task.last_run).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                  {task.next_run && (
                    <div>
                      <p className="text-gray-600">Next Run</p>
                      <p className="text-gray-900 font-medium">
                        {new Date(task.next_run).toLocaleDateString()} {new Date(task.next_run).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                  {task.last_run_status && (
                    <div>
                      <p className="text-gray-600">Status</p>
                      <p className={`font-medium capitalize ${
                        task.last_run_status === 'success' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {task.last_run_status}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleRunTask(task.id)}
                    disabled={runningTaskId === task.id}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm rounded font-medium"
                  >
                    {runningTaskId === task.id ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Now
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleToggleTask(task.id)}
                    className={`px-3 py-2 text-sm rounded font-medium ${
                      task.enabled
                        ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
                        : 'bg-blue-100 hover:bg-blue-200 text-blue-800'
                    }`}
                  >
                    {task.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="flex items-center gap-2 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 text-sm rounded font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>

                {task.last_run_message && (
                  <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700 font-mono max-h-24 overflow-y-auto">
                    {task.last_run_message}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          isOpen={deleteModal.isOpen}
          title={deleteModal.title}
          message={deleteModal.message}
          itemCount={deleteModal.itemCount}
          onConfirm={deleteModal.onConfirm}
          onCancel={() => setDeleteModal(prev => ({...prev, isOpen: false}))}
        />
      </div>
    </div>
  );
}
