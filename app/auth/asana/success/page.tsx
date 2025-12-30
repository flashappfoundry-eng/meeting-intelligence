import { TrustBanner } from "@/app/auth/TrustBanner";

export default function AsanaOAuthSuccessPage() {
  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h1 className="text-xl font-semibold">Asana connected</h1>
      <p className="mt-2 text-sm text-secondary">
        Your Asana account is connected successfully.
      </p>
      <p className="mt-3 text-sm">
        You can now go back to ChatGPT and ask about your meetings.
      </p>
      <TrustBanner />
    </div>
  );
}


