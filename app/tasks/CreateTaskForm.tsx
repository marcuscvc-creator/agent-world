"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";

type Agent = { id: string; name: string; role: string };

export function CreateTaskForm({ agents }: { agents: Agent[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: "", goal: "", agentId: agents[0]?.id ?? "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.goal || !form.agentId) return;
    setLoading(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOpen(false);
      setForm({ title: "", goal: "", agentId: agents[0]?.id ?? "" });
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 font-mono text-xs text-[#c4b5fd] hover:bg-[#7c3aed]/20"
      >
        <Plus size={13} /> New Task
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-md rounded border border-[#2a1f3d] bg-[#0f0d1a] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-sm text-[#fff1a8]">New Task</p>
              <button type="button" onClick={() => setOpen(false)}>
                <X size={16} className="text-[#7a7090]" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-xs text-[#8fe0ff]">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Research competitor pricing"
                  className="w-full rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2 text-sm text-[#f7f1dc] outline-none focus:border-[#7c3aed]/60 placeholder:text-[#4a4060]"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-xs text-[#8fe0ff]">Goal</label>
                <textarea
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="Find the top 5 competitors in the AI writing space and summarize their pricing..."
                  rows={3}
                  className="w-full rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2 text-sm text-[#f7f1dc] outline-none focus:border-[#7c3aed]/60 placeholder:text-[#4a4060]"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-xs text-[#8fe0ff]">Assign to agent</label>
                <select
                  value={form.agentId}
                  onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                  className="w-full rounded border border-[#2a1f3d] bg-[#181622] px-3 py-2 text-sm text-[#f7f1dc] outline-none focus:border-[#7c3aed]/60"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 py-2 font-mono text-xs text-[#c4b5fd] hover:bg-[#7c3aed]/20 disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {loading ? "Creating…" : "Create Task"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[#2a1f3d] px-4 py-2 font-mono text-xs text-[#7a7090] hover:text-[#d7ddc8]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
