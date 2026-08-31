'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DiscountDraft {
  name: string;
  discountPercent: string;
  eligibilityCriteria: string;
  marksThreshold: string;
}

const STEP_LABELS = ['School Information', 'Late Fee Rule', 'Discount Policies', 'Review & Complete'];

const SUGGESTED_POLICIES: DiscountDraft[] = [
  { name: 'Orphan', discountPercent: '90', eligibilityCriteria: '', marksThreshold: '' },
  { name: 'Scholarship', discountPercent: '50', eligibilityCriteria: '', marksThreshold: '90' },
  { name: 'Kinship', discountPercent: '40', eligibilityCriteria: '', marksThreshold: '' },
];

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function FinanceWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [schoolName, setSchoolName] = useState('');

  const [settingsForm, setSettingsForm] = useState({
    principalName: '',
    address: '',
    phone: '',
    invoicePrefix: 'INV',
    invoiceFooterText: '',
  });

  const [lateFeeForm, setLateFeeForm] = useState({
    gracePeriodDays: '5',
    finePerPeriod: '1000',
    periodDays: '5',
  });

  const [policies, setPolicies] = useState<DiscountDraft[]>(SUGGESTED_POLICIES);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { name: string } }>('/api/finance/school-info')
      .then((res) => setSchoolName(res.data.data.name))
      .catch(() => setSchoolName(''))
      .finally(() => setLoadingSchool(false));
  }, []);

  function updatePolicy(index: number, patch: Partial<DiscountDraft>) {
    setPolicies((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPolicy() {
    setPolicies((prev) => [
      ...prev,
      { name: '', discountPercent: '', eligibilityCriteria: '', marksThreshold: '' },
    ]);
  }

  function removePolicy(index: number) {
    setPolicies((prev) => prev.filter((_, i) => i !== index));
  }

  function handleStep1Submit(e: FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  function handleStep2Submit(e: FormEvent) {
    e.preventDefault();
    setStep(3);
  }

  function handleStep3Submit(e: FormEvent) {
    e.preventDefault();
    setStep(4);
  }

  async function handleComplete() {
    setError(null);
    setCompleting(true);
    try {
      await api.post('/api/finance/setup/settings', {
        principalName: settingsForm.principalName || undefined,
        address: settingsForm.address || undefined,
        phone: settingsForm.phone || undefined,
        invoicePrefix: settingsForm.invoicePrefix || undefined,
        invoiceFooterText: settingsForm.invoiceFooterText || undefined,
      });

      await api.post('/api/finance/setup/late-fee-rule', {
        gracePeriodDays: Number(lateFeeForm.gracePeriodDays),
        finePerPeriod: Number(lateFeeForm.finePerPeriod),
        periodDays: Number(lateFeeForm.periodDays),
      });

      const validPolicies = policies.filter((p) => p.name.trim() && p.discountPercent.trim());
      for (const p of validPolicies) {
        await api.post('/api/finance/discount-policies', {
          name: p.name,
          discountPercent: Number(p.discountPercent),
          eligibilityCriteria: p.eligibilityCriteria || undefined,
          marksThreshold: p.marksThreshold ? Number(p.marksThreshold) : undefined,
        });
      }

      router.push('/finance');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to complete setup. Please try again.'));
      setCompleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Finance Setup Wizard</h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s get your school&apos;s finance module configured before you start.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary text-primary'
                      : 'border text-muted-foreground'
                }`}
              >
                {done ? '✓' : n}
              </div>
              {n < STEP_LABELS.length && <div className={`h-px flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          );
        })}
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        Step {step} of {STEP_LABELS.length} — {STEP_LABELS[step - 1]}
      </p>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">School Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input value={loadingSchool ? 'Loading...' : schoolName} disabled readOnly />
              </div>
              <div className="space-y-2">
                <Label>Principal Name</Label>
                <Input
                  value={settingsForm.principalName}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, principalName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  value={settingsForm.address}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={settingsForm.phone}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Prefix</Label>
                <Input
                  value={settingsForm.invoicePrefix}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Footer Text (optional)</Label>
                <Textarea
                  value={settingsForm.invoiceFooterText}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, invoiceFooterText: e.target.value }))}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit">Next →</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Late Fee Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStep2Submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Grace Period (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={lateFeeForm.gracePeriodDays}
                    onChange={(e) => setLateFeeForm((f) => ({ ...f, gracePeriodDays: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fine Per Period (PKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={lateFeeForm.finePerPeriod}
                    onChange={(e) => setLateFeeForm((f) => ({ ...f, finePerPeriod: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Period Length (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={lateFeeForm.periodDays}
                    onChange={(e) => setLateFeeForm((f) => ({ ...f, periodDays: e.target.value }))}
                  />
                </div>
              </div>
              <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                After {lateFeeForm.gracePeriodDays || 0} days, Rs. {lateFeeForm.finePerPeriod || 0} charged
                every {lateFeeForm.periodDays || 0} days.
              </p>
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button type="submit">Next →</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discount Policies</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStep3Submit} className="space-y-4">
              <div className="space-y-4">
                {policies.map((policy, i) => (
                  <div key={i} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Policy {i + 1}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePolicy(i)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={policy.name}
                          onChange={(e) => updatePolicy(i, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Discount %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={policy.discountPercent}
                          onChange={(e) => updatePolicy(i, { discountPercent: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Eligibility Notes (optional)</Label>
                      <Input
                        value={policy.eligibilityCriteria}
                        onChange={(e) => updatePolicy(i, { eligibilityCriteria: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Marks Threshold (optional)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={policy.marksThreshold}
                        onChange={(e) => updatePolicy(i, { marksThreshold: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addPolicy}>
                + Add Policy
              </Button>
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <Button type="submit">Next →</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <div className="font-medium">School Information</div>
              <div className="text-muted-foreground">School: {schoolName || '—'}</div>
              <div className="text-muted-foreground">Principal: {settingsForm.principalName || '—'}</div>
              <div className="text-muted-foreground">Address: {settingsForm.address || '—'}</div>
              <div className="text-muted-foreground">Phone: {settingsForm.phone || '—'}</div>
              <div className="text-muted-foreground">Invoice Prefix: {settingsForm.invoicePrefix}</div>
            </div>
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <div className="font-medium">Late Fee Rule</div>
              <div className="text-muted-foreground">
                After {lateFeeForm.gracePeriodDays} days, Rs. {lateFeeForm.finePerPeriod} charged every{' '}
                {lateFeeForm.periodDays} days.
              </div>
            </div>
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <div className="font-medium">Discount Policies</div>
              {policies.filter((p) => p.name.trim()).length === 0 ? (
                <div className="text-muted-foreground">None added.</div>
              ) : (
                policies
                  .filter((p) => p.name.trim())
                  .map((p, i) => (
                    <div key={i} className="text-muted-foreground">
                      {p.name} — {p.discountPercent}%{p.marksThreshold ? ` (marks ≥ ${p.marksThreshold})` : ''}
                    </div>
                  ))
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(3)} disabled={completing}>
                ← Back
              </Button>
              <Button onClick={handleComplete} disabled={completing}>
                {completing ? 'Completing Setup...' : 'Complete Setup'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
