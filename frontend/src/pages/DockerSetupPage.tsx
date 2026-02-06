import { useEffect, useState } from 'react';
import { Check, X, AlertCircle, Copy, CheckCircle, Loader } from 'lucide-react';

interface SystemInfo {
  os: string;
  arch: string;
  docker: {
    installed: boolean;
    version?: string;
  };
  docker_compose: {
    installed: boolean;
    version?: string;
  };
  ready: boolean;
}

export default function DockerSetupPage() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installCommands, setInstallCommands] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState(-1);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/docker/check-installation');
        if (!response.ok) throw new Error('Failed to fetch system info');
        const data = await response.json();
        setSystemInfo(data);

        // If not ready, fetch install commands
        if (!data.ready) {
          const cmdResponse = await fetch('http://localhost:8000/api/docker/install-commands');
          if (cmdResponse.ok) {
            const cmdData = await cmdResponse.json();
            setInstallCommands(cmdData);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch system info');
      } finally {
        setLoading(false);
      }
    };

    fetchSystemInfo();
  }, []);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(-1), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-primary)] to-[var(--color-bg-secondary)] flex items-center justify-center p-4">
        <div className="text-center">
          <Loader className="w-12 h-12 text-[var(--color-brand-600)] animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-fg-tertiary)]">Checking system configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-primary)] to-[var(--color-bg-secondary)] p-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-8 mb-6">
          <h1 className="text-3xl font-bold text-[var(--color-fg-primary)] mb-2">Docker Setup</h1>
          <p className="text-[var(--color-fg-tertiary)]">Check and install Docker and Docker Compose</p>
        </div>

        {error && (
          <div className="bg-[var(--color-error-50)] border border-[var(--color-error-200)] rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--color-error-600)] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--color-error-800)]">{error}</p>
          </div>
        )}

        {systemInfo && (
          <>
            {/* System Info */}
            <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">System Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[var(--color-fg-tertiary)]">Operating System</p>
                  <p className="text-lg font-medium text-[var(--color-fg-primary)] capitalize">{systemInfo.os}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-fg-tertiary)]">Architecture</p>
                  <p className="text-lg font-medium text-[var(--color-fg-primary)]">{systemInfo.arch}</p>
                </div>
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Docker Status */}
              <div className={`rounded-lg p-6 ${systemInfo.docker.installed ? 'bg-[var(--color-success-50)] border border-[var(--color-success-200)]' : 'bg-[var(--color-warning-50)] border border-[var(--color-warning-200)]'}`}>
                <div className="flex items-start gap-3 mb-3">
                  {systemInfo.docker.installed ? (
                    <Check className="w-6 h-6 text-[var(--color-success-600)] flex-shrink-0" />
                  ) : (
                    <X className="w-6 h-6 text-[var(--color-warning-600)] flex-shrink-0" />
                  )}
                  <div>
                    <h3 className={`font-semibold ${systemInfo.docker.installed ? 'text-[var(--color-success-900)]' : 'text-[var(--color-warning-900)]'}`}>
                      Docker
                    </h3>
                    {systemInfo.docker.version && (
                      <p className={`text-sm ${systemInfo.docker.installed ? 'text-[var(--color-success-700)]' : 'text-[var(--color-warning-700)]'}`}>
                        v{systemInfo.docker.version}
                      </p>
                    )}
                  </div>
                </div>
                <p className={`text-sm ${systemInfo.docker.installed ? 'text-[var(--color-success-700)]' : 'text-[var(--color-warning-700)]'}`}>
                  {systemInfo.docker.installed ? 'Installed' : 'Not installed'}
                </p>
              </div>

              {/* Docker Compose Status */}
              <div className={`rounded-lg p-6 ${systemInfo.docker_compose.installed ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <div className="flex items-start gap-3 mb-3">
                  {systemInfo.docker_compose.installed ? (
                    <Check className="w-6 h-6 text-[var(--color-success-600)] flex-shrink-0" />
                  ) : (
                    <X className="w-6 h-6 text-[var(--color-warning-600)] flex-shrink-0" />
                  )}
                  <div>
                    <h3 className={`font-semibold ${systemInfo.docker_compose.installed ? 'text-[var(--color-success-900)]' : 'text-[var(--color-warning-900)]'}`}>
                      Docker Compose
                    </h3>
                    {systemInfo.docker_compose.version && (
                      <p className={`text-sm ${systemInfo.docker_compose.installed ? 'text-[var(--color-success-700)]' : 'text-[var(--color-warning-700)]'}`}>
                        v{systemInfo.docker_compose.version}
                      </p>
                    )}
                  </div>
                </div>
                <p className={`text-sm ${systemInfo.docker_compose.installed ? 'text-[var(--color-success-700)]' : 'text-[var(--color-warning-700)]'}`}>
                  {systemInfo.docker_compose.installed ? 'Installed' : 'Not installed'}
                </p>
              </div>
            </div>

            {/* Ready Status */}
            <div className={`rounded-lg p-6 mb-6 ${systemInfo.ready ? 'bg-[var(--color-success-50)] border border-[var(--color-success-200)]' : 'bg-[var(--color-warning-50)] border border-[var(--color-warning-200)]'}`}>
              <div className="flex items-start gap-3">
                {systemInfo.ready ? (
                  <CheckCircle className="w-6 h-6 text-[var(--color-success-600)] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-[var(--color-warning-600)] flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h3 className={`font-semibold ${systemInfo.ready ? 'text-[var(--color-success-900)]' : 'text-[var(--color-warning-900)]'}`}>
                    {systemInfo.ready ? 'System Ready' : 'System Not Ready'}
                  </h3>
                  <p className={`text-sm mt-1 ${systemInfo.ready ? 'text-[var(--color-success-700)]' : 'text-[var(--color-warning-700)]'}`}>
                    {systemInfo.ready
                      ? 'Docker and Docker Compose are installed and ready to use.'
                      : 'Please install Docker and Docker Compose to use this application.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Installation Instructions */}
            {installCommands && !systemInfo.ready && (
              <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Installation Instructions</h2>
                <p className="text-[var(--color-fg-tertiary)] mb-4">Run the following commands to install Docker and Docker Compose:</p>

                <div className="space-y-4">
                  {installCommands.commands && installCommands.commands.map((cmd: any, idx: number) => (
                    <div key={idx} className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
                      <h3 className="font-medium text-[var(--color-fg-primary)] mb-2">{cmd.component}</h3>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-[var(--color-gray-900)] text-[var(--color-success-400)] p-3 rounded font-mono text-sm overflow-x-auto">
                          {cmd.command}
                        </code>
                        <button
                          onClick={() => copyToClipboard(cmd.command, idx)}
                          className="flex-shrink-0 p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition"
                          title="Copy to clipboard"
                        >
                          {copiedIndex === idx ? (
                            <CheckCircle className="w-5 h-5 text-[var(--color-success-600)]" />
                          ) : (
                            <Copy className="w-5 h-5 text-[var(--color-fg-tertiary)]" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {installCommands.post_install_instructions && (
                  <div className="mt-6 bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-lg p-4">
                    <h3 className="font-medium text-[var(--color-brand-900)] mb-2">Post-Installation</h3>
                    <pre className="text-sm text-[var(--color-brand-800)] whitespace-pre-wrap font-mono">
                      {installCommands.post_install_instructions}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
