import { notFound } from "next/navigation";
import LeadForm from "@/components/LeadForm";
import { getFormBySlug } from "@/lib/formsRegistry";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params; // Next 14+ async params
  const form = getFormBySlug(slug);

  if (!form || !form.locationId) return notFound();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900">{form.name}</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Please provide your contact information and we’ll get back to you
            shortly.
          </p>
          <hr className="my-6 border-gray-200" />
          {/* IMPORTANT: pass formConfig */}
          <LeadForm formSlug={form.slug} formConfig={form as any} />
        </div>
      </div>
    </main>
  );
}
