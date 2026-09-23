"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface Plan { id: number; name: string; monthlyPrice: number; yearlyPrice: number; features: string; active: boolean }
interface CatalogFeature { id: number; name: string; description: string | null }

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [catalog, setCatalog] = useState<CatalogFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ id: 0, name: "", monthlyPrice: "", yearlyPrice: "", features: [] as string[] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, cr] = await Promise.all([
        fetch("/api/admin/subscriptions"),
        fetch("/api/admin/features/catalog"),
      ]);
      const [pd, cd] = await Promise.all([pr.json(), cr.json()]);
      setPlans(pd.plans ?? []);
      setCatalog(cd.features ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function parsedFeatures(raw: string): string[] {
    try { return JSON.parse(raw); } catch { return []; }
  }

  function openNew() {
    setForm({ id: 0, name: "", monthlyPrice: "", yearlyPrice: "", features: [] });
    setDialogOpen(true);
  }

  function openEdit(p: Plan) {
    setForm({ id: p.id, name: p.name, monthlyPrice: String(p.monthlyPrice), yearlyPrice: String(p.yearlyPrice), features: parsedFeatures(p.features) });
    setDialogOpen(true);
  }

  function toggleFeature(name: string) {
    setForm(f => ({
      ...f,
      features: f.features.includes(name) ? f.features.filter(x => x !== name) : [...f.features, name],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const r = await fetch("/api/admin/subscriptions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, monthlyPrice: Number(form.monthlyPrice), yearlyPrice: Number(form.yearlyPrice) }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Plan updated" : "Plan created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const r = await fetch(`/api/admin/subscriptions?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Plan deleted");
    setDeleteId(null);
    load();
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Subscriptions</h1>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" /> New Plan</Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No plans yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map(p => {
              const featureList = parsedFeatures(p.features);
              return (
                <Card key={p.id}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm font-medium">
                      ${(p.monthlyPrice / 100).toFixed(2)}<span className="text-muted-foreground font-normal">/mo</span>
                      <span className="text-muted-foreground font-normal mx-1">·</span>
                      ${(p.yearlyPrice / 100).toFixed(2)}<span className="text-muted-foreground font-normal">/yr</span>
                    </p>
                    {featureList.length > 0 && (
                      <ul className="space-y-1">
                        {featureList.map(f => (
                          <li key={f} className="flex items-start gap-1.5 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Edit Plan" : "New Plan"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Starter" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Monthly Price (cents)</Label>
                  <Input type="number" value={form.monthlyPrice} onChange={e => setForm(f => ({ ...f, monthlyPrice: e.target.value }))} placeholder="900" />
                  {form.monthlyPrice && <p className="text-xs text-muted-foreground">${(Number(form.monthlyPrice) / 100).toFixed(2)}/mo</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Yearly Price (cents)</Label>
                  <Input type="number" value={form.yearlyPrice} onChange={e => setForm(f => ({ ...f, yearlyPrice: e.target.value }))} placeholder="9000" />
                  {form.yearlyPrice && <p className="text-xs text-muted-foreground">${(Number(form.yearlyPrice) / 100).toFixed(2)}/yr</p>}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Features {form.features.length > 0 && <span className="text-muted-foreground font-normal">({form.features.length} selected)</span>}</Label>
                {catalog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No features in catalog. Add features under Settings → Plan Features first.</p>
                ) : (
                  <div className="rounded-lg border divide-y divide-border max-h-56 overflow-y-auto">
                    {catalog.map(f => {
                      const checked = form.features.includes(f.name);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleFeature(f.name)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50 ${checked ? "bg-primary/5" : ""}`}
                        >
                          <div className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${checked ? "bg-primary border-primary" : "border-border"}`}>
                            {checked && <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-primary-foreground"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{f.name}</p>
                            {f.description && <p className="text-xs text-muted-foreground leading-tight mt-0.5">{f.description}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Plan</DialogTitle></DialogHeader>
            <p className="text-sm">This will permanently delete the plan.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
