import { Layout } from '../../components/layout/Layout'

export function CLIPage() {
  return (
    <Layout>
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Framework CLI</h1>
        <p className="text-slate-500 mb-6">
          The <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">spine-framework</code> CLI runs locally in your terminal or agentic IDE.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-sm text-slate-700 space-y-1 mb-4">
          <div><span className="text-slate-400">$</span> npx spine-framework --help</div>
          <div><span className="text-slate-400">$</span> npx spine-framework auth whoami</div>
          <div><span className="text-slate-400">$</span> npx spine-framework migrations list</div>
          <div><span className="text-slate-400">$</span> npx spine-framework pipelines run &lt;id&gt;</div>
          <div><span className="text-slate-400">$</span> npx spine-framework items list --type support_ticket</div>
          <div><span className="text-slate-400">$</span> npx spine-framework doctor</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Full CLI reference documentation coming soon.
        </div>
      </div>
    </Layout>
  )
}
