import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - Meeting Intelligence',
  description: 'How Meeting Intelligence handles your data',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-gray-600 mt-2">Meeting Intelligence by FlashApp Foundry</p>
          <p className="text-sm text-gray-500 mt-1">Last updated: January 3, 2026</p>
        </div>

        {/* Quick Summary Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <h2 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <span>⚡</span> Quick Summary
          </h2>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">✓</span>
              <span>Your meeting data stays between you, Zoom, and Asana</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">✓</span>
              <span>We don&apos;t store your transcripts or meeting content</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">✓</span>
              <span>You can disconnect your accounts anytime</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-1">✓</span>
              <span>No data is sold to third parties</span>
            </li>
          </ul>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* What We Access */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">📋</span> What We Access
            </h2>
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Platform</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Data Accessed</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-3 font-medium">Zoom</td>
                    <td className="px-4 py-3 text-gray-600">Meeting list, recordings, transcripts</td>
                    <td className="px-4 py-3 text-gray-600">Generate summaries & action items</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Asana</td>
                    <td className="px-4 py-3 text-gray-600">Workspaces, projects</td>
                    <td className="px-4 py-3 text-gray-600">Create tasks from action items</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Google/Microsoft</td>
                    <td className="px-4 py-3 text-gray-600">Email, name, profile picture</td>
                    <td className="px-4 py-3 text-gray-600">Sign you in securely</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* What We Store */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">💾</span> What We Store
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-medium text-green-800 mb-2">✓ We Store</h3>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Your account email</li>
                  <li>• OAuth tokens (encrypted)</li>
                  <li>• Connection preferences</li>
                </ul>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-medium text-red-800 mb-2">✗ We Don&apos;t Store</h3>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• Meeting transcripts</li>
                  <li>• Video/audio recordings</li>
                  <li>• Task content after creation</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Flow */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">🔄</span> How Your Data Flows
            </h2>
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center">
                <div className="bg-white rounded-lg p-4 shadow-sm flex-1">
                  <div className="text-2xl mb-2">💬</div>
                  <div className="font-medium">ChatGPT</div>
                  <div className="text-xs text-gray-500">You ask a question</div>
                </div>
                <div className="text-gray-400">→</div>
                <div className="bg-white rounded-lg p-4 shadow-sm flex-1">
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="font-medium">Meeting Intelligence</div>
                  <div className="text-xs text-gray-500">Routes your request</div>
                </div>
                <div className="text-gray-400">→</div>
                <div className="bg-white rounded-lg p-4 shadow-sm flex-1">
                  <div className="text-2xl mb-2">📹 / ✅</div>
                  <div className="font-medium">Zoom / Asana</div>
                  <div className="text-xs text-gray-500">Fetches or creates data</div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-4 text-center">
                Meeting content is processed in real-time and not stored on our servers.
              </p>
            </div>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">🔐</span> Your Rights
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white border rounded-lg">
                <span className="text-xl">🔌</span>
                <div>
                  <h3 className="font-medium">Disconnect Anytime</h3>
                  <p className="text-sm text-gray-600">Remove Zoom or Asana connections from your settings page</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white border rounded-lg">
                <span className="text-xl">🗑️</span>
                <div>
                  <h3 className="font-medium">Delete Your Data</h3>
                  <p className="text-sm text-gray-600">Email us at support@flashappfoundry.com to delete your account</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white border rounded-lg">
                <span className="text-xl">📧</span>
                <div>
                  <h3 className="font-medium">Contact Us</h3>
                  <p className="text-sm text-gray-600">Questions? Reach out at privacy@flashappfoundry.com</p>
                </div>
              </div>
            </div>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">🛡️</span> Security Measures
            </h2>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-gray-700">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                OAuth tokens encrypted with AES-256-GCM
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                All connections use HTTPS/TLS
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                No passwords stored - OAuth only
              </li>
              <li className="flex items-center gap-2 text-gray-700">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Hosted on Vercel with SOC 2 compliance
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-gray-500">
          <p>Meeting Intelligence is a product of FlashApp Foundry</p>
          <p className="mt-2">
            <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
            {' · '}
            <Link href="/settings" className="text-blue-600 hover:underline">Manage Connections</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

