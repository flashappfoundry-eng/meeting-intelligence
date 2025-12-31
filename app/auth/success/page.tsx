import { TrustBanner } from "@/app/auth/TrustBanner";

export default async function OAuthSuccessPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const platform = Array.isArray(sp.platform) ? sp.platform[0] : sp.platform;

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h1 className="text-xl font-semibold">Connected</h1>
      <p className="mt-2 text-sm text-secondary">
        {platform ? `${platform} connected successfully.` : "Account connected successfully."}
      </p>
      <p className="mt-3 text-sm">You can now go back to ChatGPT and continue.</p>
      <TrustBanner />
    </div>
  );
}


