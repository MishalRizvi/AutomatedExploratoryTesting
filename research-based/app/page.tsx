import TestRunner from '@/components/TestRunner'

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <TestRunner />
      </div>
    </main>
  )
}