"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface CatalogFeature { id: number; name: string; description: string | null }

export default function FeaturesPage() {
  const [features, setFeatures] = useState<CatalogFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ id: 0, name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/features/catalog");
      const d = await r.json();
      setFeatures(d.features ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setForm({ id: 0, name: "", description: "" }); setDialogOpen(true); }
  function openEdit(f: CatalogFeature) { setForm({ id: f.id, name: f.name, description: f.description ?? "" }); setDialogOpen(true); }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const method = form.id ? "PUT" : "POST";
      const r = await fetch("/api/admin/features/catalog", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id || undefined, name: form.name.trim(), description: form.description.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Feature updated" : "Feature added");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const r = await fetch(`/api/admin/features/catalog?id=${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Feature removed");
    setDeleteId(null);
    load();
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Features</h1>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />Add Feature</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : features.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No features yet. Add your first feature above.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {features.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{f.name}</p>
                      {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                    </div>
                    <button type="button" onClick={() => openEdit(f)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground shrink-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setDeleteId(f.id)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit Feature" : "Add Feature"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priority support" autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description shown in plans" />
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
            <DialogHeader><DialogTitle>Remove Feature</DialogTitle></DialogHeader>
            <p className="text-sm">This removes the feature from the catalog. Existing plans that include it are not affected.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
