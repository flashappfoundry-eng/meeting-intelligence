import { TrustBanner } from "@/app/auth/TrustBanner";

export default async function OAuthErrorPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h1 className="text-xl font-semibold">Connection failed</h1>
      <p className="mt-2 text-sm text-secondary">
        {error ? `Error: ${error}` : "Something went wrong while connecting."}
      </p>
      <p className="mt-3 text-sm">You can go back to ChatGPT and try again.</p>
      <TrustBanner />
    </div>
  );
}


