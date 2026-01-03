import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Meeting Intelligence',
  description: 'Terms of Service for Meeting Intelligence ChatGPT App',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-100">Terms of Service</h1>
          <p className="text-slate-400 mt-2">Meeting Intelligence by FlashApp Foundry</p>
          <p className="text-sm text-slate-500 mt-1">Last updated: January 2026</p>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Acceptance of Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">📜</span> Acceptance of Terms
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed">
                By accessing or using Meeting Intelligence (&quot;the Service&quot;), you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, please do not use the Service. These terms apply to all users, 
                including visitors, registered users, and anyone who accesses the Service through ChatGPT or other integrations.
              </p>
            </div>
          </section>

          {/* Description of Service */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">⚡</span> Description of Service
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                Meeting Intelligence is a ChatGPT-integrated application that helps you work more efficiently with your meetings. 
                Our Service provides the following capabilities:
              </p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong className="text-slate-200">Meeting Summaries:</strong> Automatically generates concise summaries of your Zoom meetings from transcripts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong className="text-slate-200">Action Item Extraction:</strong> Identifies and extracts action items and follow-ups from meeting discussions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span><strong className="text-slate-200">Task Creation:</strong> Creates tasks in Asana based on extracted action items for seamless project management</span>
                </li>
              </ul>
            </div>
          </section>

          {/* User Responsibilities */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">👤</span> User Responsibilities
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">As a user of Meeting Intelligence, you agree to:</p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>Provide accurate information when connecting your accounts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>Maintain the security of your connected accounts and credentials</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>Use the Service only for lawful purposes and in compliance with applicable laws</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>Obtain necessary consent from meeting participants when processing their data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>Not attempt to circumvent, disable, or interfere with the Service&apos;s security features</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">🔗</span> Third-Party Services
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                Meeting Intelligence integrates with third-party services to provide its functionality. 
                By using our Service, you acknowledge and agree to the following:
              </p>
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h3 className="font-medium text-slate-200 mb-2 flex items-center gap-2">
                    <span>📹</span> Zoom
                  </h3>
                  <p className="text-sm text-slate-400">
                    We access your Zoom account to retrieve meeting information, recordings, and transcripts. 
                    Your use of Zoom is governed by Zoom&apos;s own terms of service and privacy policy.
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h3 className="font-medium text-slate-200 mb-2 flex items-center gap-2">
                    <span>✅</span> Asana
                  </h3>
                  <p className="text-sm text-slate-400">
                    We access your Asana account to create tasks on your behalf. 
                    Your use of Asana is governed by Asana&apos;s own terms of service and privacy policy.
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h3 className="font-medium text-slate-200 mb-2 flex items-center gap-2">
                    <span>🤖</span> OpenAI
                  </h3>
                  <p className="text-sm text-slate-400">
                    We use OpenAI&apos;s services to process and analyze meeting content for generating summaries and extracting action items. 
                    Content processed by OpenAI is subject to OpenAI&apos;s terms and policies.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Data Handling */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">🔒</span> Data Handling
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                We take your privacy seriously. Our data handling practices are designed to protect your information 
                while providing you with valuable meeting insights.
              </p>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  For detailed information about how we collect, use, and protect your data, please review our{' '}
                  <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                    Privacy Policy
                  </Link>.
                </p>
              </div>
            </div>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">©️</span> Intellectual Property
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                The Service, including its original content, features, and functionality, is owned by FlashApp Foundry 
                and is protected by international copyright, trademark, and other intellectual property laws.
              </p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-1">•</span>
                  <span>You retain all rights to your meeting content and data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-1">•</span>
                  <span>Generated summaries and action items are provided for your personal or business use</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-1">•</span>
                  <span>You may not copy, modify, or distribute the Service&apos;s software without permission</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Limitation of Liability
            </h2>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                To the maximum extent permitted by applicable law:
              </p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>The Service is provided &quot;as is&quot; without warranties of any kind, express or implied</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>We do not guarantee the accuracy of AI-generated summaries or action items</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>We are not liable for any indirect, incidental, special, or consequential damages</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>Our total liability shall not exceed the amount paid by you for the Service, if any</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">🚫</span> Termination
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                Either party may terminate this agreement at any time:
              </p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-1">•</span>
                  <span><strong className="text-slate-200">You</strong> can stop using the Service and disconnect your accounts at any time through the settings page</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-1">•</span>
                  <span><strong className="text-slate-200">We</strong> may suspend or terminate your access if you violate these terms or for any reason with reasonable notice</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-1">•</span>
                  <span>Upon termination, your stored tokens and preferences will be deleted</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">📝</span> Changes to Terms
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed">
                We reserve the right to modify these Terms of Service at any time. We will provide notice of significant 
                changes by updating the &quot;Last updated&quot; date at the top of this page. Your continued use of the Service 
                after any changes constitutes acceptance of the new terms. We encourage you to review these terms periodically.
              </p>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="text-2xl">📧</span> Contact Information
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-300 leading-relaxed mb-4">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-slate-300">
                  <span className="text-slate-500">✉️</span>
                  <span>Email: <a href="mailto:legal@flashappfoundry.com" className="text-blue-400 hover:text-blue-300">legal@flashappfoundry.com</a></span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <span className="text-slate-500">🏢</span>
                  <span>Company: FlashApp Foundry</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-700 text-center text-sm text-slate-500">
          <p>Meeting Intelligence is a product of FlashApp Foundry</p>
          <p className="mt-1 text-slate-600">Last updated: January 2026</p>
          <p className="mt-3">
            <Link href="/privacy" className="text-blue-400 hover:text-blue-300 hover:underline">Privacy Policy</Link>
            {' · '}
            <Link href="/settings" className="text-blue-400 hover:text-blue-300 hover:underline">Manage Connections</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

