import { Layout } from '../../components/layout/Layout'

export function APIPage() {
  return (
    <Layout>
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Framework API</h1>
        <p className="text-slate-500 mb-6">
          Core API endpoints available to all authenticated users and custom applications.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          API reference documentation coming soon.
        </div>
      </div>
    </Layout>
  )
}
