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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface SchoolSettings {
  sessionStartMonth: number;
  termsPerYear: number;
  invoicePrefix: string;
  invoiceFooterText: string | null;
  principalName: string | null;
  address: string | null;
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
          <SettingsTab readOnly={!isAdmin} />
        </TabsContent>
        <TabsContent value="late-fee" className="pt-4">
          <LateFeeTab readOnly={!isAdmin} />
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

function SettingsTab({ readOnly }: { readOnly: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sessionStartMonth: '4',
    termsPerYear: '2',
    invoicePrefix: 'INV',
    invoiceFooterText: '',
    principalName: '',
    address: '',
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
          });
        }
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/api/finance/setup/settings', {
        sessionStartMonth: Number(form.sessionStartMonth),
        termsPerYear: Number(form.termsPerYear),
        invoicePrefix: form.invoicePrefix,
        invoiceFooterText: form.invoiceFooterText || undefined,
        principalName: form.principalName || undefined,
        address: form.address || undefined,
      });
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
                disabled={readOnly}
                value={form.sessionStartMonth}
                onChange={(e) => setForm((f) => ({ ...f, sessionStartMonth: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Terms Per Year</Label>
              <Input
                type="number"
                min={1}
                disabled={readOnly}
                value={form.termsPerYear}
                onChange={(e) => setForm((f) => ({ ...f, termsPerYear: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Invoice Prefix</Label>
            <Input
              disabled={readOnly}
              value={form.invoicePrefix}
              onChange={(e) => setForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Principal Name</Label>
            <Input
              disabled={readOnly}
              value={form.principalName}
              onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              disabled={readOnly}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Invoice Footer Text</Label>
            <Textarea
              disabled={readOnly}
              value={form.invoiceFooterText}
              onChange={(e) => setForm((f) => ({ ...f, invoiceFooterText: e.target.value }))}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {readOnly ? (
            <p className="text-xs text-muted-foreground">Only a school admin can edit these settings.</p>
          ) : (
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function LateFeeTab({ readOnly }: { readOnly: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setSaving(true);
    try {
      await api.post('/api/finance/setup/late-fee-rule', {
        gracePeriodDays: Number(form.gracePeriodDays),
        finePerPeriod: Number(form.finePerPeriod),
        periodDays: Number(form.periodDays),
      });
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
                disabled={readOnly}
                value={form.gracePeriodDays}
                onChange={(e) => setForm((f) => ({ ...f, gracePeriodDays: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Fine Per Period (PKR)</Label>
              <Input
                type="number"
                min={0}
                disabled={readOnly}
                value={form.finePerPeriod}
                onChange={(e) => setForm((f) => ({ ...f, finePerPeriod: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Period Length (days)</Label>
              <Input
                type="number"
                min={1}
                disabled={readOnly}
                value={form.periodDays}
                onChange={(e) => setForm((f) => ({ ...f, periodDays: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            After the grace period, a fine of PKR {form.finePerPeriod || 0} is charged for every{' '}
            {form.periodDays || 0}-day period the payment is late.
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {readOnly ? (
            <p className="text-xs text-muted-foreground">Only a school admin can edit this rule.</p>
          ) : (
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Rule'}
            </Button>
          )}
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

function DiscountPoliciesTab() {
  const [policies, setPolicies] = useState<DiscountPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountPolicy | null>(null);
  const [form, setForm] = useState({
    name: '',
    discountPercent: '',
    eligibilityCriteria: '',
    marksThreshold: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  function openAddDialog() {
    setEditing(null);
    setForm({ name: '', discountPercent: '', eligibilityCriteria: '', marksThreshold: '' });
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(policy: DiscountPolicy) {
    setEditing(policy);
    setForm({
      name: policy.name,
      discountPercent: String(policy.discountPercent),
      eligibilityCriteria: policy.eligibilityCriteria ?? '',
      marksThreshold: policy.marksThreshold != null ? String(policy.marksThreshold) : '',
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const body = {
        name: form.name,
        discountPercent: Number(form.discountPercent),
        eligibilityCriteria: form.eligibilityCriteria || undefined,
        marksThreshold: form.marksThreshold ? Number(form.marksThreshold) : undefined,
      };
      if (editing) {
        await api.patch(`/api/finance/discount-policies/${editing.id}`, body);
      } else {
        await api.post('/api/finance/discount-policies', body);
      }
      setDialogOpen(false);
      await loadPolicies();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save policy.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(policy: DiscountPolicy) {
    try {
      if (policy.isActive) {
        await api.delete(`/api/finance/discount-policies/${policy.id}`);
      } else {
        await api.patch(`/api/finance/discount-policies/${policy.id}`, { isActive: true });
      }
      await loadPolicies();
    } catch {
      setError('Failed to update policy.');
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Discount Policies</CardTitle>
        <Button size="sm" onClick={openAddDialog}>
          + Add Policy
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No discount policies yet.</p>
        ) : (
          <div className="space-y-2">
            {policies.map((policy) => (
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
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(policy)}>
                    Edit
                  </Button>
                  <Button
                    variant={policy.isActive ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() => handleToggleActive(policy)}
                  >
                    {policy.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Discount Policy' : 'Add Discount Policy'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Discount Percent</Label>
              <Input
                type="number"
                min={0}
                max={100}
                required
                value={form.discountPercent}
                onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Eligibility Criteria (optional)</Label>
              <Textarea
                value={form.eligibilityCriteria}
                onChange={(e) => setForm((f) => ({ ...f, eligibilityCriteria: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Marks Threshold (optional)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.marksThreshold}
                onChange={(e) => setForm((f) => ({ ...f, marksThreshold: e.target.value }))}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Policy'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
