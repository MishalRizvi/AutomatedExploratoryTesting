import UrlInputForm from "@/components/forms/url-input-form";

export default function Home() {
  return (
    // main is the wrapper element with Tailwind CSS classes:
    <main className="container mx-auto p-4 py-8">
      <h1 className="text-2xl font-bold text-center mb-8">Automated Exploratory Testing</h1>
      {/* This renders our form component */}
      <UrlInputForm />
    </main>
  )
}