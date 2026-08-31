'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface SchoolSettings {
  sessionStartMonth: number;
  termsPerYear: number;
  invoicePrefix: string;
  invoiceFooterText: string | null;
  principalName: string | null;
  address: string | null;
  phone: string | null;
}

interface LateFeeRule {
  gracePeriodDays: number;
  finePerPeriod: number;
  periodDays: number;
  isActive: boolean;
}

interface DiscountPolicy {
  id: string;
  name: string;
  discountPercent: number;
  eligibilityCriteria: string | null;
  marksThreshold: number | null;
  isActive: boolean;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function FinanceSetupPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'school_admin');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Finance Setup</h1>
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">School Settings</TabsTrigger>
          <TabsTrigger value="late-fee">Late Fee Rule</TabsTrigger>
          <TabsTrigger value="discounts">Discount Policies</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">Finance Team</TabsTrigger>}
        </TabsList>
        <TabsContent value="settings" className="pt-4">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="late-fee" className="pt-4">
          <LateFeeTab />
        </TabsContent>
        <TabsContent value="discounts" className="pt-4">
          <DiscountPoliciesTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="team" className="pt-4">
            <FinanceTeamTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    sessionStartMonth: '4',
    termsPerYear: '2',
    invoicePrefix: 'INV',
    invoiceFooterText: '',
    principalName: '',
    address: '',
    phone: '',
  });

  useEffect(() => {
    api
      .get<{ success: boolean; data: SchoolSettings | null }>('/api/finance/setup/settings')
      .then((res) => {
        const s = res.data.data;
        if (s) {
          setForm({
            sessionStartMonth: String(s.sessionStartMonth),
            termsPerYear: String(s.termsPerYear),
            invoicePrefix: s.invoicePrefix,
            invoiceFooterText: s.invoiceFooterText ?? '',
            principalName: s.principalName ?? '',
            address: s.address ?? '',
            phone: s.phone ?? '',
          });
        }
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await api.patch('/api/finance/setup/settings', {
        sessionStartMonth: Number(form.sessionStartMonth),
        termsPerYear: Number(form.termsPerYear),
        invoicePrefix: form.invoicePrefix,
        invoiceFooterText: form.invoiceFooterText || undefined,
        principalName: form.principalName || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save settings.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">School Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Session Start Month (1-12)</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={form.sessionStartMonth}
                onChange={(e) => setForm((f) => ({ ...f, sessionStartMonth: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Terms Per Year</Label>
              <Input
                type="number"
                min={1}
                value={form.termsPerYear}
                onChange={(e) => setForm((f) => ({ ...f, termsPerYear: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Invoice Prefix</Label>
            <Input
              value={form.invoicePrefix}
              onChange={(e) => setForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Principal Name</Label>
            <Input
              value={form.principalName}
              onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Invoice Footer Text</Label>
            <Textarea
              value={form.invoiceFooterText}
              onChange={(e) => setForm((f) => ({ ...f, invoiceFooterText: e.target.value }))}
            />
          </div>
          {success && <p className="text-sm text-green-700">Settings saved.</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LateFeeTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ gracePeriodDays: '5', finePerPeriod: '1000', periodDays: '5' });

  useEffect(() => {
    api
      .get<{ success: boolean; data: LateFeeRule | null }>('/api/finance/setup/late-fee-rule')
      .then((res) => {
        const r = res.data.data;
        if (r) {
          setForm({
            gracePeriodDays: String(r.gracePeriodDays),
            finePerPeriod: String(r.finePerPeriod),
            periodDays: String(r.periodDays),
          });
        }
      })
      .catch(() => setError('Failed to load late fee rule.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await api.patch('/api/finance/setup/late-fee-rule', {
        gracePeriodDays: Number(form.gracePeriodDays),
        finePerPeriod: Number(form.finePerPeriod),
        periodDays: Number(form.periodDays),
      });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save late fee rule.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Late Fee Rule</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Grace Period (days)</Label>
              <Input
                type="number"
                min={0}
                value={form.gracePeriodDays}
                onChange={(e) => setForm((f) => ({ ...f, gracePeriodDays: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Fine Per Period (PKR)</Label>
              <Input
                type="number"
                min={0}
                value={form.finePerPeriod}
                onChange={(e) => setForm((f) => ({ ...f, finePerPeriod: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Period Length (days)</Label>
              <Input
                type="number"
                min={1}
                value={form.periodDays}
                onChange={(e) => setForm((f) => ({ ...f, periodDays: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            After the grace period, a fine of PKR {form.finePerPeriod || 0} is charged for every{' '}
            {form.periodDays || 0}-day period the payment is late.
          </p>
          {success && <p className="text-sm text-green-700">Rule saved.</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Rule'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FinanceTeamTab() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/finance/create-user', form);
      setSuccess(`Finance account created for ${form.email}. A welcome email has been sent.`);
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create finance user.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Finance Team Member</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          {success && <p className="text-sm text-green-700">{success}</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Finance Account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const EMPTY_POLICY_FORM = { name: '', discountPercent: '', eligibilityCriteria: '', marksThreshold: '' };

function DiscountPoliciesTab() {
  const [policies, setPolicies] = useState<DiscountPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_POLICY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_POLICY_FORM);
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadPolicies() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { policies: DiscountPolicy[] } }>(
        '/api/finance/discount-policies'
      );
      setPolicies(res.data.data.policies);
    } catch {
      setError('Failed to load discount policies.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  function startEdit(policy: DiscountPolicy) {
    setEditingId(policy.id);
    setEditForm({
      name: policy.name,
      discountPercent: String(policy.discountPercent),
      eligibilityCriteria: policy.eligibilityCriteria ?? '',
      marksThreshold: policy.marksThreshold != null ? String(policy.marksThreshold) : '',
    });
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    setSavingId(id);
    try {
      await api.patch(`/api/finance/discount-policies/${id}`, {
        name: editForm.name,
        discountPercent: Number(editForm.discountPercent),
        eligibilityCriteria: editForm.eligibilityCriteria || undefined,
        marksThreshold: editForm.marksThreshold ? Number(editForm.marksThreshold) : undefined,
      });
      setEditingId(null);
      await loadPolicies();
    } catch (err) {
      setEditError(getErrorMessage(err, 'Failed to save policy.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(policy: DiscountPolicy) {
    try {
      await api.delete(`/api/finance/discount-policies/${policy.id}`);
      await loadPolicies();
    } catch {
      setError('Failed to delete policy.');
    }
  }

  async function handleReactivate(policy: DiscountPolicy) {
    try {
      await api.patch(`/api/finance/discount-policies/${policy.id}`, { isActive: true });
      await loadPolicies();
    } catch {
      setError('Failed to reactivate policy.');
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setNewError(null);
    setCreating(true);
    try {
      await api.post('/api/finance/discount-policies', {
        name: newForm.name,
        discountPercent: Number(newForm.discountPercent),
        eligibilityCriteria: newForm.eligibilityCriteria || undefined,
        marksThreshold: newForm.marksThreshold ? Number(newForm.marksThreshold) : undefined,
      });
      setNewForm(EMPTY_POLICY_FORM);
      setAddingNew(false);
      await loadPolicies();
    } catch (err) {
      setNewError(getErrorMessage(err, 'Failed to create policy.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discount Policies</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-3">
            {policies.length === 0 && !addingNew && (
              <p className="text-sm text-muted-foreground">No discount policies yet.</p>
            )}

            {policies.map((policy) =>
              editingId === policy.id ? (
                <div key={policy.id} className="space-y-3 rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Discount %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.discountPercent}
                        onChange={(e) => setEditForm((f) => ({ ...f, discountPercent: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Eligibility Notes (optional)</Label>
                    <Input
                      value={editForm.eligibilityCriteria}
                      onChange={(e) => setEditForm((f) => ({ ...f, eligibilityCriteria: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Marks Threshold (optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={editForm.marksThreshold}
                      onChange={(e) => setEditForm((f) => ({ ...f, marksThreshold: e.target.value }))}
                    />
                  </div>
                  {editError && (
                    <p className="text-sm text-destructive" role="alert">
                      {editError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={savingId === policy.id} onClick={() => saveEdit(policy.id)}>
                      {savingId === policy.id ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={policy.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">{policy.name}</span>
                    <Badge variant="outline">{policy.discountPercent}%</Badge>
                    {!policy.isActive && <Badge variant="secondary">Inactive</Badge>}
                    {policy.eligibilityCriteria && (
                      <span className="text-sm text-muted-foreground">{policy.eligibilityCriteria}</span>
                    )}
                    {policy.marksThreshold != null && (
                      <span className="text-xs text-muted-foreground">Marks ≥ {policy.marksThreshold}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(policy)}>
                      Edit
                    </Button>
                    {policy.isActive ? (
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(policy)}>
                        Delete
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleReactivate(policy)}>
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              )
            )}

            {addingNew ? (
              <form onSubmit={handleCreate} className="space-y-3 rounded-md border border-dashed p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      required
                      value={newForm.name}
                      onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Discount %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={newForm.discountPercent}
                      onChange={(e) => setNewForm((f) => ({ ...f, discountPercent: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Eligibility Notes (optional)</Label>
                  <Input
                    value={newForm.eligibilityCriteria}
                    onChange={(e) => setNewForm((f) => ({ ...f, eligibilityCriteria: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marks Threshold (optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={newForm.marksThreshold}
                    onChange={(e) => setNewForm((f) => ({ ...f, marksThreshold: e.target.value }))}
                  />
                </div>
                {newError && (
                  <p className="text-sm text-destructive" role="alert">
                    {newError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={creating}>
                    {creating ? 'Creating...' : 'Create Policy'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddingNew(false);
                      setNewForm(EMPTY_POLICY_FORM);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAddingNew(true)}>
                + Add New Policy
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
